<script lang="ts">
    import { connectionsMap } from "./state.svelte";

    type MarkerStart = "up" | "down" | "dot" | null;
    type MarkerEnd = "dot" | null;
    /** Same width (px) as the response card's fade-left. The line fades from
     *  alpha 0 → opacity over this width starting at the clip's left edge. */
    const FADE_WIDTH = 32;
    interface PathData {
        id: string;
        d: string;
        color?: string;
        dasharray?: string;
        opacity?: number;
        // 'up'/'down': source escapes fromClipSel above/below — line starts at the
        //   clip edge with an arrow marker hinting "scroll to see source".
        // 'dot': normal start. null: no marker (trunk / left fade).
        markerStart: MarkerStart;
        markerEnd: MarkerEnd;
        /** When set, stroke uses a linearGradient that fades in over x ~ x+FADE_WIDTH. */
        fadeStartX?: number;
    }
    let paths: PathData[] = $state([]);

    function parseRgb(s: string): [number, number, number] | null {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
        if (parts.length < 3 || parts.some((v) => !Number.isFinite(v)))
            return null;
        return [parts[0], parts[1], parts[2]];
    }
    function avgRgb(colors: string[]): string | undefined {
        const valid = colors
            .map(parseRgb)
            .filter((v): v is [number, number, number] => v !== null);
        if (valid.length === 0) return colors[0];
        const r = Math.round(
            valid.reduce((s, c) => s + c[0], 0) / valid.length,
        );
        const g = Math.round(
            valid.reduce((s, c) => s + c[1], 0) / valid.length,
        );
        const b = Math.round(
            valid.reduce((s, c) => s + c[2], 0) / valid.length,
        );
        return `rgb(${r}, ${g}, ${b})`;
    }

    type Pt = { x: number; y: number };

    function buildPath(from: Pt, to: Pt, goingRight: boolean): string {
        const dx = Math.max(40, Math.abs(to.x - from.x) * 0.5);
        const c1x = goingRight ? from.x + dx : from.x - dx;
        const c2x = goingRight ? to.x - dx : to.x + dx;
        return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
    }

    /**
     * Clamp the `from` rect against hClip (horizontal) and vClip (vertical).
     * The two clips may differ (e.g. token lines use hClip = current rollout
     * body, vClip = entire scroll-area).
     *  - Fully past hClip's left edge while heading right → start at hClip.left (clamped:"left", fade-in)
     *  - Fully past hClip's right edge → null (no current use case)
     *  - Past vClip top/bottom → start at vClip's top/bottom edge (▲/▼)
     *  - Otherwise: original right/left edge center
     */
    function clampFrom(
        from: DOMRect,
        hClip: DOMRect | null,
        vClip: DOMRect | null,
        goingRight: boolean,
    ): {
        pt: Pt;
        clamped: "top" | "bottom" | "left" | "none";
    } | null {
        const fx = goingRight ? from.right : from.left;
        // Horizontal hClip bounds.
        if (hClip && from.right <= hClip.left) {
            if (!goingRight) return null;
            return {
                pt: { x: hClip.left, y: from.top + from.height / 2 },
                clamped: "left",
            };
        }
        if (hClip && from.left >= hClip.right) return null;
        // Vertical vClip bounds.
        if (vClip && from.bottom < vClip.top) {
            return { pt: { x: fx, y: vClip.top }, clamped: "top" };
        }
        if (vClip && from.top > vClip.bottom) {
            return { pt: { x: fx, y: vClip.bottom }, clamped: "bottom" };
        }
        return {
            pt: { x: fx, y: from.top + from.height / 2 },
            clamped: "none",
        };
    }

    function clampToMarker(
        c: "top" | "bottom" | "left" | "none",
    ): MarkerStart {
        if (c === "top") return "up";
        if (c === "bottom") return "down";
        if (c === "none") return "dot";
        return null; // "left" → no marker (gradient fade-in handles it)
    }

    /**
     * Final alpha for a line, decided in TS so CSS isn't involved.
     *  - explicit opacity → use as-is
     *  - vertical clamp (▲/▼) → 0.45 (slightly faded "scroll to see" hint)
     *  - currentColor (no color) → 0.15 (default ink lines stay subtle)
     *  - any other colored line → 0.6
     */
    function effectiveOpacity(
        color: string | undefined,
        explicit: number | undefined,
        isVerticalClamp: boolean,
    ): number {
        if (explicit !== undefined) return explicit;
        if (isVerticalClamp) return 0.45;
        if (!color || color === "currentColor") return 0.15;
        return 0.6;
    }

    function update() {
        const next: PathData[] = [];
        for (const c of connectionsMap.values()) {
            const b = document.querySelector(c.toSel);
            if (!b) continue;
            const br = b.getBoundingClientRect();
            if (br.width === 0 && br.height === 0) continue;

            const sels = Array.isArray(c.fromSel) ? c.fromSel : [c.fromSel];
            const fromEntries: { el: Element; rect: DOMRect }[] = [];
            for (const sel of sels) {
                const a = document.querySelector(sel);
                if (!a) continue;
                const ar = a.getBoundingClientRect();
                if (ar.width === 0 && ar.height === 0) continue;
                fromEntries.push({ el: a, rect: ar });
            }
            if (fromEntries.length === 0) continue;

            // Determine direction from the average source center.
            const avgFromCx =
                fromEntries.reduce(
                    (s, r) => s + r.rect.left + r.rect.width / 2,
                    0,
                ) / fromEntries.length;
            const toCx = br.left + br.width / 2;
            const goingRight = toCx >= avgFromCx;

            const tx = goingRight ? br.left : br.right;
            const ty = br.top + br.height / 2;

            // toClip: hide only when the destination anchor goes past the clip's
            // left edge. Right/top/bottom escapes don't hide — the line stays.
            if (c.toClipSel) {
                const clip = document.querySelector(c.toClipSel);
                if (clip) {
                    const cr = clip.getBoundingClientRect();
                    if (tx < cr.left) continue;
                }
            }

            // Horizontal clip (basis for left fade) / vertical clip (▲/▼ clamp basis).
            // Falls back to hClip when vClip is unset (back-compat).
            const hClipEl = c.fromClipSel
                ? document.querySelector(c.fromClipSel)
                : null;
            const hClipRect = hClipEl
                ? hClipEl.getBoundingClientRect()
                : null;
            const vClipSel = c.fromVClipSel ?? c.fromClipSel;
            const vClipEl = vClipSel ? document.querySelector(vClipSel) : null;
            const vClipRect = vClipEl
                ? vClipEl.getBoundingClientRect()
                : null;

            const sources: {
                pt: Pt;
                markerStart: MarkerStart;
                isLeftClamp: boolean;
                color?: string;
                opacity?: number;
            }[] = [];
            for (const { el, rect } of fromEntries) {
                const fromInfo = clampFrom(
                    rect,
                    hClipRect,
                    vClipRect,
                    goingRight,
                );
                if (!fromInfo) continue;
                const srcColor = c.colorFromSource
                    ? getComputedStyle(el).color
                    : undefined;
                let srcOpacity: number | undefined;
                if (c.opacityFromSource) {
                    const raw = el.getAttribute("data-line-opacity");
                    const v = raw !== null ? parseFloat(raw) : NaN;
                    if (Number.isFinite(v)) srcOpacity = v;
                }
                sources.push({
                    pt: fromInfo.pt,
                    markerStart: clampToMarker(fromInfo.clamped),
                    isLeftClamp: fromInfo.clamped === "left",
                    color: srcColor,
                    opacity: srcOpacity,
                });
            }
            if (sources.length === 0) continue;

            // Single source: same as before (colorFromSource uses source color).
            // left-clamp uses the fade-in stroke gradient.
            if (sources.length === 1) {
                const s = sources[0];
                const color = s.color ?? c.color;
                const isVClamp =
                    s.markerStart === "up" || s.markerStart === "down";
                next.push({
                    id: c.id,
                    d: buildPath(s.pt, { x: tx, y: ty }, goingRight),
                    color,
                    dasharray: c.dasharray,
                    opacity: effectiveOpacity(
                        color,
                        s.opacity ?? c.opacity,
                        isVClamp,
                    ),
                    markerStart: s.markerStart,
                    markerEnd: "dot",
                    fadeStartX:
                        s.isLeftClamp && hClipRect
                            ? hClipRect.left
                            : undefined,
                });
                continue;
            }

            // Fan-in: each source → junction (branch), junction → anchor (trunk).
            // Default junction sits ~80px from sources (short branches, long trunk).
            // junctionPosition (0..1) overrides this: fraction along source→target.
            // buildPath's tangents at both ends are horizontal so branches and trunk
            // join smoothly at the junction.
            const cx = sources.reduce((s, x) => s + x.pt.x, 0) / sources.length;
            const cy = sources.reduce((s, x) => s + x.pt.y, 0) / sources.length;
            const dx = tx - cx;
            const dy = ty - cy;
            const dist = Math.hypot(dx, dy);
            const ratio = c.junctionPosition !== undefined
                ? Math.max(0, Math.min(1, c.junctionPosition))
                : dist > 0 ? Math.max(0.1, 80 / dist) : 0;
            const jx = cx + ratio * dx;
            const jy = cy + ratio * dy;

            const trunkColor = c.colorFromSource
                ? avgRgb(
                      sources
                          .map((s) => s.color)
                          .filter((s): s is string => !!s),
                  )
                : c.color;
            const opacityValues = sources
                .map((s) => s.opacity)
                .filter((v): v is number => v !== undefined);
            const trunkOpacity =
                c.opacityFromSource && opacityValues.length > 0
                    ? opacityValues.reduce((a, b) => a + b, 0) /
                      opacityValues.length
                    : c.opacity;

            sources.forEach((s, i) => {
                const branchColor = s.color ?? c.color;
                const isVClamp =
                    s.markerStart === "up" || s.markerStart === "down";
                next.push({
                    id: `${c.id}__b${i}`,
                    d: buildPath(s.pt, { x: jx, y: jy }, goingRight),
                    color: branchColor,
                    dasharray: c.dasharray,
                    opacity: effectiveOpacity(
                        branchColor,
                        s.opacity ?? c.opacity,
                        isVClamp,
                    ),
                    markerStart: s.markerStart,
                    markerEnd: null,
                    fadeStartX:
                        s.isLeftClamp && hClipRect
                            ? hClipRect.left
                            : undefined,
                });
            });
            next.push({
                id: `${c.id}__trunk`,
                d: buildPath({ x: jx, y: jy }, { x: tx, y: ty }, goingRight),
                color: trunkColor,
                dasharray: c.dasharray,
                opacity: effectiveOpacity(trunkColor, trunkOpacity, false),
                markerStart: null,
                markerEnd: "dot",
            });
        }
        paths = next;
    }

    $effect(() => {
        if (connectionsMap.size === 0) {
            paths = [];
            return;
        }
        let raf = 0;
        const tick = () => {
            update();
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    });
</script>

<svg class="cross-pane-connections" aria-hidden="true">
    <defs>
        <marker
            id="cpc-dot"
            viewBox="0 0 6 6"
            refX="3"
            refY="3"
            markerWidth="6"
            markerHeight="6"
            markerUnits="userSpaceOnUse"
        >
            <circle cx="3" cy="3" r="2.2" fill="context-stroke" />
        </marker>
        <!-- ▲ Triangle pointing up; shown when the source is clipped above. -->
        <marker
            id="cpc-up"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="10"
            markerHeight="10"
            markerUnits="userSpaceOnUse"
            orient="auto"
        >
            <path d="M 5 1 L 9 8 L 1 8 Z" fill="context-stroke" />
        </marker>
        <!-- ▼ Triangle pointing down; shown when the source is clipped below. -->
        <marker
            id="cpc-down"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="10"
            markerHeight="10"
            markerUnits="userSpaceOnUse"
            orient="auto"
        >
            <path d="M 5 9 L 1 2 L 9 2 Z" fill="context-stroke" />
        </marker>
    </defs>
    <defs>
        {#each paths as p (p.id)}
            {#if p.fadeStartX !== undefined}
                <linearGradient
                    id={`cpc-fade-${p.id}`}
                    gradientUnits="userSpaceOnUse"
                    x1={p.fadeStartX}
                    x2={p.fadeStartX + FADE_WIDTH}
                >
                    <stop
                        offset="0"
                        stop-color={p.color ?? "currentColor"}
                        stop-opacity="0"
                    />
                    <stop
                        offset="1"
                        stop-color={p.color ?? "currentColor"}
                        stop-opacity={p.opacity}
                    />
                </linearGradient>
            {/if}
        {/each}
    </defs>
    {#each paths as p (p.id)}
        <path
            d={p.d}
            stroke={p.fadeStartX !== undefined
                ? `url(#cpc-fade-${p.id})`
                : (p.color ?? "currentColor")}
            stroke-width="1.4"
            stroke-dasharray={p.dasharray ?? null}
            fill="none"
            vector-effect="non-scaling-stroke"
            style:opacity={p.fadeStartX !== undefined ? 1 : (p.opacity ?? null)}
            marker-start={p.markerStart === "up"
                ? "url(#cpc-up)"
                : p.markerStart === "down"
                  ? "url(#cpc-down)"
                  : p.markerStart === "dot"
                    ? "url(#cpc-dot)"
                    : null}
            marker-end={p.markerEnd === "dot" ? "url(#cpc-dot)" : null}
        />
    {/each}
</svg>

<style lang="scss">
    .cross-pane-connections {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 50;
        color: $c-ink-2;
        overflow: visible;
    }
    // Path opacity is applied inline from PathData.opacity (see effectiveOpacity).
</style>
