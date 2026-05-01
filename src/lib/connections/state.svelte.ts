/**
 * Registry of curved connections between panels (detail panel ↔ algorithm
 * explainer). Each connection is a from/to CSS selector pair.
 * CrossPaneConnections.svelte looks up the DOM via these selectors every
 * frame and refreshes the curved paths.
 */

export interface Connection {
    id: string;
    /**
     * Single selector for one line; array for fan-in (multiple sources merging
     * into one card). With an array, each source branch meets at a junction
     * and a single trunk continues into toSel.
     */
    fromSel: string | string[];
    toSel: string;
    /** Hide the line when the destination anchor crosses this clip's left edge (right/top/bottom ignored). */
    toClipSel?: string;
    /**
     * Horizontal clip. The line's left-edge fade-in aligns to it — set to a
     * selector pointing at the body containing the source so the fade lines
     * up with the response card body's fade-left. The right edge isn't used.
     */
    fromClipSel?: string;
    /**
     * Vertical clip. When `from` escapes above/below, the line starts at this
     * clip's top/bottom edge with a ▲/▼ marker. Falls back to fromClipSel.
     */
    fromVClipSel?: string;
    /** Line color (CSS color). Defaults to currentColor (ink-2 + opacity). */
    color?: string;
    /**
     * When true, each branch reads the source DOM's computed color. The
     * trunk (fan-in) uses the RGB average of branch colors. `color` is ignored.
     */
    colorFromSource?: boolean;
    /** stroke-dasharray pattern (e.g. "4 3"). Solid when omitted. */
    dasharray?: string;
    /** Explicit opacity (0..1). Falls back to component CSS default when omitted. */
    opacity?: number;
    /**
     * When true, each branch reads the source DOM's `data-line-opacity`
     * attribute. The trunk uses the branch-opacity average. `opacity` is ignored.
     */
    opacityFromSource?: boolean;
}

// id → Connection. Only point mutations on the SvelteMap — avoid full
// reassignments like `list = filter(...)`. Reason: in the same effect flush,
// if effect A calls set() and effect B's cleanup uses a filter+reassign,
// B can run on a stale snapshot and overwrite A's write (Svelte 5 batched
// read semantics). set/delete touch only one key, so other entries are safe.
// Native Map has no reactivity, so we use SvelteMap.
import { SvelteMap } from "svelte/reactivity";
export const connectionsMap: SvelteMap<string, Connection> = new SvelteMap();

export function setConnection(c: Connection) {
    connectionsMap.set(c.id, c);
}

export function removeConnection(id: string) {
    connectionsMap.delete(id);
}

export function clearConnectionsByPrefix(prefix: string) {
    for (const id of [...connectionsMap.keys()]) {
        if (id.startsWith(prefix)) connectionsMap.delete(id);
    }
}

export function clearAllConnections() {
    connectionsMap.clear();
}
