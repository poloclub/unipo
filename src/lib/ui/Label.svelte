<!--
  Typographic hierarchy label.
    - default : tertiary (ink-3, sm, medium)
    - strong  : section/inline title (ink-1, base, bold)
    - overline: small uppercase label (ink-3, xs, tracking-wide). Sub-heading hierarchy
                e.g. "Step Inspector", "ALGORITHM", "Prompt 1", "Token-level Objective".
    tooltipped=true adds a help cursor + dotted underline.
-->
<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        tooltipped?: boolean;
        strong?: boolean;
        overline?: boolean;
        children: Snippet;
    }
    let {
        tooltipped = false,
        strong = false,
        overline = false,
        children,
    }: Props = $props();
</script>

<span class="label" class:tooltipped class:strong class:overline>
    {@render children()}
</span>

<style lang="scss">
    .label {
        @include type-data-label;
        color: $c-ink-3;
    }
    .tooltipped {
        cursor: help;
    }
    .strong {
        @include type-section-title;
    }
    .overline {
        @include type-section-title;
    }
</style>
