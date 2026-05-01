<!-- src/lib/learning-mode/CenterLLMLabel.svelte -->
<!-- Large beat title shown at chart center (below the step text). -->
<script lang="ts">
    interface Props {
        x: number;
        y: number;
        beatTitle?: string;
        titleRef?: (el: HTMLDivElement) => void;
    }
    let { x, y, beatTitle = "", titleRef }: Props = $props();

    let titleEl: HTMLDivElement;

    $effect(() => {
        if (titleEl && titleRef) titleRef(titleEl);
    });
</script>

<div
    bind:this={titleEl}
    class="beat-title"
    style:left="{x}px"
    style:top="{y}px"
>
    {beatTitle}
</div>

<style lang="scss">
    .beat-title {
        position: fixed;
        transform: translate(-50%, -50%);
        font-family: $font-sans;
        font-size: $fs-md;
        font-weight: $fw-semibold;
        color: $c-ink-1;
        pointer-events: none;
        z-index: 50;
        white-space: nowrap;
        opacity: 0;
        text-align: center;
    }
</style>
