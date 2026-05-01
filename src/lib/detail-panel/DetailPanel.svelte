<!-- src/lib/detail-panel/DetailPanel.svelte -->
<!--
  3-section full-height layout:
    [StepHeader]                shrink-0
    [RolloutList]               flex 1 (internal scroll + bottom fade)
    [Optimization Objectives]   shrink-0
-->
<script lang="ts">
    import type { TrainingStep, RunMeta } from "$lib/radial-chart/types";
    import { robustTokenObjectiveDomain, tokenHeatmapColor } from "./color-domain";
    import { Label, Tooltip } from "$lib/ui";
    import StepHeader from "./StepHeader.svelte";
    import ResponseList from "./ResponseList.svelte";
    import LegendBar from "./LegendBar.svelte";
    import PolicyLossBox from "$lib/learning-mode/PolicyLossBox.svelte";
    import { strings, t } from "$lib/i18n/strings";

    interface Props {
        step: TrainingStep | null;
        loading?: boolean;
        error?: string | null;
        algorithm?: string;
        runMeta?: RunMeta;
        /** Learning mode: when true, ResponseList shows all rollouts (currently always full-render so ignored). */
        forceAllRollouts?: boolean;
        /** Learning mode: hide token heatmap. */
        paintDisabled?: boolean;
        /** Learning mode: policy loss value. null/undefined means box is not rendered. */
        policyLoss?: number | null;
        explainerOpen?: boolean;
        onAlgorithmExplainer?: () => void;
        /** 0-based rollout cycle number for the selected step; null when no rollout phase data. */
        rolloutNumber?: number | null;
        selectedToken?: { rolloutId: string; tokenIndex: number } | null;
        /** Gate enabling dim treatment — parent toggles true after explainer settles. */
        dimEnabled?: boolean;
        onTokenClick?: (rolloutId: string, tokenIndex: number) => void;
    }

    let {
        step,
        loading = false,
        error = null,
        algorithm = "",
        runMeta,
        paintDisabled = false,
        policyLoss = null,
        explainerOpen = false,
        onAlgorithmExplainer,
        rolloutNumber = null,
        selectedToken = null,
        dimEnabled = false,
        onTokenClick,
    }: Props = $props();

    // Max prompts displayed per step. Data may contain N (e.g. DAPO 4) but the
    // UI slices to this count from the front. StepHeader meta text reflects this.
    const MAX_PROMPTS_SHOWN = 2;

    let displayedPrompts = $derived(
        step?.prompts?.slice(0, MAX_PROMPTS_SHOWN) ?? [],
    );
    let domain = $derived(
        robustTokenObjectiveDomain(displayedPrompts.flatMap((g) => g.responses)),
    );
    let hasResponses = $derived(
        displayedPrompts.some((g) => g.responses.length > 0),
    );
    // multi-prompt (PPO/REIN etc.) when 2+ prompts. Based on count before slicing.
    let multiPrompt = $derived((step?.prompts?.length ?? 0) > 1);

    // Step-level objective display value. Learning mode is handled by the
    // PolicyLossBox branch; default mode prefers metrics.policy_objective,
    // falling back to -policy_loss. Sign follows objective convention since
    // the label reads "Objective".
    let stepObjective = $derived.by(() => {
        const obj = step?.metrics?.policy_objective;
        if (typeof obj === "number" && Number.isFinite(obj)) return obj;
        const loss = step?.metrics?.policy_loss;
        if (typeof loss === "number" && Number.isFinite(loss)) return -loss;
        return null;
    });

    // Color the step objective cell using the token-heatmap domain/palette —
    // step objective aggregates token objectives, so the same domain maps cleanly.
    let objectiveBg = $derived(tokenHeatmapColor(stepObjective, domain));

    function fmtObjective(v: number | null): string {
        if (v === null) return strings.common.dash;
        const abs = Math.abs(v);
        if (abs !== 0 && abs < 0.001) return v.toExponential(1);
        return v.toFixed(3);
    }
</script>

<div class="detail-panel">
    {#if loading}
        <div class="placeholder">{strings.detailPanel.loading}</div>
    {:else if error}
        <div class="placeholder error">{t(strings.detailPanel.loadFailed, { error })}</div>
    {:else if !step}
        <div class="placeholder">{strings.detailPanel.emptyState}</div>
    {:else}
        <StepHeader
            {step}
            {runMeta}
            {algorithm}
            {explainerOpen}
            {onAlgorithmExplainer}
            {rolloutNumber}
            promptsShownCount={displayedPrompts.length}
        />
        {#if hasResponses}
            <ResponseList
                prompts={displayedPrompts}
                {algorithm}
                {domain}
                {paintDisabled}
                {multiPrompt}
                {selectedToken}
                {dimEnabled}
                {onTokenClick}
            />
        {:else}
            <div class="no-rollouts">{strings.detailPanel.noResponses}</div>
        {/if}
        {#if hasResponses}
            <section class="objectives">
                <div class="objectives-grid">
                    <div class="obj-col">
                        <div class="obj-label-row label-legend">
                            <Label overline>{strings.detailPanel.objectives.tokenLevel.label}</Label>
                            <LegendBar
                                colorSource="token_objective"
                                {domain}
                            />
                        </div>
                        <p class="obj-desc">
                            {strings.detailPanel.objectives.tokenLevel.description}
                            <span class="obj-help">
                                {@html strings.detailPanel.objectives.tokenLevel.helpDecreaseHtml}
                                {@html strings.detailPanel.objectives.tokenLevel.helpIncreaseHtml}
                            </span>
                        </p>
                    </div>
                    {#if onAlgorithmExplainer}
                        <button
                            type="button"
                            class="obj-col clickable"
                            onclick={onAlgorithmExplainer}
                        >
                            <div class="obj-label-row">
                                <Label overline>{strings.detailPanel.objectives.stepLevel.label}</Label>
                                {#if policyLoss !== null && policyLoss !== undefined}
                                    <span data-connect="step-level-value">
                                        <PolicyLossBox value={policyLoss} />
                                    </span>
                                {:else}
                                    <span
                                        class="obj-value"
                                        data-connect="step-level-value"
                                        style:background={objectiveBg}
                                    >
                                        {fmtObjective(stepObjective)}
                                    </span>
                                {/if}
                                <span class="learn-more" aria-hidden="true">
                                    {strings.detailPanel.objectives.stepLevel.learnMore}
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                    >
                                        <path
                                            d="M5 17.59L15.59 7H9V5h10v10h-2V8.41L6.41 19 5 17.59z"
                                        />
                                    </svg>
                                </span>
                            </div>
                            <p class="obj-desc">
                                {strings.detailPanel.objectives.stepLevel.description}
                            </p>
                        </button>
                    {:else}
                        <div class="obj-col">
                            <div class="obj-label-row">
                                <Label overline>{strings.detailPanel.objectives.stepLevel.label}</Label>
                                {#if policyLoss !== null && policyLoss !== undefined}
                                    <span data-connect="step-level-value">
                                        <PolicyLossBox value={policyLoss} />
                                    </span>
                                {:else}
                                    <span
                                        class="obj-value"
                                        data-connect="step-level-value"
                                        style:background={objectiveBg}
                                    >
                                        {fmtObjective(stepObjective)}
                                    </span>
                                {/if}
                            </div>
                            <p class="obj-desc">
                                {strings.detailPanel.objectives.stepLevel.description}
                            </p>
                        </div>
                    {/if}
                </div>
            </section>
        {/if}
    {/if}
</div>

<style lang="scss">
    .detail-panel {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding-right: 2rem;
        overflow: hidden;
    }
    .placeholder {
        @include type-body;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $c-ink-3;
        &.error {
            color: $c-red-strong;
        }
    }
    .no-rollouts {
        @include type-body;
        flex: 1;
        color: $c-ink-3;
        font-style: italic;
        padding: $sp-4 0;
    }

    .objectives {
        flex-shrink: 0;

        padding: $sp-4 $sp-5 $sp-6 0;
        border-top: 1px solid $c-line;
        background: $c-surface;
        display: flex;
        flex-direction: column;
        gap: $sp-3;
    }
    .objectives-head {
        display: flex;
        align-items: center;
        gap: $sp-2;
    }
    .objectives-title {
        @include type-section-title;
        margin: 0;
    }
    .objectives-grid {
        display: flex;
        flex-direction: column;
        gap: $sp-4;
    }
    .obj-col {
        display: flex;
        flex-direction: column;
        gap: $sp-2;
        min-width: 0;
    }
    // Step-level column renders as a button so the whole column is clickable.
    // Default button styles are reset so its content matches a plain div.
    button.obj-col {
        font: inherit;
        color: inherit;
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        text-align: left;

        &.clickable {
            cursor: pointer;

            &:hover :global(.obj-value),
            &:hover :global(.obj-desc) {
                color: $c-ink-1;
            }
        }
    }
    .obj-label-row {
        display: flex;
        align-items: center;
        gap: $sp-3;
        flex-wrap: wrap;
    }
    // token-level row: Label on the left, LegendBar pushed to the right.
    .obj-label-row.label-legend {
        justify-content: space-between;
    }
    .obj-value {
        @include type-meta-value;
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
        font-size: $fs-md;
        font-weight: $fw-medium;
        line-height: 1;
        // Slight inset so the heatmap background doesn't crowd the glyphs.
        padding: $sp-1 $sp-2;
        border-radius: $radius-sm;
    }
    .obj-desc {
        @include type-description;
        margin: 0;
    }
    .learn-more {
        @include type-description;
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: $sp-1;
        color: $c-ink-3;
        white-space: nowrap;
        border: 1px solid $c-line;
        padding: $sp-1 $sp-2;
        border-radius: $radius-sm;
        svg {
            display: block;
            transition: transform 120ms ease-out;
        }
    }
    button.obj-col.clickable:hover .learn-more {
        color: $c-ink-2;

        svg {
            transform: translateX(2px);
        }
    }
    .obj-help {
        @include type-description;
        margin: 0;
        color: $c-ink-3;

        :global(.down) {
            color: $c-pink;
            font-weight: 500;
        }
        :global(.up) {
            color: $c-green;
            font-weight: 500;
        }
        :global(b) {
            color: $c-ink-2;
            font-weight: $fw-medium;
        }
    }

</style>
