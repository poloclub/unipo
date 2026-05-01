<script lang="ts">
    import { onMount } from "svelte";
    import katex from "katex";
    import "katex/dist/katex.min.css";
    import type { SectionDescriptor, WordSeg } from "./diff/types";
    import { slotKey } from "./bindings";
    import { toggleCard } from "./state.svelte";

    interface Props {
        section: SectionDescriptor;
        parentCardId: string;
        slotValues?: Map<string, string>;
        tooltipTerms?: Set<string>;
        /** Token heatmap color (selectedToken's token_objective), matching the detail panel. */
        tokenObjectiveColor?: string | null;
    }
    let {
        section,
        parentCardId,
        slotValues = new Map(),
        tooltipTerms = new Set<string>(),
        tokenObjectiveColor = null,
    }: Props = $props();

    let baseEl: HTMLSpanElement | undefined = $state();
    let compareEl: HTMLSpanElement | undefined = $state();

    function renderInto(el: HTMLSpanElement | undefined, src: string) {
        if (!el) return;
        katex.render(src, el, {
            displayMode: true,
            throwOnError: false,
            trust: true,
            strict: "ignore",
        });
    }

    const stacked = $derived(
        section.formula?.mode === "diff" &&
            !!section.formula.baseKatex.trim() &&
            !!section.formula.compareKatex.trim(),
    );

    function renderAll() {
        const f = section.formula;
        if (!f) {
            requestAnimationFrame(() => injectSlotBadges());
            return;
        }
        if (f.mode === "identical") {
            renderInto(baseEl, f.katex);
        } else if (!f.baseKatex.trim()) {
            // Single-side only: render the non-empty side as one line.
            renderInto(baseEl, f.compareKatex);
        } else if (!f.compareKatex.trim()) {
            renderInto(baseEl, f.baseKatex);
        } else {
            renderInto(baseEl, f.baseKatex);
            renderInto(compareEl, f.compareKatex);
        }
        requestAnimationFrame(() => injectSlotBadges());
    }

    function injectSlotBadges() {
        // Apply tooltip class to both base and compare formulas so hover works on either side.
        // Values/checks/replacements only apply to the base formula since slotValues are bound
        // to the base algorithm — injecting them into the compare formula would misrepresent it.
        const tooltipRoot = baseEl?.parentElement;
        const valueRoot = baseEl;
        if (!tooltipRoot || !valueRoot) return;

        // Clear previous value/check badges (only the base side gets badges).
        valueRoot.querySelectorAll(
            ".term-value-badge, .term-check-badge",
        ).forEach((el) => el.remove());

        // Terms with a defined tooltip always show the solid box marker.
        for (const termId of tooltipTerms) {
            tooltipRoot
                .querySelectorAll(`.term--${termId}`)
                .forEach((target) => {
                    target.classList.add("term--has-tooltip");
                });
        }

        const sid = section.id ?? null;
        const termValues = section.termValues ?? {};
        for (const [termId, slot] of Object.entries(termValues)) {
            const targets = valueRoot.querySelectorAll(`.term--${termId}`);
            const text = slotValues.get(
                slotKey(parentCardId, sid, "term", termId),
            );
            targets.forEach((target) => {
                if (slot.position === "replace") {
                    // When a value is present, replace the KaTeX-rendered term wholesale with
                    // the token text. Without a value, leave it alone — the next renderAll
                    // restores the original.
                    if (text) {
                        target.classList.add("term--replaced");
                        target.textContent = text;
                    }
                    return;
                }
                // Show the dashed box + value text only when a value is present; hide both otherwise.
                if (text) {
                    target.classList.add("term--has-value");
                    const badge = document.createElement("span");
                    badge.className = `term-value-badge ${slot.position ?? "above"}`;
                    badge.textContent = text;
                    target.appendChild(badge);
                } else {
                    target.classList.remove("term--has-value");
                }
            });
        }
        if (section.compare) {
            for (const [, termId] of Object.entries(
                section.compare.candidates,
            )) {
                const checkText = slotValues.get(
                    slotKey(parentCardId, sid, "compare-winner", termId),
                );
                if (!checkText) continue;
                const targets = valueRoot.querySelectorAll(`.term--${termId}`);
                targets.forEach((target) => {
                    const badge = document.createElement("span");
                    badge.className = "term-check-badge";
                    badge.textContent = "✓";
                    target.appendChild(badge);
                });
            }
        }
    }

    onMount(renderAll);
    $effect(() => {
        section.formula;
        slotValues;
        renderAll();
    });

    function onClick() {
        if (section.opensCardId) {
            toggleCard(section.opensCardId, parentCardId);
        }
    }

    function segClass(s: WordSeg): string {
        return s.kind === "add"
            ? "diff-add"
            : s.kind === "del"
              ? "diff-del"
              : "";
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
    class="formula-section {section.id ? `term--${section.id}` : ''}"
    class:clickable={!!section.opensCardId}
    data-section-id={section.id ?? ""}
    onclick={onClick}
>
    {#if section.label || section.header}
        <div class="head">
            <span class="head-label">
                {#each section.label ?? [] as seg, i (i)}<span
                        class={segClass(seg)}
                        >{#if seg.bold}<strong>{seg.text}</strong
                            >{:else}{seg.text}{/if}</span
                    >{/each}
                {#if section.opensCardId}
                    <svg
                        class="open-arrow"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                    >
                        <path
                            d="M5 17.59L15.59 7H9V5h10v10h-2V8.41L6.41 19 5 17.59z"
                        />
                    </svg>
                {/if}
            </span>
            {#if section.header}
                {@const headerText = slotValues.get(
                    slotKey(
                        parentCardId,
                        section.id ?? null,
                        "section-header",
                        null,
                    ),
                )}
                {#if headerText}
                    <span
                        class="section-header-value"
                        class:heatmap={section.header.style === "heatmap"}
                        style:--heatmap-color={section.header.style === "heatmap"
                            ? tokenObjectiveColor
                            : null}
                    >
                        {headerText}
                    </span>
                {/if}
            {/if}
        </div>
    {/if}
    <div class="body" class:stacked>
        <span class="math" bind:this={baseEl}></span>
        {#if stacked}
            <span class="math compare" bind:this={compareEl}></span>
        {/if}
    </div>
</div>

<style lang="scss">
    .formula-section {
        display: flex;
        flex-direction: column;
        background: $c-surface;
        border: 1px solid #c8cad0;
        border-radius: $radius-md;
        // overflow visible so the "above" value badge can extend past the top edge.
        min-width: 0;
        transition: border-color 120ms;
    }
    .formula-section.clickable {
        cursor: pointer;
        // border-color: $c-ink-3;
    }
    .formula-section.clickable:hover {
        border-color: $c-ink-1;
    }
    .open-arrow {
        display: inline-block;
        vertical-align: middle;
        margin-left: 2px;
        color: $c-ink-3;
        // transition:
        //     transform 120ms ease-out,
        //     color 120ms;
    }
    .formula-section.clickable:hover .open-arrow {
        // color: $c-ink-1;
        // transform: translate(2px, -2px);
    }
    .head {
        @include type-meta-label;
        font-size: 0.95rem;
        color: $c-ink-1;
        padding: $sp-2 $sp-4;
        // background: #f9f9fb;
        // border-bottom: 1px solid #c8cad0;
        // Left-align the label and value box together.
        display: flex;
        justify-content: center;
        align-items: center;
        gap: $sp-2;
    }
    .section-header-value {
        padding: 0 4px;
        border-radius: $radius-sm;
        color: #0a7fc2;
        font-family: $font-mono;
        font-size: 0.95rem;
        font-weight: 500;
        transition: opacity 150ms;
        // Per-token objective: use the token heatmap color as background; keep dark ink
        // text color for readability.
        &.heatmap {
            background: var(--heatmap-color, rgba(30, 77, 140, 0.12));
            color: $c-ink-1;
        }
    }
    .body {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem $sp-4;
        gap: $sp-1;
    }
    .body.stacked {
        flex-direction: column;
        align-items: stretch;
        gap: 0;
        padding: 0;
    }
    .body.stacked .math {
        // Equal-height rows (flex:1) + vertical centering so the base / compare
        // formulas in sibling sections (Aggregation vs Per-Token) line up on a
        // shared centerline regardless of intrinsic formula height.
        flex: 1;
        width: 100%;
        box-sizing: border-box;
        padding: $sp-5 $sp-4;
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .body.stacked .math.compare {
        border-top: 1px solid #c8cad0;
    }
    .math {
        display: block;
        :global(.katex) {
            font-size: 1.05rem;
            color: $c-ink-1;
        }
        :global(.katex-display) {
            margin: 0;
        }
        // Widen the fraction gap: KaTeX places the frac-line too close to numerator/denominator,
        // which visually collides with term boxes (especially the dashed underline). The first
        // and last vlist children are denominator/numerator — push them with transform to add gap.
        :global(.katex .mfrac > .vlist-t > .vlist-r:first-child > .vlist > span:first-child) {
            transform: translateY(0.18em);
        }
        :global(.katex .mfrac > .vlist-t > .vlist-r:first-child > .vlist > span:last-child) {
            transform: translateY(-0.18em);
        }
        :global(.term) {
            display: inline-block;
            padding: 2px 6px;
            margin: 0 1px;
            border-radius: $radius-sm;
            // Default: no box. Terms without tooltips don't show a box even on hover.
            border: 1px solid transparent;
            background: rgba(255, 255, 255, 0.01);
            pointer-events: auto;
            position: relative;
            z-index: 1;
            transition:
                border-color 120ms,
                background 120ms;
        }
        // Terms with a tooltip get a permanent dashed underline. Drawn via ::after pseudo
        // 3px inside instead of border-bottom so a fraction's frac-line directly below
        // doesn't occlude it.
        :global(.term--has-tooltip)::after {
            content: "";
            position: absolute;
            left: 4px;
            right: 4px;
            bottom: 3px;
            border-bottom: 1px dashed $c-ink-2;
            pointer-events: none;
        }

        :global(.term--has-value) {
            background-color: rgba(10, 127, 194, 0.1);
        }

        // Used when (Token_t) is replaced with the actual token string on token selection.
        :global(.term--replaced) {
            font-family: "KaTeX_Main", "Times New Roman", serif;
            color: #0a7fc2;
            background-color: rgba(10, 127, 194, 0.1);
        }

    }
    // The displayed value — text only (no box), placed above/below the dashed box, in #0A7FC2.
    :global(.term-value-badge) {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        padding: 0 4px;
        border-radius: $radius-sm;
        color: #0a7fc2;
        font-family: $font-mono;
        font-size: 0.95rem;
        font-weight: 500;
        white-space: nowrap;
        pointer-events: none;
        z-index: 2;
        transition: opacity 150ms;
    }
    :global(.term-value-badge.above) {
        bottom: calc(100% + 2px);
    }
    :global(.term-value-badge.below) {
        top: calc(100% + 2px);
    }
    :global(.term-check-badge) {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #0a7fc2;
        color: white;
        font-size: 0.7rem;
        line-height: 16px;
        text-align: center;
        pointer-events: none;
        z-index: 3;
    }
</style>
