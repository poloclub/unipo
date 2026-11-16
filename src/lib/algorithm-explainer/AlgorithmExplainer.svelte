<script lang="ts">
    import { algoExplainer, setCompareWith } from "./state.svelte";
    import { ALGORITHMS } from "./loader";
    import Canvas from "./Canvas.svelte";
    import { strings, t } from "$lib/i18n/strings";

    /** The token whose numbers fill the formulas. */
    interface TokenSummary {
        text: string;
        /** 1-based response number, as shown in the response list (R1, R2, ...). */
        responseNumber: number;
        reward?: number;
        objective?: number;
        /** Heatmap color of the token, same as in the response list. */
        color?: string | null;
    }

    interface Props {
        slotValues?: Map<string, string>;
        tokenObjectiveColor?: string | null;
        onClose?: () => void;
        /**
         * Compact layout: the explainer is a full-screen sheet. The response list is
         * hidden behind it, so the selected token is summarized in the header, and the
         * cards are re-fitted to the screen every time the sheet opens.
         */
        compact?: boolean;
        tokenSummary?: TokenSummary | null;
    }
    let {
        slotValues = new Map(),
        tokenObjectiveColor = null,
        onClose,
        compact = false,
        tokenSummary = null,
    }: Props = $props();

    // Height of the header overlay, which the fitted cards must stay clear of.
    const COMPACT_HEAD_PX = 124;

    /** Whitespace-only tokens are invisible as text, so show them as symbols. */
    function visibleToken(text: string): string {
        if (text.trim() !== "") return text;
        return text.replace(/\n/g, "↵").replace(/\t/g, "⇥").replace(/ /g, "␣") || "∅";
    }
    function fmtNum(v: number | undefined, digits: number): string {
        return v !== undefined && Number.isFinite(v)
            ? v.toFixed(digits)
            : strings.common.dash;
    }

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
        window.addEventListener("pointerdown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    });

    // Term tooltips: with a mouse they follow hover. A finger has no hover, so a tap on a
    // term shows its tooltip and the next touch anywhere dismisses it.
    let lastPointerType = "mouse";
    function onPointerOver(e: PointerEvent) {
        if (e.pointerType !== "mouse") return;
        showTermTip(e.target as HTMLElement);
    }
    function onPointerOut(e: PointerEvent) {
        if (e.pointerType !== "mouse") return;
        const related = e.relatedTarget as HTMLElement | null;
        if (related && related.closest(".term")) return;
        tip = null;
    }
    function onPointerDown(e: PointerEvent) {
        lastPointerType = e.pointerType;
        if (e.pointerType !== "mouse") tip = null;
    }
    function onClick(e: MouseEvent) {
        if (lastPointerType === "mouse") return;
        showTermTip(e.target as HTMLElement);
    }

    function showTermTip(target: HTMLElement) {
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
        // Keep the 300px-wide tooltip inside a narrow screen.
        const half = Math.min(150, window.innerWidth / 2 - 8);
        const cx = r.left + r.width / 2;
        tip = {
            x: Math.max(half + 8, Math.min(window.innerWidth - half - 8, cx)),
            // Not enough room above the term → the tooltip goes below it instead.
            y: r.top,
            text,
        };
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="algorithm-explainer"
    class:compact
    bind:this={rootEl}
    onpointerover={onPointerOver}
    onpointerout={onPointerOut}
    onpointerdown={onPointerDown}
    onclick={onClick}
    role="region"
    aria-label="Algorithm Explainer"
>
    <Canvas
        {slotValues}
        {tokenObjectiveColor}
        autoFit={compact}
        fitTopInset={compact ? COMPACT_HEAD_PX : 0}
    />
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
        {#if compact}
            <div class="token-summary">
                {#if tokenSummary}
                    <span class="ts-label">{strings.algorithmExplainer.tokenSummary.label}</span>
                    <span
                        class="ts-token"
                        style:background={tokenSummary.color ?? undefined}
                        >{visibleToken(tokenSummary.text)}</span
                    >
                    <span class="ts-meta">
                        {t(strings.algorithmExplainer.tokenSummary.response, {
                            n: tokenSummary.responseNumber,
                        })}
                        ·
                        {t(strings.algorithmExplainer.tokenSummary.reward, {
                            value: fmtNum(tokenSummary.reward, 2),
                        })}
                        ·
                        {t(strings.algorithmExplainer.tokenSummary.objective, {
                            value: fmtNum(tokenSummary.objective, 3),
                        })}
                    </span>
                {:else}
                    <span class="ts-empty">{strings.algorithmExplainer.tokenSummary.empty}</span>
                {/if}
            </div>
        {/if}
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

    // ---- Compact layout: full-screen sheet ----
    .compact {
        .head {
            right: 0;
            padding: $sp-3 $sp-3 0;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: $sp-2;
        }
        .title-row {
            // Leaves room for the close button in the top-right corner.
            max-width: calc(100% - 52px);
            flex-wrap: wrap;
            row-gap: $sp-1;
        }
        .title {
            font-size: $fs-lg;
        }
        .arrow {
            font-size: 1rem;
            padding: 0 $sp-1;
        }
        .close-btn {
            width: 40px;
            height: 40px;
        }
    }
    .token-summary {
        max-width: 100%;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: $sp-1 $sp-2;
        padding: $sp-2 $sp-3;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        box-shadow: $shadow-card;
        font-family: $font-sans;
        font-size: $fs-xs;
        line-height: $lh-tight;
        color: $c-ink-2;
    }
    .ts-label {
        color: $c-ink-3;
    }
    .ts-token {
        max-width: 14ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: pre;
        padding: 1px 4px;
        border-radius: $radius-sm;
        box-shadow: inset 0 0 0 2px $c-ink-1;
        font-family: $font-mono;
        color: $c-ink-1;
    }
    .ts-meta {
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .ts-empty {
        color: $c-ink-3;
    }
</style>
