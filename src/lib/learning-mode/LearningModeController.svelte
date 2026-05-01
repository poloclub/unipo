<!-- src/lib/learning-mode/LearningModeController.svelte -->
<script lang="ts">
    import { onMount, tick } from "svelte";
    import { gsap } from "gsap";
    import CenterLLMLabel from "./CenterLLMLabel.svelte";
    import GenerationArrow from "./GenerationArrow.svelte";
    import BatchUpdateArrow from "./BatchUpdateArrow.svelte";
    import { buildTimeline, type TimelineRefs } from "./timeline";

    interface Props {
        active: boolean;
        targetStep: number;
        algorithm: string;
        chartContainerEl: HTMLElement | null;
        detailPanelEl: HTMLElement | null;
        onAdvanceCutoff: () => void;
        onPaintHeatmap: () => void;
        onComplete: () => void;
    }
    let {
        active,
        targetStep,
        algorithm,
        chartContainerEl,
        detailPanelEl,
        onAdvanceCutoff,
        onPaintHeatmap,
        onComplete,
    }: Props = $props();

    let beatTitleEl: HTMLDivElement | null = $state(null);
    let beatTitle = $state("");
    let genArrowApi: {
        draw: (d: number) => gsap.core.Timeline;
        startFlow: () => void;
        stopFlow: () => void;
        fadeOut: (d: number) => gsap.core.Timeline;
    } | null = $state(null);
    let batchArrowApi: {
        draw: (d: number) => gsap.core.Timeline;
        startFlow: () => void;
        stopFlow: () => void;
        showLabel: (d: number) => gsap.core.Timeline;
    } | null = $state(null);

    let chartCenter = $state({ x: 0, y: 0 });
    let llmPos = $state({ x: 0, y: 0 });
    let responsesStart = $state({ x: 0, y: 0 });
    let policyLossBoxBottom = $state({ x: 0, y: 0 });

    let currentTl: gsap.core.Timeline | null = null;
    let startToken = 0;

    // Beat title sits below the step / N / total text.
    const TITLE_Y_OFFSET = 60;

    function measure() {
        if (!chartContainerEl) return;
        const svg = chartContainerEl.querySelector(".radial-chart-svg");
        if (svg) {
            const r = svg.getBoundingClientRect();
            chartCenter = {
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
            };
        } else {
            const chartRect = chartContainerEl.getBoundingClientRect();
            chartCenter = {
                x: chartRect.left + chartRect.width / 2,
                y: chartRect.top + chartRect.height / 2,
            };
        }
        llmPos = { x: chartCenter.x, y: chartCenter.y + TITLE_Y_OFFSET };

        if (detailPanelEl) {
            const cards = detailPanelEl.querySelector(".rollout-list .cards");
            if (cards) {
                const cr = cards.getBoundingClientRect();
                responsesStart = { x: cr.left, y: cr.top + 20 };
            }
            const loss = detailPanelEl.querySelector(".policy-loss-block");
            if (loss) {
                const lr = loss.getBoundingClientRect();
                policyLossBoxBottom = {
                    x: lr.left + lr.width / 2,
                    y: lr.bottom,
                };
            }
        }
    }

    function collectRefs(): TimelineRefs {
        const tokenEls: HTMLElement[] = [];
        const rolloutCardEls: HTMLElement[] = [];
        const rewardEls: HTMLElement[] = [];
        let promptBlockEl: HTMLElement | null = null;
        let promptLabelEl: HTMLElement | null = null;
        let responsesLabelEl: HTMLElement | null = null;
        let rewardLabelEl: HTMLElement | null = null;
        let objectiveBlockEl: HTMLElement | null = null;
        let policyLossBlockEl: HTMLElement | null = null;

        if (detailPanelEl) {
            promptBlockEl = detailPanelEl.querySelector(".prompt-block .text");
            promptLabelEl = detailPanelEl.querySelector(
                ".prompt-block .label",
            );
            responsesLabelEl = detailPanelEl.querySelector(
                ".rollout-list .section-header .left",
            );
            rewardLabelEl = detailPanelEl.querySelector(
                ".rollout-list .section-header .reward-col",
            );
            rolloutCardEls.push(
                ...Array.from(
                    detailPanelEl.querySelectorAll<HTMLElement>(
                        ".rollout-list .card",
                    ),
                ),
            );
            rewardEls.push(
                ...Array.from(
                    detailPanelEl.querySelectorAll<HTMLElement>(
                        ".rollout-list .reward",
                    ),
                ),
            );
            tokenEls.push(
                ...Array.from(
                    detailPanelEl.querySelectorAll<HTMLElement>(
                        ".rollout-list .token-seq .tok",
                    ),
                ),
            );
            // Beat 4 fade-in only targets the legend area (policy loss is beat 5).
            objectiveBlockEl = detailPanelEl.querySelector(".legend-area");
            policyLossBlockEl =
                detailPanelEl.querySelector(".policy-loss-block");
        }

        return {
            promptBlockEl,
            promptLabelEl,
            responsesLabelEl,
            rewardLabelEl,
            objectiveBlockEl,
            policyLossBlockEl,
            beatTitleEl,
            algorithm,
            genArrow: genArrowApi,
            rolloutCardEls,
            rewardEls,
            tokenEls,
            batchArrow: batchArrowApi,
            onAdvanceCutoff,
            onPaintHeatmap,
            onSetBeatTitle: (s: string) => {
                beatTitle = s;
            },
            onComplete,
        };
    }

    async function start() {
        const myToken = ++startToken;
        if (currentTl) {
            currentTl.kill();
            currentTl = null;
        }
        beatTitle = "";
        await tick();
        if (myToken !== startToken) return;
        await tick();
        if (myToken !== startToken) return;
        await tick();
        if (myToken !== startToken) return;
        measure();
        await tick();
        if (myToken !== startToken) return;
        const refs = collectRefs();
        const tl = buildTimeline(refs);
        currentTl = tl;
        tl.play();
    }

    function stop() {
        if (currentTl) {
            currentTl.kill();
            currentTl = null;
        }
        genArrowApi?.stopFlow();
        batchArrowApi?.stopFlow();
    }

    $effect(() => {
        targetStep;
        if (active) {
            start();
        } else {
            stop();
        }
    });

    onMount(() => {
        const onResize = () => measure();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });
</script>

{#if active}
    <CenterLLMLabel
        x={llmPos.x}
        y={llmPos.y}
        {beatTitle}
        titleRef={(el) => (beatTitleEl = el)}
    />
    <GenerationArrow
        start={chartCenter}
        end={responsesStart}
        apiRef={(api) => (genArrowApi = api)}
    />
    <BatchUpdateArrow
        start={policyLossBoxBottom}
        end={chartCenter}
        apiRef={(api) => (batchArrowApi = api)}
    />
{/if}
