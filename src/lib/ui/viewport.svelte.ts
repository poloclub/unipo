// Reactive view of the two device traits the layout depends on.
//
//   viewport.compact — the stacked single-column layout is active.
//   viewport.touch   — the primary input is a finger, so there is no hover.
//
// CSS uses the `compact` mixin in src/lib/styles/tokens.scss for the same condition.
// Keep COMPACT_QUERY in sync with that mixin.
import { MediaQuery } from "svelte/reactivity";

export const COMPACT_QUERY =
    "(max-width: 899px), (max-height: 599px) and (pointer: coarse)";
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

// MediaQuery reads `window` in its constructor, so it is only built in the browser.
const inBrowser = typeof window !== "undefined";
const compactQuery = inBrowser ? new MediaQuery(COMPACT_QUERY) : null;
const touchQuery = inBrowser ? new MediaQuery(TOUCH_QUERY) : null;

export const viewport = {
    get compact(): boolean {
        return compactQuery?.current ?? false;
    },
    get touch(): boolean {
        return touchQuery?.current ?? false;
    },
};
