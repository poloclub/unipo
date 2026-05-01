// Register/lookup DOM elements by id. The arrow overlay uses this registry
// to draw paths. Svelte actions register on mount and remove on unmount.

const anchors = new Map<string, HTMLElement>();
let version = $state(0); // Bumped on every change — subscribers read it for reactivity.

/** Svelte use-action. Registers on mount and auto-unregisters on destroy.
 *  Usage: `<div use:registerAnchor={'my-id'}></div>`
 *
 *  An empty id is a no-op (lets callers conditionally bypass the action).
 */
export function registerAnchor(el: HTMLElement, id: string) {
	// Initial registration when id is non-empty; empty id waits for update().
	if (id) {
		anchors.set(id, el);
		version++;
	}

	return {
		update(newId: string) {
			if (newId === id) return;
			if (id && anchors.get(id) === el) {
				anchors.delete(id);
			}
			id = newId;
			if (id) {
				anchors.set(id, el);
			}
			version++;
		},
		destroy() {
			if (id && anchors.get(id) === el) {
				anchors.delete(id);
				version++;
			}
		}
	};
}

/** Lookup id → HTMLElement (null when missing). Reads version for reactive subscription. */
export function getAnchor(id: string): HTMLElement | null {
	void version;
	return anchors.get(id) ?? null;
}

/** Number of currently registered anchors (for tests / debugging). Reactive via version. */
export function anchorCount(): number {
	void version;
	return anchors.size;
}

/** Test helper: clear the entire registry. */
export function _clearAnchorsForTest() {
	anchors.clear();
	version++;
}
