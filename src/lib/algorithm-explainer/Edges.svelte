<script lang="ts">
    import { algoExplainer } from "./state.svelte";
    import type { DiffEdge } from "./diff/types";

    // Card-to-card connector style. "straight" is V-H-V manhattan; "curve" is an S-curve
    // through the same waypoint via cubic Bezier. Cast keeps both branches reachable.
    const EDGE_STYLE = "straight" as "straight" | "curve";

    interface Props {
        viewportEl: HTMLDivElement | undefined;
        edges: DiffEdge[];
    }
    let { viewportEl, edges }: Props = $props();

    interface Path {
        edgeKey: string;
        d: string;
        kind: "shared" | "base-only" | "compare-only";
    }

    let paths: Path[] = $state([]);

    function recompute() {
        const root = viewportEl;
        if (!root) {
            paths = [];
            return;
        }
        const rootRect = root.getBoundingClientRect();

        const next: Path[] = [];
        for (const e of edges) {
            const fromCardEl = root.querySelector<HTMLElement>(
                `[data-card-id="${e.fromCard}"]`,
            );
            const toCardEl = root.querySelector<HTMLElement>(
                `[data-card-id="${e.toCard}"]`,
            );
            if (!fromCardEl || !toCardEl) continue;
            const termEl = fromCardEl.querySelector<HTMLElement>(
                `.term--${e.fromTermId}`,
            );
            if (!termEl) continue;
            const targetEl: HTMLElement = e.toSectionId
                ? toCardEl.querySelector<HTMLElement>(
                      `[data-section-id="${e.toSectionId}"]`,
                  ) ?? toCardEl
                : toCardEl;

            const tr = termEl.getBoundingClientRect();
            const cr = targetEl.getBoundingClientRect();
            // Pick a side by comparing term/sub-card centers in viewport coords.
            const tcx = tr.left + tr.width / 2;
            const tcy = tr.top + tr.height / 2;
            const ccx = cr.left + cr.width / 2;
            const ccy = cr.top + cr.height / 2;
            const dx = ccx - tcx;
            const dy = ccy - tcy;

            let fromX: number;
            let fromY: number;
            let toX: number;
            let toY: number;
            let d: string;

            // Vertical-first V-H-V manhattan: leave term up/down, move horizontally at
            // mid-y, enter sub-card from top/bottom.
            fromX = tcx;
            toX = ccx;
            if (dy >= 0) {
                fromY = tr.bottom; // term bottom
                toY = cr.top; // sub-card top
            } else {
                fromY = tr.top;
                toY = cr.bottom;
            }
            {
                const midY = (fromY + toY) / 2;
                const fX = Math.round(fromX - rootRect.left);
                const fY = Math.round(fromY - rootRect.top);
                const tX = Math.round(toX - rootRect.left);
                const tY = Math.round(toY - rootRect.top);
                const mY = Math.round(midY - rootRect.top);
                // Arrow points from sub-card → term, so we draw the path starting at the
                // card side (tX,tY) and ending at the term side (fX,fY) so marker-end places
                // the arrowhead at the term.
                if (EDGE_STYLE === "curve") {
                    // Control points at midY give vertical tangents at both endpoints,
                    // producing a smooth S-curve.
                    d = `M ${tX} ${tY} C ${tX} ${mY}, ${fX} ${mY}, ${fX} ${fY}`;
                } else {
                    d = `M ${tX} ${tY} L ${tX} ${mY} L ${fX} ${mY} L ${fX} ${fY}`;
                }
            }
            next.push({
                edgeKey: `${e.fromCard}:${e.fromTermId}->${e.toCard}:${e.toSectionId ?? ""}`,
                d,
                kind: e.kind,
            });
        }
        paths = next;
    }

    let observer: ResizeObserver | null = null;
    let observed: Set<HTMLElement> = new Set();

    function syncObservers() {
        if (!observer || !viewportEl) return;
        const next = new Set<HTMLElement>();
        const cards = viewportEl.querySelectorAll<HTMLElement>("[data-card-id]");
        cards.forEach((el) => next.add(el));
        next.forEach((el) => {
            if (!observed.has(el)) observer!.observe(el);
        });
        observed.forEach((el) => {
            if (!next.has(el)) observer!.unobserve(el);
        });
        observed = next;
    }

    $effect(() => {
        if (!viewportEl) return;
        observer?.disconnect();
        observer = new ResizeObserver(() => recompute());
        observed = new Set();
        observer.observe(viewportEl);
        syncObservers();
        return () => {
            observer?.disconnect();
            observer = null;
        };
    });

    $effect(() => {
        edges;
        algoExplainer.visibleCards;
        algoExplainer.transform;
        algoExplainer.cardPositions;
        queueMicrotask(() => {
            syncObservers();
            recompute();
        });
    });
</script>

<svg class="edges" aria-hidden="true">
    <defs>
        <marker
            id="ae-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
        >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
    </defs>
    {#each paths as p (p.edgeKey)}
        <path
            d={p.d}
            class={p.kind}
            stroke="currentColor"
            stroke-width="1.2"
            vector-effect="non-scaling-stroke"
            shape-rendering={EDGE_STYLE === "curve" ? "geometricPrecision" : "crispEdges"}
            fill="none"
            marker-end="url(#ae-arrow)"
        />
    {/each}
</svg>

<style lang="scss">
    .edges {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: visible;
        color: $c-ink-2;
        opacity: 0.18;
    }
    .edges path.shared {
        color: $c-ink-2;
    }
</style>
