<script lang="ts">
    import { onMount } from "svelte";
    import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
    import { select } from "d3-selection";
    import { untrack } from "svelte";
    import {
        algoExplainer,
        setTransform,
        fit,
        resetAll,
        SCALE_RANGE,
        setCardPositions,
    } from "./state.svelte";
    import { fitToView } from "./layout";
    import Card from "./Card.svelte";
    import ZoomControls from "./ZoomControls.svelte";
    import Edges from "./Edges.svelte";
    import { zoomBy } from "./state.svelte";
    import { ALGORITHMS } from "./loader";
    import { deriveDiff } from "./diff/derive";
    import type { CardDescriptor, DiffEdge } from "./diff/types";

    interface Props {
        slotValues?: Map<string, string>;
        tokenObjectiveColor?: string | null;
    }
    let {
        slotValues = new Map(),
        tokenObjectiveColor = null,
    }: Props = $props();

    let viewportEl: HTMLDivElement | undefined = $state();
    let contentEl: HTMLDivElement | undefined = $state();
    let zoomBehavior: ZoomBehavior<HTMLDivElement, unknown> | null = null;

    function currentViewport() {
        const el = viewportEl;
        if (!el) return { width: 0, height: 0 };
        return { width: el.clientWidth, height: el.clientHeight };
    }

    onMount(() => {
        if (!viewportEl) return;
        const sel = select(viewportEl);
        zoomBehavior = zoom<HTMLDivElement, unknown>()
            .scaleExtent(SCALE_RANGE)
            // d3-zoom calls preventDefault on pointerdown which blocks native click.
            // Exclude gestures starting on a clickable formula-section from pan so click
            // still fires; wheel zoom stays enabled.
            .filter((event) => {
                if (event.ctrlKey && event.type !== "wheel") return false;
                if (event.button) return false;
                if (event.type === "wheel") return true;
                const target = event.target as Element | null;
                if (target?.closest?.(".formula-section.clickable")) return false;
                return true;
            })
            .on("zoom", (e) => {
                setTransform({ x: e.transform.x, y: e.transform.y, k: e.transform.k });
            });
        sel.call(zoomBehavior);

        // Disable d3's default dblclick zoom (no replacement handler).
        sel.on("dblclick.zoom", null);
    });

    function applyExternalTransform() {
        if (!viewportEl || !zoomBehavior) return;
        const t = algoExplainer.transform;
        select(viewportEl).call(
            zoomBehavior.transform,
            zoomIdentity.translate(t.x, t.y).scale(t.k),
        );
    }

    // Sync d3's internal transform when external state (state.fit/zoomBy) changes.
    let lastApplied = $state({ x: 0, y: 0, k: 1 });
    $effect(() => {
        const t = algoExplainer.transform;
        if (
            t.x === lastApplied.x &&
            t.y === lastApplied.y &&
            t.k === lastApplied.k
        )
            return;
        lastApplied = { ...t };
        applyExternalTransform();
    });

    // Fit once on initial algorithm/visible-card load, after the column slide transition
    // settles so viewport size is stable. Card DOM rects are measured to keep fit accurate.
    let didInitialFit = false;
    const COLUMN_TRANSITION_MS = 240;

    const compareDef = $derived(
        algoExplainer.compareWith
            ? (ALGORITHMS[algoExplainer.compareWith] ?? null)
            : null,
    );
    const diffView: { cards: CardDescriptor[]; edges: DiffEdge[] } = $derived.by(
        () => {
            const base = algoExplainer.algorithm;
            if (!base) return { cards: [], edges: [] };
            return deriveDiff(base, compareDef, algoExplainer.visibleCards);
        },
    );

    function measuredFit() {
        if (!viewportEl || !contentEl) return;
        if (!algoExplainer.algorithm) return;
        const vp = currentViewport();
        if (vp.width === 0 || vp.height === 0) return;
        const k = algoExplainer.transform.k || 1;
        const visible = diffView.cards;
        const measured = visible.map((c) => {
            const el = contentEl!.querySelector<HTMLElement>(
                `[data-card-id="${c.id}"]`,
            );
            const r = el?.getBoundingClientRect();
            return {
                id: c.id,
                title: "",
                position: algoExplainer.cardPositions.get(c.id) ?? c.position,
                sections: [],
                size: r ? { w: r.width / k, h: r.height / k } : undefined,
            };
        });
        // Use setTransform so the result is persisted.
        setTransform(
            fitToView(measured, vp, {
                padding: 24,
                scaleExtent: SCALE_RANGE,
            }),
        );
    }

    function onReset() {
        resetAll();
        // Wait one frame for cards' new coords to apply before fitting.
        setTimeout(() => measuredFit(), 0);
    }

    // Walk visible cards in edge-graph depth order and check collisions.
    // Earlier-processed cards (roots, user-dragged positions) anchor in place;
    // later cards that overlap shift to a free slot. No movement when no collision.
    const COLLISION_GAP = 20;

    function computeDepths(): Map<string, number> {
        const parents = new Map<string, string[]>();
        for (const e of diffView.edges) {
            if (!parents.has(e.toCard)) parents.set(e.toCard, []);
            parents.get(e.toCard)!.push(e.fromCard);
        }
        const depths = new Map<string, number>();
        const compute = (id: string, visiting: Set<string>): number => {
            const cached = depths.get(id);
            if (cached !== undefined) return cached;
            if (visiting.has(id)) return 0;
            visiting.add(id);
            const ps = parents.get(id);
            const d =
                ps && ps.length > 0
                    ? Math.max(...ps.map((p) => compute(p, visiting))) + 1
                    : 0;
            visiting.delete(id);
            depths.set(id, d);
            return d;
        };
        for (const c of diffView.cards) compute(c.id, new Set());
        return depths;
    }

    function resolveCollisions() {
        if (!contentEl) return;
        const cards = diffView.cards;
        if (cards.length === 0) return;
        const k = algoExplainer.transform.k || 1;
        type Box = { x: number; y: number; w: number; h: number };

        const depths = computeDepths();
        const sorted = [...cards].sort((a, b) => {
            const da = depths.get(a.id) ?? 0;
            const db = depths.get(b.id) ?? 0;
            if (da !== db) return da - db;
            return a.id.localeCompare(b.id);
        });

        const placed: Array<{ id: string; box: Box }> = [];
        const updates: Array<[string, { x: number; y: number }]> = [];

        for (const c of sorted) {
            const el = contentEl.querySelector<HTMLElement>(
                `[data-card-id="${c.id}"]`,
            );
            if (!el) continue;
            const r = el.getBoundingClientRect();
            const cur = algoExplainer.cardPositions.get(c.id) ?? c.position;
            const orig: Box = {
                x: cur.x,
                y: cur.y,
                w: r.width / k,
                h: r.height / k,
            };
            const box = findFreeSlot(orig, placed.map((p) => p.box));
            placed.push({ id: c.id, box });
            if (cur.x !== box.x || cur.y !== box.y) {
                updates.push([c.id, { x: box.x, y: box.y }]);
            }
        }
        if (updates.length > 0) setCardPositions(updates);
    }

    function overlap(
        a: { x: number; y: number; w: number; h: number },
        b: { x: number; y: number; w: number; h: number },
    ): boolean {
        return !(
            a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y
        );
    }

    /**
     * Find the closest non-colliding spot to orig. For each collider produce 4 minimum-slide
     * candidates (up/down/left/right) and pick the one nearest to orig. Repeat if the new
     * position still overlaps another collider.
     */
    function findFreeSlot(
        orig: { x: number; y: number; w: number; h: number },
        placed: Array<{ x: number; y: number; w: number; h: number }>,
    ): { x: number; y: number; w: number; h: number } {
        let box = { ...orig };
        let safety = 64;
        while (safety-- > 0) {
            const colliders = placed.filter((p) => overlap(p, box));
            if (colliders.length === 0) return box;
            let best: { x: number; y: number; w: number; h: number } | null = null;
            let bestDist = Infinity;
            for (const c of colliders) {
                const candidates = [
                    { ...box, y: c.y - box.h - COLLISION_GAP },
                    { ...box, y: c.y + c.h + COLLISION_GAP },
                    { ...box, x: c.x - box.w - COLLISION_GAP },
                    { ...box, x: c.x + c.w + COLLISION_GAP },
                ];
                for (const cand of candidates) {
                    const dx = cand.x - orig.x;
                    const dy = cand.y - orig.y;
                    const d = dx * dx + dy * dy;
                    if (d < bestDist) {
                        bestDist = d;
                        best = cand;
                    }
                }
            }
            if (!best) return box;
            box = best;
        }
        return box;
    }

    $effect(() => {
        diffView.cards;
        diffView.edges;
        if (!viewportEl) return;
        queueMicrotask(() => untrack(() => resolveCollisions()));
    });

    // Card size changes also trigger collision resolve (content change → resize → possible overlap).
    let resizeObs: ResizeObserver | null = null;
    let observed: Set<HTMLElement> = new Set();
    function syncResizeObs() {
        if (!resizeObs || !contentEl) return;
        const next = new Set<HTMLElement>();
        contentEl
            .querySelectorAll<HTMLElement>("[data-card-id]")
            .forEach((el) => next.add(el));
        next.forEach((el) => {
            if (!observed.has(el)) resizeObs!.observe(el);
        });
        observed.forEach((el) => {
            if (!next.has(el)) resizeObs!.unobserve(el);
        });
        observed = next;
    }
    $effect(() => {
        if (!contentEl) return;
        resizeObs?.disconnect();
        resizeObs = new ResizeObserver(() => {
            queueMicrotask(() => untrack(() => resolveCollisions()));
        });
        observed = new Set();
        syncResizeObs();
        return () => {
            resizeObs?.disconnect();
            resizeObs = null;
        };
    });
    $effect(() => {
        diffView.cards;
        queueMicrotask(() => syncResizeObs());
    });

    // Initial fit: only fit if no transform was restored from localStorage.
    $effect(() => {
        if (didInitialFit) return;
        if (!viewportEl) return;
        if (!algoExplainer.algorithm) return;
        if (algoExplainer.visibleCards.size === 0) return;

        const hasStored =
            algoExplainer.transform.x !== 0 ||
            algoExplainer.transform.y !== 0 ||
            algoExplainer.transform.k !== 1;

        const handle = window.setTimeout(() => {
            if (!hasStored) measuredFit();
            didInitialFit = true;
        }, COLUMN_TRANSITION_MS);
        return () => clearTimeout(handle);
    });
</script>

<div class="canvas-viewport" bind:this={viewportEl}>
    <div
        class="canvas-content"
        bind:this={contentEl}
        style:zoom={algoExplainer.transform.k}
        style:transform="translate({algoExplainer.transform.x / algoExplainer.transform.k}px, {algoExplainer.transform.y / algoExplainer.transform.k}px)"
    >
        {#each diffView.cards as descriptor (descriptor.id)}
            <Card {descriptor} {slotValues} {tokenObjectiveColor} />
        {/each}
    </div>
    <Edges {viewportEl} edges={diffView.edges} />
    <ZoomControls
        onZoomIn={() => zoomBy(1.2, currentViewport())}
        onZoomOut={() => zoomBy(1 / 1.2, currentViewport())}
        onReset={onReset}
    />
</div>

<style lang="scss">
    .canvas-viewport {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background: transparent;
        cursor: grab;
        &:active {
            cursor: grabbing;
        }
    }
    .canvas-content {
        position: absolute;
        top: 0;
        left: 0;
        width: 1px;
        height: 1px;
        transform-origin: 0 0;
        will-change: transform;
        overflow: visible;
    }
</style>
