<script lang="ts">
    import type { TrainingStep, RunMeta } from "$lib/radial-chart/types";
    import { Label, Tooltip } from "$lib/ui";
    import { strings, t } from "$lib/i18n/strings";

    interface Props {
        step: TrainingStep | null;
        runMeta?: RunMeta;
        algorithm?: string;
        explainerOpen?: boolean;
        onAlgorithmExplainer?: () => void;
        /** 0-based rollout cycle number; null hides the rollout line. */
        rolloutNumber?: number | null;
        /**
         * Actual number of prompts displayed (after DetailPanel slicing).
         * Defaults to step.prompts.length when not provided (no slicing case).
         * If this is less than the data's total prompt count, the meta line
         * switches to "(representative N prompts shown below)".
         */
        promptsShownCount?: number;
    }
    let {
        step,
        runMeta,
        algorithm = "",
        explainerOpen = false,
        onAlgorithmExplainer,
        rolloutNumber = null,
        promptsShownCount,
    }: Props = $props();

    let explainerLabel = $derived(
        t(strings.stepHeader.explainerButton, {
            algorithm: algorithm ? algorithm.toUpperCase() : "",
        }),
    );

    let promptsInBatch = $derived(
        step?.batch?.promptsInBatch ?? runMeta?.rolloutBatchSize,
    );
    let responsesPerPrompt = $derived(
        step?.batch?.responsesPerPrompt ?? runMeta?.groupSize,
    );
    let promptsTotal = $derived(step?.prompts?.length ?? 0);
    let promptsShown = $derived(promptsShownCount ?? promptsTotal);
    // Representative mode: shown count is fewer than the step's true total
    // prompt count.
    //   GRPO: data has 1, but batch info (promptsInBatch=8) is the real total.
    //   DAPO: data has 4, slice shows 2 → 4 is the real total.
    //   Use the max of the two as the comparison baseline.
    let promptsTrueTotal = $derived(
        Math.max(promptsInBatch ?? 0, promptsTotal),
    );
    let isRepresentative = $derived(
        promptsShown > 0 && promptsShown < promptsTrueTotal,
    );

    type MetaRow = {
        count: number;
        rest: string;
        representative?: boolean;
    };
    let metaParts = $derived.by((): MetaRow[] => {
        const parts: MetaRow[] = [];
        if (promptsInBatch != null) {
            const w =
                promptsInBatch === 1
                    ? strings.stepHeader.unitPrompt
                    : strings.stepHeader.unitPrompts;
            parts.push({
                count: promptsInBatch,
                rest: `${w} ${strings.stepHeader.perStep}`,
            });
        }
        if (responsesPerPrompt != null) {
            const w =
                responsesPerPrompt === 1
                    ? strings.stepHeader.unitResponse
                    : strings.stepHeader.unitResponses;
            parts.push({
                count: responsesPerPrompt,
                rest: `${w} ${strings.stepHeader.perPrompt}`,
            });
        }
        if (promptsShown > 0) {
            parts.push(
                isRepresentative
                    ? {
                          count: promptsShown,
                          rest: strings.stepHeader.promptsShownBelow,
                          representative: true,
                      }
                    : {
                          count: promptsShown,
                          rest: strings.stepHeader.shownBelow,
                      },
            );
        }
        return parts;
    });
</script>

<header class="step-header">
    <div class="title-row">
        {#if step}
            <span class="number">{strings.stepHeader.stepLabel} {step.step.toLocaleString()}</span>
        {/if}
        {#if !explainerOpen}
            <button
                type="button"
                class="explainer-btn"
                onclick={onAlgorithmExplainer}
                title={strings.stepHeader.explainerTitleShow}
            >
                <span>{explainerLabel}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 9a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0 9.821 9.821 0 0 0-17.64 0Z"/>
                </svg>
            </button>
        {/if}
    </div>
    {#if step && (metaParts.length > 0 || rolloutNumber !== null)}
        <span class="meta">
            {#if rolloutNumber !== null}
                <span class="rollout-group">
                    <span class="meta-rest">{strings.stepHeader.rolloutLabel} <span class="rollout-num">#{rolloutNumber}</span></span>
                    <Tooltip
                        title={strings.stepHeader.rolloutTooltip.title}
                        content={strings.stepHeader.rolloutTooltip.content}
                        placement="top"
                    >
                        <span class="info-icon" aria-label={strings.stepHeader.rolloutInfoAriaLabel}>
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                                <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2" fill="none" />
                                <circle cx="7" cy="4.2" r="0.8" fill="currentColor" />
                                <path d="M7 6.4 V10.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                            </svg>
                        </span>
                    </Tooltip>
                </span>
                {#if metaParts.length > 0}<span class="meta-sep"></span>{/if}
            {/if}
            {#each metaParts as p, i}
                {#if i > 0}<span class="meta-sep">, </span>{/if}
                {#if p.representative}
                    (<span class="meta-num">{p.count.toLocaleString()}</span>
                    <span class="meta-rest">{p.rest})</span>
                {:else}
                    <span class="meta-num">{p.count.toLocaleString()}</span>
                    <span class="meta-rest">{p.rest}</span>
                {/if}
            {/each}
        </span>
    {/if}
</header>

<style lang="scss">
    .step-header {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: $sp-2;
        width: 100%;
        padding: $sp-4 0 $sp-3;
        padding-bottom: 2rem;
    }

    // Row 1: step number (left) + algorithm explainer button (right). Spans full panel width.
    .title-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: $sp-4;
        width: 100%;
    }

    .number {
        @include type-display;
        line-height: 1;
        font-variant-numeric: tabular-nums;
    }

    .meta {
        @include type-meta-label;
        color: $c-ink-3;
    }
    .meta-num {
        color: $c-ink-1;
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
        font-weight: $fw-medium;
        margin-right: 4px;
    }
    .meta-sep {
        margin-right: 2px;
    }
    .rollout-group {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-right: 4px;
    }
    .rollout-num {
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
    }
    .info-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: $c-ink-3;
        cursor: help;
    }

    .explainer-btn {
        @include type-chip;
        flex-shrink: 0;
        // Keep button right-aligned even when step is null.
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: $sp-2;
        padding: $sp-2 $sp-3;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        color: $c-ink-2;
        cursor: pointer;
        transition:
            color 120ms ease,
            border-color 120ms ease,
            background 120ms ease,
            box-shadow 120ms ease;

        &:hover {
            color: $c-ink-1;
            border-color: $c-ink-3;
            background: $c-surface-subtle;
        }
    }
</style>
