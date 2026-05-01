<script lang="ts">
    import { algoExplainer, setCompareWith } from "./state.svelte";
    import { ALGORITHMS } from "./loader";
    import Canvas from "./Canvas.svelte";

    interface Props {
        slotValues?: Map<string, string>;
        tokenObjectiveColor?: string | null;
        onClose?: () => void;
    }
    let {
        slotValues = new Map(),
        tokenObjectiveColor = null,
        onClose,
    }: Props = $props();

    let rootEl: HTMLDivElement | undefined = $state();
    let tip: { x: number; y: number; text: string } | null = $state(null);

    let pickerOpen = $state(false);
    let titleRowEl: HTMLDivElement | undefined = $state();

    const currentKey = $derived(algoExplainer.algorithm?.id ?? null);
    const currentLabel = $derived(algoExplainer.algorithm?.name ?? "—");
    const compareKey = $derived(algoExplainer.compareWith);
    const compareLabel = $derived(
        compareKey && ALGORITHMS[compareKey]
            ? ALGORITHMS[compareKey].name
            : null,
    );
    const compareOptions = $derived(
        Object.entries(ALGORITHMS)
            .filter(([k]) => k !== currentKey)
            .map(([k, def]) => ({ key: k, label: def.name })),
    );

    function togglePicker() {
        pickerOpen = !pickerOpen;
    }
    function selectCompare(key: string) {
        setCompareWith(key);
        pickerOpen = false;
    }
    function clearCompare() {
        setCompareWith(null);
        pickerOpen = false;
    }

    $effect(() => {
        if (!pickerOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!titleRowEl) return;
            if (titleRowEl.contains(e.target as Node)) return;
            pickerOpen = false;
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") pickerOpen = false;
        };
        window.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    });

    function onMouseOver(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const termEl = target.closest(".term") as HTMLElement | null;
        if (!termEl) {
            tip = null;
            return;
        }
        const cls = Array.from(termEl.classList).find((c) =>
            c.startsWith("term--"),
        );
        if (!cls) return;
        const termId = cls.slice("term--".length);
        const cardEl = termEl.closest(
            "[data-card-id]",
        ) as HTMLElement | null;
        const cardId = cardEl?.getAttribute("data-card-id");
        if (!cardId) return;
        // In stacked diff mode, top .math is base, bottom .math.compare is compare.
        // Single-side-only sections render only on baseEl, so try both defs as fallback.
        const isCompareSide = !!termEl.closest(".math.compare");
        const baseDef = algoExplainer.algorithm;
        const cmpDef = compareKey ? (ALGORITHMS[compareKey] ?? null) : null;
        const lookup = (def: typeof baseDef | null) =>
            def?.cards.find((c) => c.id === cardId)?.terms?.[termId]?.tooltip ??
            null;
        const text = isCompareSide
            ? (lookup(cmpDef) ?? lookup(baseDef))
            : (lookup(baseDef) ?? lookup(cmpDef));
        if (!text) {
            tip = null;
            return;
        }
        const r = termEl.getBoundingClientRect();
        tip = {
            x: r.left + r.width / 2,
            y: r.top,
            text,
        };
    }

    function onMouseOut(e: MouseEvent) {
        const related = e.relatedTarget as HTMLElement | null;
        if (related && related.closest(".term")) return;
        tip = null;
    }
</script>

{#snippet popMenu()}
    <div class="picker-pop" role="menu">
        {#each compareOptions as opt (opt.key)}
            <button
                type="button"
                class="picker-item"
                class:active={opt.key === compareKey}
                role="menuitemradio"
                aria-checked={opt.key === compareKey}
                onclick={() => selectCompare(opt.key)}
            >
                {opt.label}
            </button>
        {/each}
        {#if compareKey}
            <div class="picker-divider" aria-hidden="true"></div>
            <button
                type="button"
                class="picker-item picker-stop"
                role="menuitem"
                onclick={clearCompare}
            >
                Stop comparing
            </button>
        {/if}
    </div>
{/snippet}

<div
    class="algorithm-explainer"
    bind:this={rootEl}
    onmouseover={onMouseOver}
    onmouseout={onMouseOut}
    role="region"
    aria-label="Algorithm Explainer"
>
    <Canvas {slotValues} {tokenObjectiveColor} />
    <header class="head">
        <!-- <span class="overline">Algorithm Explainer</span> -->
        <div class="title-row" bind:this={titleRowEl}>
        <h2 class="title">Explaining</h2>
            <h2 class="title" class:base-tint={compareKey}>{currentLabel}</h2>
            {#if compareKey}
                <span class="arrow" aria-hidden="true">vs</span>
                <span class="trigger-wrap">
                    <button
                        type="button"
                        class="title title-btn compare-tint"
                        class:open={pickerOpen}
                        onclick={togglePicker}
                        aria-haspopup="menu"
                        aria-expanded={pickerOpen}
                    >
                        {compareLabel}<span class="caret" aria-hidden="true"
                            >▾</span
                        >
                    </button>
                    {#if pickerOpen}{@render popMenu()}{/if}
                </span>
                <button
                    type="button"
                    class="clear-btn"
                    onclick={clearCompare}
                    aria-label="Stop comparing"
                    title="Stop comparing"
                >
                    ✕
                </button>
            {:else}
                <span class="trigger-wrap">
                    <button
                        type="button"
                        class="picker-btn add"
                        class:open={pickerOpen}
                        onclick={togglePicker}
                        aria-haspopup="menu"
                        aria-expanded={pickerOpen}
                    >
                        <span class="plus" aria-hidden="true">+</span>
                        <span class="picker-label">Compare with</span>
                    </button>
                    {#if pickerOpen}{@render popMenu()}{/if}
                </span>
            {/if}
        </div>
    </header>
    {#if onClose}
        <button
            type="button"
            class="close-btn"
            onclick={onClose}
            aria-label="Close algorithm explainer"
            title="Close algorithm explainer"
        >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    {/if}
    {#if tip}
        <div
            class="term-tooltip"
            style:left="{tip.x}px"
            style:top="{tip.y}px"
            role="tooltip"
        >
            {tip.text}
        </div>
    {/if}
</div>

<style lang="scss">
    .algorithm-explainer {
        position: relative;
        height: 100%;
        overflow: hidden;
        background-color: #f9f9fb;
        background-image: radial-gradient(
            circle,
            rgba(15, 23, 42, 0.12) 1px,
            transparent 1.4px
        );
        background-size: 16px 16px;
        user-select: none;
        -webkit-user-select: none;

        :global(.diff-add),
        :global(.diff-del) {
            display: inline-block;
            border-radius: 2px;
            padding: 0 2px;
        }
        :global(.diff-add) {
            background: $c-diff-add;
        }
        :global(.diff-del) {
            background: $c-diff-del;
        }
        // When wrapped inside KaTeX, cover the full height of vertical boxes (fractions, sums).
        :global(.katex .diff-add),
        :global(.katex .diff-del) {
            display: inline-block;
        }
    }
    .head {
        position: absolute;
        top: 0;
        left: 0;
        padding: $sp-4 $sp-5 $sp-2;
        z-index: 5;
        // Pass-through so the header doesn't block canvas input;
        // only inner interactive elements re-enable pointer-events.
        pointer-events: none;
    }
    .overline {
        @include type-meta-label;
        display: block;
        margin-bottom: $sp-1;
    }
    .title-row {
        display: inline-flex;
        align-items: center;
        // gap: $sp-2;
        pointer-events: auto;
    }
    // picker-pop is positioned relative to this wrapper, so it drops right under the trigger button.
    .trigger-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
    }
    .title {
        @include type-display;
        line-height: 1;
        color: $c-ink-1;
        border-radius: $radius-sm;
        padding: 2px 6px;
    }
    .title.base-tint {
        background: $c-diff-del;
    }
    .title.compare-tint {
        background: $c-diff-add;
    }
    // Strip default button styles when h2 is used as a button.
    .title-btn {
        appearance: none;
        border: none;
        font-family: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: baseline;
        gap: $sp-1;
        margin: 0;
        pointer-events: auto;
    }
    .title-btn .caret {
        font-size: 0.6em;
        color: $c-ink-3;
        line-height: 1;
        align-self: center;
    }
    .title-btn:hover .caret {
        color: $c-ink-1;
    }
    .arrow {
        color: $c-ink-3;
        font-size: 1.4rem;
        line-height: 1;
        font-weight: $fw-medium;
        padding: 0 0.5rem;
    }
    // "+ Compare with" follows the design system Button ghost variant (low emphasis).
    .picker-btn.add {
        appearance: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: transparent;
        border: none;
        border-radius: $radius-sm;
        color: $c-ink-3;
        font-family: $font-sans;
        font-size: $fs-sm;
        font-weight: $fw-medium;
        line-height: 1;
        cursor: pointer;
        transition: color 120ms ease;

        &:hover,
        &.open {
            color: $c-ink-1;
        }
        .plus {
            font-size: 1rem;
            line-height: 1;
        }
    }
    .clear-btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        background: transparent;
        border: 1px solid transparent;
        border-radius: $radius-sm;
        color: $c-ink-3;
        font-size: 0.85rem;
        line-height: 1;
        cursor: pointer;
        transition:
            color 120ms ease,
            background 120ms ease,
            border-color 120ms ease;

        &:hover {
            color: $c-ink-1;
            background: $c-surface;
            border-color: $c-line;
        }
    }
    .close-btn {
        position: absolute;
        top: $sp-3;
        right: $sp-3;
        z-index: 6;
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        color: $c-ink-2;
        cursor: pointer;
        transition:
            color 120ms ease,
            background 120ms ease,
            border-color 120ms ease;

        &:hover {
            color: $c-ink-1;
            background: $c-surface-subtle;
            border-color: $c-ink-3;
        }
    }
    .picker-pop {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        min-width: 160px;
        padding: $sp-1;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-sm;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 1px;
    }
    .picker-item {
        appearance: none;
        text-align: left;
        padding: $sp-1 $sp-2;
        background: transparent;
        border: none;
        border-radius: $radius-sm;
        color: $c-ink-1;
        font-family: inherit;
        font-size: 0.85rem;
        line-height: 1.4;
        cursor: pointer;
        transition: background 80ms ease;

        &:hover {
            background: $c-bg;
        }
        &.active {
            background: $c-bg;
            font-weight: $fw-medium;
        }
        &.picker-stop {
            color: $c-ink-2;
        }
    }
    .picker-divider {
        height: 1px;
        background: $c-line;
        margin: $sp-1 0;
    }
    // Tooltip design mirrors .tip in ui/Tooltip.svelte.
    .term-tooltip {
        position: fixed;
        z-index: 1000;
        min-width: 200px;
        max-width: 300px;
        padding: 8px 12px;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        box-shadow: $shadow-elevated;
        font-family: $font-sans;
        font-size: $fs-xs;
        color: $c-ink-2;
        text-align: left;
        line-height: $lh-normal;
        transform: translate(-50%, calc(-100% - 8px));
        pointer-events: none;
        white-space: normal;
    }
</style>
