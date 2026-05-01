import { untrack } from "svelte";
import type { AlgorithmDef, CardId, Edge } from "./schema";
import { fitToView, type Viewport } from "./layout";

interface AlgoExplainerState {
    open: boolean;
    algorithm: AlgorithmDef | null;
    visibleCards: Set<CardId>;
    edges: Edge[];
    transform: { x: number; y: number; k: number };
    cardPositions: Map<CardId, { x: number; y: number }>;
    // Diff view: comparison algorithm key. null = diff OFF.
    compareWith: string | null;
}

export const algoExplainer: AlgoExplainerState = $state({
    open: false,
    algorithm: null,
    visibleCards: new Set<CardId>(),
    edges: [],
    transform: { x: 0, y: 0, k: 1 },
    cardPositions: new Map<CardId, { x: number; y: number }>(),
    compareWith: null,
});

// Single algorithm-agnostic global key. Card IDs and view state (visibleCards, transform,
// cardPositions) are shared across all algorithms — switching algorithms changes only
// card *content*, view layout stays put.
const STORAGE_KEY = "algoExplainer:state";

interface PersistedShape {
    transform?: { x: number; y: number; k: number };
    cardPositions?: Array<[CardId, { x: number; y: number }]>;
    visibleCards?: CardId[];
    compareWith?: string | null;
}

function persist() {
    if (typeof localStorage === "undefined") return;
    try {
        const data: PersistedShape = {
            transform: algoExplainer.transform,
            cardPositions: Array.from(algoExplainer.cardPositions.entries()),
            visibleCards: Array.from(algoExplainer.visibleCards),
            compareWith: algoExplainer.compareWith,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        /* ignore */
    }
}

function restore(): PersistedShape | null {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as PersistedShape;
    } catch (e) {
        return null;
    }
}

// Recompute all edges from the current def + visibleCards. Switching algorithms
// automatically refreshes edges from the new def's terms map.
function computeEdges(def: AlgorithmDef, visible: Set<CardId>): Edge[] {
    const edges: Edge[] = [];
    for (const card of def.cards) {
        if (!visible.has(card.id) || !card.terms) continue;
        for (const [termId, link] of Object.entries(card.terms)) {
            if (!link.toCardId) continue;
            if (!visible.has(link.toCardId)) continue;
            edges.push({
                fromCard: card.id,
                fromTermId: termId,
                toCard: link.toCardId,
                toSectionId: link.toSectionId,
            });
        }
    }
    return edges;
}

export function setCardPosition(id: CardId, pos: { x: number; y: number }) {
    const next = new Map(algoExplainer.cardPositions);
    next.set(id, pos);
    algoExplainer.cardPositions = next;
    persist();
}

/** Update many card positions in a single reassign (used by the collision resolver and similar batches). */
export function setCardPositions(
    updates: Iterable<[CardId, { x: number; y: number }]>,
) {
    const next = new Map(algoExplainer.cardPositions);
    let changed = false;
    for (const [id, pos] of updates) {
        const cur = next.get(id);
        if (!cur || cur.x !== pos.x || cur.y !== pos.y) {
            next.set(id, pos);
            changed = true;
        }
    }
    if (!changed) return;
    algoExplainer.cardPositions = next;
    persist();
}

export function getCardPosition(
    id: CardId,
    fallback: { x: number; y: number },
): { x: number; y: number } {
    return algoExplainer.cardPositions.get(id) ?? fallback;
}

export function setAlgorithm(def: AlgorithmDef) {
    // setAlgorithm is called inside a $effect in +page.svelte. Reading existing state
    // here would subscribe the effect to that state, causing infinite re-runs when we
    // write back. Wrap all state reads in untrack to block dependency registration.
    untrack(() => {
        const isFirstLoad = algoExplainer.algorithm === null;
        algoExplainer.algorithm = def;

        // If base equals compare, clear compare automatically.
        if (algoExplainer.compareWith === def.id) {
            algoExplainer.compareWith = null;
        }

        if (isFirstLoad) {
            // First load: try localStorage; otherwise seed from def defaults.
            const restored = restore();
            const seed = new Map<CardId, { x: number; y: number }>();
            for (const c of def.cards) seed.set(c.id, { ...c.position });
            if (restored?.cardPositions) {
                for (const [k, v] of restored.cardPositions) seed.set(k, v);
            }
            algoExplainer.cardPositions = seed;
            // Always union with defaultVisibleCards so the algorithm's required
            // root cards (e.g. step-level) reappear even if localStorage was
            // persisted in a corrupt state without them.
            algoExplainer.visibleCards =
                restored?.visibleCards && restored.visibleCards.length > 0
                    ? new Set([
                          ...def.defaultVisibleCards,
                          ...restored.visibleCards,
                      ])
                    : new Set(def.defaultVisibleCards);
            if (restored?.transform)
                algoExplainer.transform = restored.transform;
            if (restored?.compareWith !== undefined) {
                // Clear restored compare if it matches the new base.
                algoExplainer.compareWith =
                    restored.compareWith === def.id
                        ? null
                        : restored.compareWith;
            }
        } else {
            // Algorithm switch: keep visibleCards / cardPositions / transform.
            // Seed default coords for any card IDs unique to the new def (rare).
            const next = new Map(algoExplainer.cardPositions);
            for (const c of def.cards) {
                if (!next.has(c.id)) next.set(c.id, { ...c.position });
            }
            algoExplainer.cardPositions = next;
        }

        // Recompute edges from the new def's terms map.
        algoExplainer.edges = computeEdges(def, algoExplainer.visibleCards);
    });
}

/**
 * Restore card positions, zoom/pan, and visible set to the current algorithm's defaults
 * and clear localStorage. Trigger fit-to-view separately afterward to reset transform.
 */
export function resetAll() {
    const def = algoExplainer.algorithm;
    if (!def) return;
    const seed = new Map<CardId, { x: number; y: number }>();
    for (const c of def.cards) seed.set(c.id, { ...c.position });
    algoExplainer.cardPositions = seed;
    algoExplainer.visibleCards = new Set(def.defaultVisibleCards);
    algoExplainer.compareWith = null;
    algoExplainer.edges = computeEdges(def, algoExplainer.visibleCards);
    algoExplainer.transform = { x: 0, y: 0, k: 1 };
    if (typeof localStorage !== "undefined") {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            /* ignore */
        }
    }
}

export function clearAlgorithm() {
    algoExplainer.algorithm = null;
    algoExplainer.visibleCards = new Set();
    algoExplainer.edges = [];
    algoExplainer.cardPositions = new Map();
    algoExplainer.compareWith = null;
}

export function setCompareWith(key: string | null) {
    if (key && algoExplainer.algorithm?.id === key) {
        algoExplainer.compareWith = null;
    } else {
        algoExplainer.compareWith = key;
    }
    persist();
}

export function toggleOpen() {
    algoExplainer.open = !algoExplainer.open;
}

export function setTransform(t: { x: number; y: number; k: number }) {
    algoExplainer.transform = t;
    persist();
}

const SCALE_EXTENT: [number, number] = [0.3, 2.5];
const FIT_PADDING = 24;

export function fit(viewport: Viewport) {
    const def = algoExplainer.algorithm;
    if (!def) return;
    const visible = def.cards.filter((c) =>
        algoExplainer.visibleCards.has(c.id),
    );
    algoExplainer.transform = fitToView(visible, viewport, {
        padding: FIT_PADDING,
        scaleExtent: SCALE_EXTENT,
    });
    persist();
}

export function zoomBy(factor: number, viewport?: Viewport) {
    const t = algoExplainer.transform;
    const next = Math.max(
        SCALE_EXTENT[0],
        Math.min(SCALE_EXTENT[1], t.k * factor),
    );
    if (next === t.k) return;
    if (viewport) {
        // Zoom around the viewport center.
        const cx = viewport.width / 2;
        const cy = viewport.height / 2;
        const ratio = next / t.k;
        algoExplainer.transform = {
            k: next,
            x: cx - (cx - t.x) * ratio,
            y: cy - (cy - t.y) * ratio,
        };
    } else {
        algoExplainer.transform = { ...t, k: next };
    }
    persist();
}

export const SCALE_RANGE = SCALE_EXTENT;

/**
 * Toggle a child card's visibility from a sub-card click. Default-visible cards never toggle.
 * Edges are fully recomputed against the current def afterward.
 */
export function toggleCard(targetCardId: CardId, _fromCardId: CardId) {
    const def = algoExplainer.algorithm;
    if (!def) return;
    if (def.defaultVisibleCards.includes(targetCardId)) return;

    const visible = new Set(algoExplainer.visibleCards);
    if (visible.has(targetCardId)) {
        visible.delete(targetCardId);
    } else {
        visible.add(targetCardId);
    }
    // Always include defaults so the read-modify-write here can never persist
    // a state with the algorithm's root card missing.
    for (const id of def.defaultVisibleCards) visible.add(id);
    algoExplainer.visibleCards = visible;
    algoExplainer.edges = computeEdges(def, visible);
    persist();
}

/**
 * Idempotently add a card id to visibleCards (used for auto-add on token select).
 * Always re-includes defaultVisibleCards so a stale empty read can never persist
 * a state missing the algorithm's root card.
 */
export function addVisibleCard(targetCardId: CardId) {
    const def = algoExplainer.algorithm;
    if (!def) return;
    const cur = algoExplainer.visibleCards;
    if (cur.has(targetCardId)) {
        let allDefaults = true;
        for (const id of def.defaultVisibleCards) {
            if (!cur.has(id)) {
                allDefaults = false;
                break;
            }
        }
        if (allDefaults) return;
    }
    const visible = new Set(cur);
    visible.add(targetCardId);
    for (const id of def.defaultVisibleCards) visible.add(id);
    algoExplainer.visibleCards = visible;
    algoExplainer.edges = computeEdges(def, visible);
    persist();
}
