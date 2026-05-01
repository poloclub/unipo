<!-- Hover popover tooltip. Uses position: fixed so overflowing parents do not clip it. -->
<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        title?: string;
        content: string;
        hint?: string;
        placement?: "top" | "bottom";
        children: Snippet;
    }
    let {
        title,
        content,
        hint,
        placement = "top",
        children,
    }: Props = $props();

    let triggerEl: HTMLElement | undefined = $state();
    let tipEl: HTMLElement | undefined = $state();
    let show = $state(false);
    let top = $state(0);
    let left = $state(0);

    const GAP = 8;

    async function compute() {
        if (!triggerEl) return;
        const r = triggerEl.getBoundingClientRect();
        // Compute base position, then clamp to viewport after tipEl is measured.
        let cx = r.left + r.width / 2;
        let cy = placement === "top" ? r.top - GAP : r.bottom + GAP;

        top = cy;
        left = cx;

        // Measure tipEl on next tick and adjust if it overflows the viewport.
        await Promise.resolve();
        if (!tipEl) return;
        const tr = tipEl.getBoundingClientRect();
        const vw = window.innerWidth;
        // Horizontal clamp with 8px margin.
        const minLeft = tr.width / 2 + 8;
        const maxLeft = vw - tr.width / 2 - 8;
        if (cx < minLeft) cx = minLeft;
        if (cx > maxLeft) cx = maxLeft;
        left = cx;

        // Flip to bottom if too close to the top edge (and vice versa).
        if (placement === "top" && r.top - GAP - tr.height < 8) {
            top = r.bottom + GAP;
            placementActual = "bottom";
        } else if (placement === "bottom" && r.bottom + GAP + tr.height > window.innerHeight - 8) {
            top = r.top - GAP;
            placementActual = "top";
        } else {
            placementActual = placement;
        }
    }

    let placementActual = $state<"top" | "bottom">("top");

    function onEnter() {
        placementActual = placement;
        show = true;
        compute();
    }
    function onLeave() {
        show = false;
    }
</script>

<span
    class="tip-wrapper"
    bind:this={triggerEl}
    onmouseenter={onEnter}
    onmouseleave={onLeave}
    onfocusin={onEnter}
    onfocusout={onLeave}
>
    {@render children()}
</span>

{#if show}
    <div
        bind:this={tipEl}
        class="tip"
        class:top={placementActual === "top"}
        class:bottom={placementActual === "bottom"}
        style:top="{top}px"
        style:left="{left}px"
        role="tooltip"
    >
        {#if title}<strong class="tip-title">{title}</strong>{/if}
        <span class="tip-content">{content}</span>
        {#if hint}<span class="tip-hint">{hint}</span>{/if}
    </div>
{/if}

<style lang="scss">
    .tip-wrapper {
        display: inline-flex;
        align-items: center;
    }
    .tip {
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
        color: $c-ink-1;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
        white-space: normal;
        line-height: $lh-normal;
    }
    .tip.top {
        transform: translate(-50%, -100%);
    }
    .tip.bottom {
        transform: translate(-50%, 0);
    }
    .tip-title {
        font-weight: $fw-semibold;
        font-size: $fs-sm;
    }
    .tip-content {
        color: $c-ink-2;
    }
    .tip-hint {
        color: $c-ink-3;
        font-style: italic;
    }
</style>
