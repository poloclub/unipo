<!-- General-purpose card with hairline border + subtle shadow by default. -->
<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        padding?: "none" | "sm" | "md" | "lg";
        variant?: "surface" | "subtle" | "ghost";
        raised?: boolean; // when true, applies shadow-elevated
        children: Snippet;
    }
    let {
        padding = "md",
        variant = "surface",
        raised = false,
        children,
    }: Props = $props();
</script>

<div
    class="card"
    class:pad-none={padding === "none"}
    class:pad-sm={padding === "sm"}
    class:pad-md={padding === "md"}
    class:pad-lg={padding === "lg"}
    class:var-surface={variant === "surface"}
    class:var-subtle={variant === "subtle"}
    class:var-ghost={variant === "ghost"}
    class:raised
>
    {@render children()}
</div>

<style lang="scss">
    .card {
        border-radius: $radius-md;
    }
    .var-surface {
        background: $c-surface;
        border: 1px solid $c-line;
        box-shadow: $shadow-card;
    }
    .var-subtle {
        background: $c-surface-subtle;
        border: 1px solid $c-line;
        box-shadow: none;
    }
    .var-ghost {
        background: transparent;
        border: 1px solid transparent;
        box-shadow: none;
    }
    .raised {
        box-shadow: $shadow-elevated;
    }
    .pad-none {
        padding: 0;
    }
    .pad-sm {
        padding: $sp-2 $sp-3;
    }
    .pad-md {
        padding: $sp-3 $sp-4;
    }
    .pad-lg {
        padding: $sp-4 $sp-5;
    }
</style>
