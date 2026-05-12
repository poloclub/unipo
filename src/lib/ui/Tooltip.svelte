<!-- Hover popover tooltip. Uses position: fixed so overflowing parents do not clip it. -->
<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        title?: string;
        content: string;
        hint?: string;
        placement?: "top" | "bottom" | "right" | "left";
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
        let cx: number;
        let cy: number;
        if (placement === "right") {
            cx = r.right + GAP;
            cy = r.top + r.height / 2;
        } else if (placement === "left") {
            cx = r.left - GAP;
            cy = r.top + r.height / 2;
        } else {
            cx = r.left + r.width / 2;
            cy = placement === "top" ? r.top - GAP : r.bottom + GAP;
        }
        top = cy;
        left = cx;

        await Promise.resolve();
        if (!tipEl) return;
        const tr = tipEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (placement === "top" || placement === "bottom") {
            const minLeft = tr.width / 2 + 8;
            const maxLeft = vw - tr.width / 2 - 8;
            if (cx < minLeft) cx = minLeft;
            if (cx > maxLeft) cx = maxLeft;
            left = cx;

            if (placement === "top" && r.top - GAP - tr.height < 8) {
                top = r.bottom + GAP;
                placementActual = "bottom";
            } else if (placement === "bottom" && r.bottom + GAP + tr.height > vh - 8) {
                top = r.top - GAP;
                placementActual = "top";
            } else {
                placementActual = placement;
            }
        } else {
            const minTop = tr.height / 2 + 8;
            const maxTop = vh - tr.height / 2 - 8;
            if (cy < minTop) cy = minTop;
            if (cy > maxTop) cy = maxTop;
            top = cy;

            if (placement === "right" && r.right + GAP + tr.width > vw - 8) {
                left = r.left - GAP;
                placementActual = "left";
            } else if (placement === "left" && r.left - GAP - tr.width < 8) {
                left = r.right + GAP;
                placementActual = "right";
            } else {
                placementActual = placement;
            }
        }
    }

    let placementActual = $state<"top" | "bottom" | "right" | "left">("top");

    function onEnter() {
        placementActual = placement;
        show = true;
        compute();
    }
    function onLeave() {
        show = false;
    }

    // Move the floating tip into <body> so that ancestors with `backdrop-filter`,
    // `transform`, `filter`, etc. (which form a containing block) don't trap our
    // `position: fixed` element and hide it inside their stacking context.
    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                if (node.parentNode) node.parentNode.removeChild(node);
            },
        };
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
        use:portal
        bind:this={tipEl}
        class="tip"
        class:top={placementActual === "top"}
        class:bottom={placementActual === "bottom"}
        class:right={placementActual === "right"}
        class:left={placementActual === "left"}
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
    .tip.right {
        transform: translate(0, -50%);
    }
    .tip.left {
        transform: translate(-100%, -50%);
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
