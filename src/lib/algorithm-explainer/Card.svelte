<script lang="ts">
    import type { CardDescriptor, WordSeg } from "./diff/types";
    import FormulaSection from "./FormulaSection.svelte";
    import { slotKey } from "./bindings";
    import {
        algoExplainer,
        getCardPosition,
        setCardPosition,
    } from "./state.svelte";

    interface Props {
        descriptor: CardDescriptor;
        slotValues?: Map<string, string>;
        tokenObjectiveColor?: string | null;
    }
    let {
        descriptor,
        slotValues = new Map(),
        tokenObjectiveColor = null,
    }: Props = $props();

    let pos = $derived(getCardPosition(descriptor.id, descriptor.position));

    let dragging = $state(false);
    let dragStart = { px: 0, py: 0, cx: 0, cy: 0 };

    function onHeaderPointerDown(e: PointerEvent) {
        e.stopPropagation();
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragging = true;
        dragStart = { px: e.clientX, py: e.clientY, cx: pos.x, cy: pos.y };
    }
    function onHeaderPointerMove(e: PointerEvent) {
        if (!dragging) return;
        e.stopPropagation();
        const k = algoExplainer.transform.k || 1;
        const dx = (e.clientX - dragStart.px) / k;
        const dy = (e.clientY - dragStart.py) / k;
        setCardPosition(descriptor.id, {
            x: dragStart.cx + dx,
            y: dragStart.cy + dy,
        });
    }
    function onHeaderPointerUp(e: PointerEvent) {
        if (!dragging) return;
        e.stopPropagation();
        dragging = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }

    function segClass(s: WordSeg): string {
        return s.kind === "add"
            ? "diff-add"
            : s.kind === "del"
              ? "diff-del"
              : "";
    }
</script>

<article
    class="card"
    class:dragging
    class:base-only={descriptor.kind === "base-only"}
    class:compare-only={descriptor.kind === "compare-only"}
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    data-card-id={descriptor.id}
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header
        class="card-head"
        onpointerdown={onHeaderPointerDown}
        onpointermove={onHeaderPointerMove}
        onpointerup={onHeaderPointerUp}
        onpointercancel={onHeaderPointerUp}
        title="Drag to move"
    >
        <svg
            class="grip"
            viewBox="0 0 12 16"
            width="10"
            height="14"
            aria-hidden="true"
        >
            <circle cx="3" cy="3" r="1.2" />
            <circle cx="9" cy="3" r="1.2" />
            <circle cx="3" cy="8" r="1.2" />
            <circle cx="9" cy="8" r="1.2" />
            <circle cx="3" cy="13" r="1.2" />
            <circle cx="9" cy="13" r="1.2" />
        </svg>
        <span class="card-title">
            {#each descriptor.title as seg, i (i)}<span class={segClass(seg)}
                    >{seg.text}</span
                >{/each}
        </span>
        {#if descriptor.header}
            {@const cardHeaderText = slotValues.get(slotKey(descriptor.id, null, "card-header", null))}
            {#if cardHeaderText}
                <span
                    class="card-header-value"
                    class:string={descriptor.header.format === "string"}
                    >{cardHeaderText}</span
                >
            {/if}
        {/if}
    </header>
    {#if descriptor.description}
        <p class="card-description">
            {#each descriptor.description as seg, i (i)}<span
                    class={segClass(seg)}>{seg.text}</span
                >{/each}
        </p>
    {/if}
    <div class="card-body" class:single={descriptor.sections.length === 1}>
        {#each descriptor.sections as section, i (section.id ?? i)}
            <FormulaSection
                {section}
                parentCardId={descriptor.id}
                {slotValues}
                {tokenObjectiveColor}
                tooltipTerms={descriptor.tooltipTerms}
            />
        {/each}
    </div>
</article>

<style lang="scss">
    .card {
        position: absolute;
        background: rgba(225, 226, 229, 0.5);
        // background: white;
        border: 1px solid #c8cad0;
        border-radius: $radius-md;
        padding: $sp-2;
        padding-top: $sp-4;
        display: flex;
        flex-direction: column;
        gap: $sp-4;
        transition:
            transform 0.2s ease,
            background 0.2s ease;
    }
    .card.base-only {
        background: $c-red-tint;
    }
    .card.compare-only {
        background: $c-green-tint;
    }
    .card.dragging {
        cursor: grabbing;
    }
    .card-head {
        display: flex;
        align-items: center;
        gap: $sp-2;
        padding: $sp-1 $sp-2;
        margin: -$sp-1 -$sp-2 0;
        border-radius: $radius-sm;
        cursor: grab;
        touch-action: none;
        user-select: none;
        transition:
            background 120ms,
            color 120ms;
    }
    .card-head:hover {
        background: rgba(15, 23, 42, 0.06);
    }
    .card.dragging .card-head {
        cursor: grabbing;
        background: rgba(15, 23, 42, 0.1);
    }
    .grip {
        flex-shrink: 0;
        color: $c-ink-3;
        opacity: 0.6;
    }
    .card-head:hover .grip {
        opacity: 1;
    }
    :global(.grip circle) {
        fill: currentColor;
    }
    .card-title {
        @include type-meta-label;
        font-size: 1rem;
        color: $c-ink-2;
    }
    .card-description {
        margin: 0;
        padding: 0 $sp-4 $sp-1;
        font-size: 13px;
        line-height: 1.3;
        color: $c-ink-3;
        // Preserve \n as a line break.
        white-space: pre-line;
        // Prevent a single-line max-content from inflating the card width.
        width: 0;
        min-width: 100%;
        box-sizing: border-box;
    }
    .card-body {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: max-content;
        align-items: stretch;
    }
    .card-header-value {
        margin-left: $sp-2;
        padding: 0 4px;
        border-radius: $radius-sm;
        color: #0a7fc2;
        font-family: $font-mono;
        font-size: 0.95rem;
        font-weight: 500;
        transition: opacity 150ms;
    }
</style>
