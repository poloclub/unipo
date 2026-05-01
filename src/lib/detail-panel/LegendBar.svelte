<!-- src/lib/detail-panel/LegendBar.svelte -->
<script lang="ts">
    import type { ColorSource } from "$lib/radial-chart/types";
    import { strings } from "$lib/i18n/strings";
    import { buildTokenHeatmapScale } from "./color-domain";

    interface Props {
        colorSource?: ColorSource;
        domain?: [number, number];
    }
    let {}: Props = $props();

    // Same palette/gamma as token heatmap (color-domain.ts); domain is visual [0, N-1].
    // No alpha applied — legend shows the raw palette tones.
    const N = 40;
    let stops = $derived.by(() => {
        const scale = buildTokenHeatmapScale([0, N - 1]);
        return Array.from({ length: N }, (_, i) => scale(i));
    });
</script>

<div class="legend">
    <span class="lo" aria-label={strings.legendBar.lowAriaLabel}>Low</span>

    <div class="bar">
        {#each stops as c}
            <span class="stop" style:background={c}></span>
        {/each}
    </div>
    <span class="hi" aria-label={strings.legendBar.highAriaLabel}>High</span>
</div>

<style lang="scss">
    .legend {
        @include type-meta-label;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .bar {
        display: flex;
        height: 4px;
        width: 90px;
        border-radius: 2px;
        overflow: hidden;
    }
    .stop {
        flex: 1;
    }
    .lo,
    .hi {
        font-size: $fs-xs;
        font-weight: 500;
        line-height: 1;
    }
    .lo {
        color: $c-pink;
    }
    .hi {
        color: $c-green;
    }
</style>
