<!-- Small selectable pill. Selected: dotColor border + faint tinted bg if dotColor is given,
     otherwise ink-1 border + semibold. -->
<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        selected?: boolean;
        disabled?: boolean;
        dotColor?: string; // left dot + accent color when selected
        title?: string;
        /**
         * 'tinted' (default): selected uses dotColor border + faint tinted bg.
         * 'mono': selected = ink-1 black text/border, unselected = ink-3 grey.
         *   dot keeps its dotColor (saturated when selected, grey when not).
         */
        variant?: "tinted" | "mono";
        onclick?: (e: MouseEvent) => void;
        children: Snippet;
    }
    let {
        selected = false,
        disabled = false,
        dotColor,
        title,
        variant = "tinted",
        onclick,
        children,
    }: Props = $props();
</script>

<button
    class="chip"
    class:selected
    class:disabled
    class:with-dot={!!dotColor}
    class:mono={variant === "mono"}
    style:--chip-color={dotColor ?? "var(--ink-1-fallback)"}
    {disabled}
    {title}
    {onclick}
    type="button"
>
    {#if dotColor}
        <span class="dot" style:background={selected ? dotColor : "#d0d0d0"}
        ></span>
    {/if}
    <span class="content">{@render children()}</span>
</button>

<style lang="scss">
    .chip {
        @include type-chip;
        --ink-1-fallback: #{$c-ink-1};

        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: $radius-pill;
        border: 1px solid $c-line;
        background: $c-surface;
        color: $c-ink-2;
        cursor: pointer;
        transition:
            background 120ms ease,
            border-color 120ms ease,
            color 120ms ease;

        &:hover:not(.disabled):not(.selected) {
            border-color: $c-ink-3;
            color: $c-ink-1;
        }

        // Selected: accent color (dotColor or ink-1) on border + faint tint bg.
        // Text stays ink-1; color identity lives in border/bg/dot.
        &.selected {
            border-color: var(--chip-color);
            background: color-mix(in srgb, var(--chip-color) 12%, $c-surface);
            color: $c-ink-1;
        }

        // mono variant: ink-1 when selected, ink-3 when not. Plain line only (no tint/colored
        // border) — the dot keeps its color, text stays neutral.
        &.mono {
            color: $c-ink-3;
            background: $c-surface;
            border-color: $c-line;

            &:hover:not(.disabled):not(.selected) {
                color: $c-ink-2;
                border-color: $c-ink-3;
            }
        }
        &.mono.selected {
            color: $c-ink-1;
            background: $c-surface;
            border-color: $c-ink-1;
        }

        &.disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
    }
    .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }
</style>
