<!-- Semantic color badge with solid / tint / outline variants. -->
<script lang="ts">
    import type { Snippet } from "svelte";

    export type BadgeColor =
        | "pink"
        | "green"
        | "blue"
        | "amber"
        | "red"
        | "violet"
        | "neutral";

    interface Props {
        color?: BadgeColor;
        variant?: "solid" | "tint" | "outline";
        size?: "sm" | "md";
        uppercase?: boolean;
        children: Snippet;
    }
    let {
        color = "neutral",
        variant = "tint",
        size = "md",
        uppercase = false,
        children,
    }: Props = $props();
</script>

<span
    class="badge"
    class:c-pink={color === "pink"}
    class:c-green={color === "green"}
    class:c-blue={color === "blue"}
    class:c-amber={color === "amber"}
    class:c-red={color === "red"}
    class:c-violet={color === "violet"}
    class:c-neutral={color === "neutral"}
    class:v-solid={variant === "solid"}
    class:v-tint={variant === "tint"}
    class:v-outline={variant === "outline"}
    class:s-sm={size === "sm"}
    class:s-md={size === "md"}
    class:upper={uppercase}
>
    {@render children()}
</span>

<style lang="scss">
    .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border-radius: $radius-pill;
        font-weight: $fw-semibold;
        font-family: $font-sans;
        white-space: nowrap;
    }
    .s-sm {
        font-size: $fs-xs;
        padding: 2px 8px;
    }
    .s-md {
        font-size: $fs-sm;
        padding: 3px 10px;
    }
    .upper {
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    // --- Solid variant ---
    .v-solid {
        color: $c-surface;
        &.c-pink { background: $c-pink; }
        &.c-green { background: $c-green; }
        &.c-blue { background: $c-blue; }
        &.c-amber { background: $c-amber; color: $c-ink-1; }
        &.c-red { background: $c-red; }
        &.c-violet { background: $c-violet; }
        &.c-neutral { background: $c-ink-1; }
    }

    // --- Tint variant ---
    .v-tint {
        &.c-pink { background: $c-pink-tint; color: $c-pink-strong; }
        &.c-green { background: $c-green-tint; color: $c-green-strong; }
        &.c-blue { background: $c-blue-tint; color: $c-blue-strong; }
        &.c-amber { background: $c-amber-tint; color: $c-amber-strong; }
        &.c-red { background: $c-red-tint; color: $c-red-strong; }
        &.c-violet { background: $c-violet-tint; color: $c-violet-strong; }
        &.c-neutral { background: $c-line-soft; color: $c-ink-2; }
    }

    // --- Outline variant ---
    .v-outline {
        background: $c-surface;
        border: 1px solid currentColor;
        &.c-pink { color: $c-pink-strong; border-color: $c-pink; }
        &.c-green { color: $c-green-strong; border-color: $c-green; }
        &.c-blue { color: $c-blue-strong; border-color: $c-blue; }
        &.c-amber { color: $c-amber-strong; border-color: $c-amber; }
        &.c-red { color: $c-red-strong; border-color: $c-red; }
        &.c-violet { color: $c-violet-strong; border-color: $c-violet; }
        &.c-neutral { color: $c-ink-2; border-color: $c-line; }
    }
</style>
