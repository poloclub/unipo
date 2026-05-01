<!-- src/lib/detail-panel/PromptBlock.svelte -->
<!-- Renders only prompt text (LaTeX-aware). Parent attaches the overline Label header. -->
<script lang="ts">
    import LatexText from "./LatexText.svelte";

    interface Props {
        prompt: string | undefined;
    }
    let { prompt }: Props = $props();
</script>

{#if prompt}
    <div class="prompt-block">
        <LatexText text={prompt} />
    </div>
{/if}

<style lang="scss">
    .prompt-block {
        @include type-body;
        line-height: 1.2;
        background: #f9f9fb;
        border-radius: $radius-md;
        padding: $sp-3 $sp-4;
    }
</style>
