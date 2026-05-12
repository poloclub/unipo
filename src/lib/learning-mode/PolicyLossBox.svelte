<!-- src/lib/learning-mode/PolicyLossBox.svelte -->
<script lang="ts">
    import { LABELS } from "./script";
    import { registerAnchor } from "$lib/anchor/anchors.svelte";
    import { strings } from "$lib/i18n/strings";

    interface Props {
        value: number | undefined | null;
        elRef?: (el: HTMLDivElement) => void;
    }
    let { value, elRef }: Props = $props();

    let el: HTMLDivElement;

    $effect(() => {
        if (el && elRef) elRef(el);
    });

    function fmt(v: number | undefined | null): string {
        if (v === undefined || v === null || !Number.isFinite(v)) return strings.common.dash;
        return (v >= 0 ? "" : "−") + Math.abs(v).toFixed(3);
    }
</script>

<div bind:this={el} class="policy-loss-box" use:registerAnchor={"policy-loss-box"}>
    <span class="formula">{LABELS.policyLossFormula}</span>
    <span class="eq">=</span>
    <span class="value">{fmt(value)}</span>
</div>

<style lang="scss">
    .policy-loss-box {
        display: inline-flex;
        align-items: baseline;
        gap: 8px;
        align-self: flex-start;
    }
    .formula {
        font-family: $font-mono;
        font-size: $fs-sm;
        color: $c-ink-2;
    }
    .eq {
        color: $c-ink-3;
        font-family: $font-mono;
        font-size: $fs-sm;
    }
    .value {
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
        font-size: $fs-md;
        font-weight: $fw-bold;
        color: $c-ink-1;
    }
</style>
