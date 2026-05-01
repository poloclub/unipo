<!-- src/lib/detail-panel/LatexText.svelte -->
<!-- Render $...$, \(...\), \[...\], $$...$$ math inside text with KaTeX. -->
<script lang="ts">
    import { onMount, tick } from "svelte";
    import renderMathInElement from "katex/contrib/auto-render";
    import "katex/dist/katex.min.css";

    interface Props {
        text: string;
        inline?: boolean;
    }
    let { text, inline = false }: Props = $props();

    let el: HTMLElement | undefined = $state();

    const delimiters = [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false },
    ];

    async function render() {
        if (!el) return;
        el.textContent = text;
        await tick();
        try {
            renderMathInElement(el, {
                delimiters,
                throwOnError: false,
                strict: "ignore",
            });
        } catch {
            // On render failure, keep raw text.
        }
    }

    onMount(render);
    $effect(() => {
        text; // dep
        render();
    });
</script>

{#if inline}
    <span bind:this={el} class="latex-text"></span>
{:else}
    <div bind:this={el} class="latex-text"></div>
{/if}

<style lang="scss">
    .latex-text {
        white-space: pre-wrap;
        word-break: break-word;

        :global(.katex) {
            font-size: 1em;
        }
        :global(.katex-display) {
            margin: 0.3em 0;
        }
    }
</style>
