<script lang="ts">
    import RadialChart from "$lib/radial-chart/RadialChart.svelte";
    import RunHeader from "$lib/ui/RunHeader.svelte";
    import DetailPanel from "$lib/detail-panel/DetailPanel.svelte";
    import LearningModeController from "$lib/learning-mode/LearningModeController.svelte";
    import AlgorithmExplainer from "$lib/algorithm-explainer/AlgorithmExplainer.svelte";
    import {
        robustTokenObjectiveDomain,
        tokenHeatmapColor,
    } from "$lib/detail-panel/color-domain";
    import { getAlgorithmDef } from "$lib/algorithm-explainer/loader";
    import {
        evaluateAllSlots,
        type BindingContext,
    } from "$lib/algorithm-explainer/bindings";
    import {
        algoExplainer,
        toggleOpen,
        setAlgorithm,
        clearAlgorithm,
        setCompareWith,
        addVisibleCard,
    } from "$lib/algorithm-explainer/state.svelte";
    import { untrack, onMount } from "svelte";
    import CrossPaneConnections from "$lib/connections/CrossPaneConnections.svelte";
    import {
        setConnection,
        removeConnection,
    } from "$lib/connections/state.svelte";
    import { Badge, RunRail } from "$lib/ui";
    import type { RailRun } from "$lib/ui";
    import { strings } from "$lib/i18n/strings";
    import {
        loadDapoStep,
        loadRealAlgo,
        loadRealStep,
    } from "$lib/radial-chart/adapters";
    import type {
        TrainingStep,
        PromptGroup,
        AlgoData,
        AlgoHparams,
        RunMeta,
    } from "$lib/radial-chart/types";
    import { DEFAULT_SELECTED_METRICS } from "$lib/radial-chart/types";
    import { computeRolloutPhases } from "$lib/radial-chart/rollout-phases";
    import { base } from "$app/paths";

    type DataSource = string;
    // Run list shown in the rail; loaded dynamically from static/algos.json.
    let railRunsBase: Array<{ key: string; abbr: string; fullName: string }> = $state([]);
    let algosLoaded = $state(false);

    let dataSource: DataSource = $state(""); // onMount sets it to algos.json's first entry
    let algorithm: string = $state("grpo");
    let hparams: AlgoHparams = $state({});
    let runMeta: RunMeta | undefined = $state(undefined);
    let radialSteps: TrainingStep[] = $state([]);
    let loading = $state(false);
    let loadError: string | null = $state(null);
    const cache: Record<string, AlgoData> = {};
    // Reactive cache of loaded source meta for rail tooltips.
    let metaByKey: Partial<Record<string, RunMeta>> = $state({});

    const railRuns: RailRun[] = $derived(
        railRunsBase.map((r) => ({ ...r, meta: metaByKey[r.key] })),
    );

    onMount(async () => {
        try {
            const res = await fetch(`${base}/algos.json`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { algos: Array<{ key: string; abbr: string; fullName: string }> };
            railRunsBase = data.algos;
            // Default selection: grpo if present, otherwise first entry.
            if (data.algos.length > 0 && !algosLoaded) {
                const grpo = data.algos.find((a) => a.key === "grpo");
                dataSource = grpo ? grpo.key : data.algos[0].key;
            }
            algosLoaded = true;
        } catch (e) {
            console.error("Failed to load static/algos.json:", e);
            railRunsBase = [];
            algosLoaded = true;
        }
    });

    // Gate so lines are only drawn after the explainer slide-in (220ms) finishes:
    // settled=false for ~500ms after open prevents jank during the slide;
    // on close, drop to false immediately to clear lines before the slide starts.
    let panelSettled = $state(false);
    $effect(() => {
        const isOpen = algoExplainer.open;
        if (!isOpen) {
            panelSettled = false;
            return;
        }
        panelSettled = false;
        const t = setTimeout(() => {
            panelSettled = true;
        }, 500);
        return () => clearTimeout(t);
    });

    // Static connection from Step-level Objective ↔ explainer step-level card.
    // When a token is selected, token-ratio/reward-adv lines take priority — hide step line
    // to avoid visual noise from overlapping line types.
    // No cleanup return is used: doing so would race a remove+set on every effect re-fire.
    // Removal happens explicitly in the inactive branch.
    $effect(() => {
        const settled = panelSettled;
        const hasToken = selectedToken !== null;
        if (!settled || hasToken) {
            untrack(() => removeConnection("step-level"));
            return;
        }
        untrack(() => {
            setConnection({
                id: "step-level",
                fromSel: '[data-connect="step-level-value"]',
                toSel: '[data-card-id="step-level"] > header',
                toClipSel: ".canvas-viewport",
                opacity: 0.12,
            });
        });
    });

    // On token selection: auto-open the explainer and ensure token-level is in visibleCards.
    // addVisibleCard re-includes defaultVisibleCards so an early/stale empty read of
    // visibleCards can never persist a state missing the algorithm's root card.
    $effect(() => {
        if (!selectedToken) return;
        untrack(() => {
            if (!algoExplainer.open) {
                algoExplainer.open = true;
            }
            addVisibleCard("token-level");
        });
    });

    // Register connection lines on token selection.
    //   token-ratio: always 1 (clicked token → token-level card's Ratio box)
    //   reward-adv: per algorithm
    //     PPO/REINFORCE: only the clicked response
    //     GRPO/Dr.GRPO/DAPO: every response in the same prompt group (N)
    $effect(() => {
        const sel = selectedToken;
        const algo = algorithm;
        const isOpen = panelSettled;
        // Restrict to responses in the selected token's prompt group: in group algorithms,
        // advantage is defined only over rewards within the same prompt.
        const promptGroup = sel
            ? selectedStep?.prompts?.find((g) =>
                  g.responses.some((r) => r.id === sel.rolloutId),
              )
            : null;
        const responses = promptGroup?.responses ?? [];

        untrack(() => {
            if (!sel || !isOpen || responses.length === 0) return;

            const ratioTo = '[data-card-id="token-level"] .term--what';
            const advTo = '[data-card-id="token-level"] .term--how';
            const clip = ".canvas-viewport";

            // Token → Ratio: blue dashed. Reward → Advantage: green solid.
            //   Color/pattern differs so overlapping lines remain distinguishable.
            //   fromClipSel: the rollout's .collapsed-area; its left edge is the real token
            //     clip boundary, where the line fades in (no match in expanded mode → no fade).
            //   fromVClipSel: list scroll-area — clamps to ▲/▼ when scrolled past edges.
            const ROLLOUT_CLIP = ".scroll-area";
            setConnection({
                id: "token-ratio",
                fromSel: `[data-connect="token-${sel.rolloutId}-${sel.tokenIndex}"]`,
                toSel: ratioTo,
                toClipSel: clip,
                fromClipSel: `[data-rollout-clip="${sel.rolloutId}"]`,
                fromVClipSel: ROLLOUT_CLIP,
                color: "#1e4d8c", // $c-blue-strong
                dasharray: "4 3",
            });

            const isGroup =
                algo === "grpo" || algo === "drgrpo" || algo === "dapo";
            const rewardResponses = isGroup
                ? responses.map((r) => r.id)
                : [sel.rolloutId];
            const rewardSels = rewardResponses.map(
                (rid) => `[data-connect="reward-${rid}"]`,
            );

            // For group algorithms, pass fromSel as an array → fan-in (branches merge into trunk).
            //   colorFromSource: each reward text's actual color (green/grey/black scale) on
            //     the branch; trunk is the RGB average of branches.
            //   opacityFromSource: ResponseCard's data-line-opacity (linear 0.2 black → 0.5 green);
            //     trunk uses the average of branch opacities.
            setConnection({
                id: "reward-adv",
                fromSel: rewardSels.length === 1 ? rewardSels[0] : rewardSels,
                toSel: advTo,
                toClipSel: clip,
                fromClipSel: ROLLOUT_CLIP,
                colorFromSource: true,
                opacityFromSource: true,
            });
        });

        return () => {
            untrack(() => {
                removeConnection("token-ratio");
                removeConnection("reward-adv");
            });
        };
    });

    // Reset token selection when dataSource changes: response IDs differ across algorithms
    // and stale selectors would leave dangling lines.
    $effect(() => {
        void dataSource;
        untrack(() => {
            selectedToken = null;
        });
    });

    // Closing the explainer also clears token selection so dim mode / lines do not linger.
    $effect(() => {
        const isOpen = algoExplainer.open;
        untrack(() => {
            if (!isOpen) selectedToken = null;
        });
    });

    let selectedStepIdx: number | null = $state(0);
    let selectedToken: { rolloutId: string; tokenIndex: number } | null =
        $state(null);
    let detailLoading = $state(false);
    let detailError: string | null = $state(null);

    function handleTokenClick(rolloutId: string, tokenIndex: number) {
        if (
            selectedToken &&
            selectedToken.rolloutId === rolloutId &&
            selectedToken.tokenIndex === tokenIndex
        ) {
            selectedToken = null;
            return;
        }
        selectedToken = { rolloutId, tokenIndex };
    }
    // Key = `${dataSource}:${stepKey}` — avoids step-number collisions across sources.
    // Source-agnostic so any algorithm can move to per-step fetch later.
    let detailCache = $state(
        new Map<string, { prompts: PromptGroup[] }>(),
    );
    const detailKey = (src: DataSource, step: number) => `${src}:${step}`;

    /**
     * Per-source step-detail fetcher. Sources whose radialSteps already include prompts
     * return null (no cache use). Add a branch here as more sources move to per-step fetch.
     */
    async function fetchStepDetail(
        src: DataSource,
        stepKey: number,
    ): Promise<{ prompts: PromptGroup[] } | null> {
        if (src === "dapo") {
            const data = await loadDapoStep(stepKey);
            return { prompts: data.prompts };
        }
        if (src === "ppo" || src === "reinforce" || src === "grpo" || src === "drgrpo") {
            const data = await loadRealStep(src, stepKey);
            return { prompts: data.prompts };
        }
        // New algorithms added via algos.json: per-step fetch.
        const data = await loadRealStep(src, stepKey);
        return { prompts: data.prompts };
    }

    // Selected metrics shared (bind) between RadialChart and StepMetrics.
    let selectedMetrics: string[] = $state([...DEFAULT_SELECTED_METRICS]);

    // Learning mode state.
    let learningMode = $state(false);
    let learningCutoff: number | null = $state(null);
    let learningTarget: number = $state(0);
    let chartContainerEl: HTMLElement | null = $state(null);
    let detailPanelEl: HTMLElement | null = $state(null);
    let policyLossValue: number | null = $state(null);
    /** Flips true at beat 7; afterward, token heatmap bg is painted. */
    let heatmapPainted = $state(false);

    const algoOpen = $derived(algoExplainer.open);

    // Slide layout gate. On close, delay ~2 frames so dim/line cleanup paints before the
    // slide transition starts. On open, immediate.
    //   - dim/lines are torn down as soon as algoOpen drops;
    //   - .explainer-open class is removed only after algoOpenLayout drops → slide begins.
    let algoOpenLayout = $state(false);
    $effect(() => {
        const open = algoOpen;
        if (open) {
            algoOpenLayout = true;
            return;
        }
        const t = setTimeout(() => (algoOpenLayout = false), 32);
        return () => clearTimeout(t);
    });

    // Evaluate algorithm-card slot values for the selected token.
    // Empty Map when no token is selected (cards render without slot values).
    let slotValues = $derived.by(() => {
        const sel = selectedToken;
        const step = selectedStep;
        const algoDef = algoExplainer.algorithm;
        if (!sel || !step || !algoDef) return new Map<string, string>();

        const promptGroup = step.prompts?.find((g) =>
            g.responses.some((r) => r.id === sel.rolloutId),
        );
        if (!promptGroup) return new Map<string, string>();
        const response = promptGroup.responses.find(
            (r) => r.id === sel.rolloutId,
        );
        if (!response || !response.tokens) return new Map<string, string>();

        const ctx: BindingContext = {
            header: { hparams, meta: runMeta ?? {} },
            entry: step,
            prompt: promptGroup,
            response,
            tokens: response.tokens,
            tokenIndex: sel.tokenIndex,
        };
        return evaluateAllSlots(algoDef, ctx, algoExplainer.visibleCards);
    });

    // Color applied to the explainer heatmap header — maps the selected token's
    // token_objective using the same domain/palette as the detail panel.
    let tokenObjectiveColor: string | null = $derived.by(() => {
        const sel = selectedToken;
        const step = selectedStep;
        if (!sel || !step) return null;
        const promptGroup = step.prompts?.find((g) =>
            g.responses.some((r) => r.id === sel.rolloutId),
        );
        const response = promptGroup?.responses.find(
            (r) => r.id === sel.rolloutId,
        );
        const v = response?.tokens?.token_objective?.[sel.tokenIndex];
        if (v == null || !Number.isFinite(v)) return null;
        const all = step.prompts?.flatMap((g) => g.responses) ?? [];
        return tokenHeatmapColor(v, robustTokenObjectiveDomain(all));
    });

    // Layout constants — single source of truth.
    // CSS picks them up via var(--rail-w) / var(--step-min) / var(--radial-frac).
    const RAIL_W_PX = 152;
    const STEP_MIN_PX = 400;
    const EXPLAINER_MIN_PX = 320;
    // Training view (.radial-left) width ratio. 0.55 = training 55% / step view 45%.
    const RADIAL_FRAC = 0.55;

    // Explainer column width (drag-resizable). Persist to localStorage.
    let explainerPx = $state(600);
    let resizing = $state(false);
    let explainerEl: HTMLDivElement | undefined = $state();
    // Viewport-relative X of the explainer's right edge captured at drag start; fixed for the drag.
    let resizeRight = 0;

    $effect(() => {
        const stored = localStorage.getItem("explainerPx");
        if (stored) {
            const n = parseInt(stored, 10);
            if (!isNaN(n)) explainerPx = n;
        }
    });

    function clampExplainer(w: number): number {
        // With explainer open, visible training-view width = (viewport - rail) × radial-frac / 3.5.
        // Compute max so step view does not drop below STEP_MIN_PX.
        const innerMinusRail = window.innerWidth - RAIL_W_PX;
        const radialVisible = (innerMinusRail * RADIAL_FRAC) / 3.5;
        const maxW = Math.max(
            EXPLAINER_MIN_PX,
            innerMinusRail - radialVisible - STEP_MIN_PX,
        );
        return Math.max(EXPLAINER_MIN_PX, Math.min(maxW, w));
    }

    function onResizeDown(e: PointerEvent) {
        resizing = true;
        // Cache explainer right edge so width stays accurate regardless of right-side components.
        resizeRight = explainerEl?.getBoundingClientRect().right ?? window.innerWidth;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    }
    function onResizeMove(e: PointerEvent) {
        if (!resizing) return;
        explainerPx = clampExplainer(resizeRight - e.clientX);
    }
    function onResizeUp(e: PointerEvent) {
        if (!resizing) return;
        resizing = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        localStorage.setItem("explainerPx", String(explainerPx));
    }

    // Selection is invalid before data loads — RadialChart fisheye crashes on empty arrays.
    let effectiveSelectedIdx = $derived(
        radialSteps.length > 0 && selectedStepIdx !== null
            ? Math.min(selectedStepIdx, radialSteps.length - 1)
            : null,
    );

    // Currently selected step (metrics + loaded prompts merged).
    let selectedStep: TrainingStep | null = $derived.by(() => {
        if (selectedStepIdx === null) return null;
        const base = radialSteps[selectedStepIdx];
        if (!base) return null;
        const enriched = detailCache.get(detailKey(dataSource, base.step));
        if (!enriched) return base;
        return {
            ...base,
            prompts: enriched.prompts,
        };
    });

    let rolloutPhases = $derived(computeRolloutPhases(radialSteps));
    let selectedRolloutNumber = $derived(
        selectedStepIdx === null
            ? null
            : (rolloutPhases.phaseOf(selectedStepIdx)?.number ?? null),
    );

    function handleStepClick(idx: number) {
        if (idx < 0) {
            selectedStepIdx = null;
            return;
        }
        selectedStepIdx = idx;
        // Detail fetch is handled by the $effect that watches selectedStepIdx/dataSource.
    }

    /** For paths (e.g. learning mode) that must await detail load completion. */
    async function ensureStepDetail(src: DataSource, idx: number) {
        const base = radialSteps[idx];
        if (!base) return;
        const key = detailKey(src, base.step);
        if (detailCache.has(key)) return;
        try {
            const detail = await fetchStepDetail(src, base.step);
            if (!detail) return;
            detailCache.set(key, detail);
            detailCache = new Map(detailCache);
        } catch (e) {
            detailError = (e as Error).message;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            selectedStepIdx = null;
        }
    }

    async function loadSource(src: DataSource) {
        const cached = cache[src];
        if (cached) {
            ({ algorithm, hparams, steps: radialSteps, meta: runMeta } =
                cached);
            return;
        }
        loading = true;
        loadError = null;
        try {
            let data: AlgoData = await loadRealAlgo(src);
            cache[src] = data;
            ({ algorithm, hparams, steps: radialSteps, meta: runMeta } = data);
            if (data.meta) metaByKey = { ...metaByKey, [src]: data.meta };
        } catch (e) {
            loadError = (e as Error).message;
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (!dataSource) return;
        loadSource(dataSource);
    });

    // Use dataSource (algos.json's canonical key) to look up the explainer def,
    // not the algorithm field — header.algorithm in metrics files may be a
    // human-friendly label (e.g. "PPO", "REINFORCE (Williams, 1992)") that
    // doesn't match the lowercase ALGORITHMS map keys.
    $effect(() => {
        if (!dataSource) return;
        const def = getAlgorithmDef(dataSource);
        if (def) setAlgorithm(def);
        else clearAlgorithm();
    });

    // Background prefetch of (dataSource, selectedStep) detail.
    // The selectedStep $derived absorbs prompts/responses once detailCache updates.
    // No-op when fetchStepDetail returns null (mock).
    $effect(() => {
        if (selectedStepIdx === null) return;
        const base = radialSteps[selectedStepIdx];
        if (!base) return;
        const src = dataSource;
        const stepKey = base.step;
        const key = detailKey(src, stepKey);
        if (detailCache.has(key)) return;
        detailLoading = true;
        detailError = null;
        fetchStepDetail(src, stepKey)
            .then((detail) => {
                if (!detail) return;
                detailCache.set(key, detail);
                detailCache = new Map(detailCache);
            })
            .catch((e) => {
                detailError = (e as Error).message;
            })
            .finally(() => {
                detailLoading = false;
            });
    });

    $effect(() => {
        window.addEventListener("keydown", handleKeydown);
        return () => window.removeEventListener("keydown", handleKeydown);
    });

    async function toggleLearningMode() {
        if (learningMode) {
            learningMode = false;
            learningCutoff = null;
            policyLossValue = null;
            heatmapPainted = false;
            return;
        }
        heatmapPainted = false;
        const target = selectedStepIdx ?? 0;
        selectedStepIdx = target;
        await ensureStepDetail(dataSource, target);
        learningTarget = target;
        learningCutoff = target - 1;
        // Use policy_objective only when present in the data; null leaves the UI blank.
        policyLossValue = selectedStep?.metrics?.policy_objective ?? null;
        learningMode = true;
    }

    function onAnimationCutoffAdvance() {
        if (learningCutoff === null) return;
        learningCutoff = learningTarget;
    }

    function onAnimationPaintHeatmap() {
        heatmapPainted = true;
    }

    function onAnimationComplete() {
        // no-op: pause and wait; turning OFF is manual.
    }

    async function handleLearningStepClick(idx: number) {
        if (idx < 0) return;
        selectedStepIdx = idx;
        await ensureStepDetail(dataSource, idx);
        learningTarget = idx;
        learningCutoff = idx - 1;
        heatmapPainted = false;
        policyLossValue = selectedStep?.metrics?.policy_objective ?? null;
    }
</script>

<main
    style="--explainer-w: {explainerPx}px; --rail-w: {RAIL_W_PX}px; --step-min: {STEP_MIN_PX}px; --radial-frac: {RADIAL_FRAC};"
    class:resizing
>
    <div class="content-col">
    <div class="radial-layout" class:explainer-open={algoOpenLayout}>
        <div class="radial-left">
            <RunHeader {algorithm} meta={runMeta}>
                {#snippet actions()}
                    {#if loading}
                        <Badge color="neutral" variant="tint" size="sm">
                            {strings.page.loadingBadge}
                        </Badge>
                    {/if}
                    {#if loadError}
                        <Badge color="red" variant="tint" size="sm">
                            {loadError}
                        </Badge>
                    {/if}
                {/snippet}
            </RunHeader>
            <div bind:this={chartContainerEl} class="chart-wrap">
                <RadialChart
                    steps={radialSteps}
                    downsampleBins={1000}
                    onStepClick={learningMode
                        ? handleLearningStepClick
                        : handleStepClick}
                    selectedStep={effectiveSelectedIdx}
                    learningCutoff={learningMode ? learningCutoff : null}
                    interactionsDisabled={learningMode}
                    bind:selectedMetrics
                    rotateSelectedToRight={algoOpen}
                    explainerOpen={algoOpen}
                />
            </div>
        </div>
        <div class="radial-right" bind:this={detailPanelEl}>
            <DetailPanel
                step={selectedStep}
                loading={detailLoading}
                error={detailError}
                {algorithm}
                runMeta={runMeta}
                forceAllRollouts={learningMode}
                paintDisabled={learningMode && !heatmapPainted}
                policyLoss={learningMode ? policyLossValue : null}
                explainerOpen={algoOpen}
                onAlgorithmExplainer={toggleOpen}
                rolloutNumber={selectedRolloutNumber}
                {selectedToken}
                dimEnabled={panelSettled}
                onTokenClick={handleTokenClick}
            />
        </div>
        <div class="radial-explainer" class:open={algoOpen} bind:this={explainerEl}>
            {#if algoOpen}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="resize-handle"
                    onpointerdown={onResizeDown}
                    onpointermove={onResizeMove}
                    onpointerup={onResizeUp}
                    onpointercancel={onResizeUp}
                ></div>
                <AlgorithmExplainer
                    {slotValues}
                    {tokenObjectiveColor}
                    onClose={toggleOpen}
                />
            {/if}
        </div>
    </div>
    </div>
    <CrossPaneConnections />
    <RunRail
        runs={railRuns}
        current={dataSource}
        {loading}
        onSelect={(key) => {
            if (key === dataSource) return;
            // In diff view: clicking the compare target (new) as prev swaps with current prev,
            // letting the user toggle between two algorithms without losing context.
            if (algoExplainer.compareWith === key) {
                setCompareWith(dataSource);
            }
            dataSource = key as DataSource;
            selectedStepIdx = 0;
        }}
    />
</main>

<LearningModeController
    active={learningMode}
    targetStep={learningTarget}
    {algorithm}
    {chartContainerEl}
    {detailPanelEl}
    onAdvanceCutoff={onAnimationCutoffAdvance}
    onPaintHeatmap={onAnimationPaintHeatmap}
    onComplete={onAnimationComplete}
/>

<style lang="scss">
    :global(*),
    :global(*::before),
    :global(*::after) {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    :global(body) {
        @include type-body;
        background: $c-bg;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
    :global(h1, h2, h3, h4, h5, h6) {
        margin: 0;
        color: $c-ink-1;
        font-weight: $fw-medium;
        letter-spacing: -0.02em;
    }
    :global(button) {
        font-family: inherit;
    }

    :global(img, picture, video, canvas, svg) {
        display: block;
        max-width: 100%;
    }

    :global(input, button, textarea, select) {
        font: inherit;
    }

    main {
        // --rail-w / --step-min are injected from TS constants (RAIL_W_PX / STEP_MIN_PX).
        // Edit them at the top of +page.svelte; also check .rail { width }.
        position: relative;
        padding: 0;
        height: 100vh;
        overflow: hidden;
        display: flex;
        flex-direction: row;
        gap: 0;
    }

    main.resizing {
        cursor: col-resize;
        user-select: none;
    }

    .content-col {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .radial-layout {
        flex: 1;
        display: grid;
        // No gap: gap correction is ugly with %-based grids. Inter-column spacing is
        // handled by each child's padding.
        min-height: 0;
        position: relative;
        // z-index 10: must sit above RunRail's run-btn (z-index:1) so internal tooltips
        // (z-index:1000) can cover the rail across stacking contexts.
        z-index: 10;
        width: 100%;

        // Use % units throughout grid-template-columns (fr ↔ calc cannot interpolate).
        // Default: radial = --radial-frac × 100%, detail = remainder, explainer 0.
        grid-template-columns:
            calc(var(--radial-frac) * 100%)
            calc((1 - var(--radial-frac)) * 100%)
            0;
        grid-template-rows: 1fr;
        grid-template-areas: "radial detail explainer";
        transition: grid-template-columns 220ms ease;
    }
    // Explainer open:
    //   - radial column: shrinks to 1/3.5 of normal radial width
    //   - detail: takes the remainder (100% - radial - explainer)
    //   - explainer: var(--explainer-w)
    // .radial-left's own width stays viewport-fixed (ignores grid cell).
    .radial-layout.explainer-open {
        grid-template-columns:
            calc(var(--radial-frac) * 100% / 3.5)
            calc(100% - var(--radial-frac) * 100% / 3.5 - var(--explainer-w, 0px))
            var(--explainer-w, 0px);
    }

    .radial-left {
        grid-area: radial;
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        padding: 0 0 $sp-2 $sp-4;
        // Fixed viewport-based width so the box keeps its size when the grid cell shrinks.
        // = (viewport - RunRail) × --radial-frac = normal radial width.
        // The child chart receives a smooth transform without ResizeObserver redraws.
        width: calc((100vw - var(--rail-w)) * var(--radial-frac));
        transition: transform 220ms ease;
    }
    // Explainer open: translateX by -2.5/3.5 of its own width so only the right 1/3.5 is
    // visible; the left 2.5/3.5 is clipped by main's overflow:hidden.
    .radial-layout.explainer-open .radial-left {
        transform: translateX(calc(-250% / 3.5));
    }

    .radial-right {
        grid-area: detail;
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: var(--step-min);
        overflow: hidden;
        padding: 0 0 $sp-2;
    }

    .radial-explainer {
        grid-area: explainer;
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
        position: relative;
        overflow: hidden;
    }

    // Explainer open: dim non-chart parts of the training view (RunHeader, Training Metrics
    // control bar). Same timing/easing as the layout slide (220ms). DetailPanel stays as-is.
    .radial-left :global(.run-header),
    .radial-left :global(.control-bar) {
        transition: opacity 220ms ease;
    }
    .radial-layout.explainer-open .radial-left :global(.run-header),
    .radial-layout.explainer-open .radial-left :global(.control-bar) {
        opacity: 0;
    }

    // Disable transitions while drag-resizing so width tracks the pointer instantly.
    main.resizing .radial-layout,
    main.resizing .radial-left {
        transition: none;
    }

    .resize-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        left: -6px;
        width: 12px;
        cursor: col-resize;
        z-index: 10;
        touch-action: none;
        // No visual element — only a hover area + cursor change.
    }

    .chart-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
</style>
