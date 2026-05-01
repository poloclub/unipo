<!-- src/lib/detail-panel/StepMetrics.svelte -->
<!-- Step-level summary metrics (reward / kl / policy_loss). Placed beneath the radial chart. -->
<script lang="ts">
    import type { TrainingStep } from "$lib/radial-chart/types";
    import { metricLabel } from "$lib/radial-chart/types";
    import { METRIC_DEFINITIONS } from "$lib/radial-chart/metric-definitions";
    import { Tooltip, Label } from "$lib/ui";

    interface Props {
        step: TrainingStep | null;
        /** Only display metrics selected in RadialChart. */
        selectedMetrics?: string[];
    }
    let { step, selectedMetrics = [] }: Props = $props();

    let keys = $derived(
        selectedMetrics.filter((k) => step?.metrics?.[k] !== undefined),
    );

    function fmt(v: number | undefined): string {
        if (v === undefined || !Number.isFinite(v)) return "—";
        return Math.abs(v) < 0.01 || Math.abs(v) > 1000
            ? v.toExponential(2)
            : v.toFixed(3);
    }
</script>

{#if step && keys.length > 0}
    <div class="step-metrics">
        {#each keys as key}
            <div class="metric">
                <Tooltip
                    title={metricLabel(key)}
                    content={METRIC_DEFINITIONS[key]?.def ?? key}
                    hint={METRIC_DEFINITIONS[key]?.hint}
                    placement="top"
                >
                    <Label tooltipped>{metricLabel(key)}</Label>
                </Tooltip>
                <span class="value">{fmt(step.metrics[key])}</span>
            </div>
        {/each}
    </div>
{/if}

<style lang="scss">
    .step-metrics {
        display: flex;
        gap: $sp-4;
        flex-wrap: wrap;
        padding: 0;
    }
    .metric {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
    }
    .value {
        font-family: $font-sans;
        font-variant-numeric: tabular-nums;
        font-size: $fs-base;
        font-weight: $fw-medium;
        color: $c-ink-1;
    }
</style>
