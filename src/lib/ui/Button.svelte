<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        variant?: "primary" | "secondary" | "ghost";
        size?: "sm" | "md";
        disabled?: boolean;
        active?: boolean; // toggle state
        title?: string;
        type?: "button" | "submit" | "reset";
        onclick?: (e: MouseEvent) => void;
        children: Snippet;
    }
    let {
        variant = "secondary",
        size = "md",
        disabled = false,
        active = false,
        title,
        type = "button",
        onclick,
        children,
    }: Props = $props();
</script>

<button
    class="btn"
    class:v-primary={variant === "primary"}
    class:v-secondary={variant === "secondary"}
    class:v-ghost={variant === "ghost"}
    class:s-sm={size === "sm"}
    class:s-md={size === "md"}
    class:active
    {disabled}
    {title}
    {type}
    {onclick}
>
    {@render children()}
</button>

<style lang="scss">
    .btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: $font-sans;
        font-weight: $fw-medium;
        border-radius: $radius-md;
        cursor: pointer;
        transition: all 120ms ease;
        line-height: 1;
        color: $c-ink-1;
        border: 1px solid transparent;

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }
    .s-sm {
        font-size: $fs-sm;
        padding: 6px 12px;
    }
    .s-md {
        font-size: $fs-base;
        padding: 8px 14px;
    }

    // Primary — main action (black background reserved for true primary CTAs).
    .v-primary {
        background: $c-ink-1;
        color: $c-surface;
        border-color: $c-ink-1;

        &:hover:not(:disabled) {
            background: $c-ink-2;
            border-color: $c-ink-2;
        }
    }

    // Secondary — default toggle button. active = ink-1 border + semibold.
    .v-secondary {
        background: $c-surface;
        color: $c-ink-2;
        border-color: $c-line;

        &:hover:not(:disabled):not(.active) {
            color: $c-ink-1;
            border-color: $c-ink-3;
        }
        &.active {
            background: $c-surface;
            color: $c-ink-1;
            border-color: $c-ink-1;
            font-weight: $fw-semibold;
        }
    }

    // Ghost — borderless text button.
    .v-ghost {
        background: transparent;
        color: $c-ink-2;

        &:hover:not(:disabled) {
            color: $c-ink-1;
        }
        &.active {
            color: $c-ink-1;
            font-weight: $fw-semibold;
        }
    }
</style>
