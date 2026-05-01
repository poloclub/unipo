<script lang="ts">
    import * as d3 from "d3";
    import { untrack } from "svelte";
    import { Tween } from "svelte/motion";
    import { cubicOut } from "svelte/easing";
    import {
        type TrainingStep,
        type ChartMode,
        METRIC_COLORS,
        metricColor,
        metricLabel,
        CHART_CONSTANTS,
        DEFAULT_FISHEYE,
        DEFAULT_FISHEYE_SEGMENT,
        DEFAULT_SELECTED_METRICS,
    } from "./types";
    import {
        lttbDownsample,
        extractMetricSeries,
        mergeWithFullResolution,
    } from "./downsample";
    import {
        createAngleScale,
        createRadiusScale,
        ringBaseRadius,
    } from "./scales";
    import {
        createFisheyeAngle,
        fisheyeSegments,
    } from "./fisheye";
    import { computeRolloutPhases } from "./rollout-phases";
    import { computeRolloutSegments } from "./rollout-segments";
    import { METRIC_DEFINITIONS } from "./metric-definitions";
    import { Chip, Tooltip } from "$lib/ui";
    import { strings } from "$lib/i18n/strings";

    function fmtMetricValue(v: number | undefined): string {
        if (v === undefined || !Number.isFinite(v)) return strings.common.dash;
        const abs = Math.abs(v);
        if (abs === 0) return "0";
        if (abs < 0.01 || abs >= 10000) return v.toExponential(1);
        if (abs < 1) return v.toFixed(3);
        if (abs < 100) return v.toFixed(2);
        return v.toFixed(0);
    }

    interface Props {
        steps: TrainingStep[];
        /** LTTB downsample target bin count. null disables downsampling (full-res). Default 500. */
        downsampleBins?: number | null;
        /** Fisheye focus half-width (±N steps). */
        focusRadius?: number;
        /** Fraction of circumference occupied by the focus region (0..1). */
        focusFraction?: number;
        /** Displacement absorption ramp (ratio of totalSteps, 0..0.5). */
        rampFraction?: number;
        /** Gaussian sigma ratio (relative to focusRadius). */
        taperSigma?: number;
        /** Segment min/max pixel size, gap, and point radius. */
        minSegPx?: number;
        maxSegPx?: number;
        gapPx?: number;
        pointRadius?: number;
        onStepClick?: (step: number) => void;
        /** Selected step index (for click-pinned triangle). null = none. */
        selectedStep?: number | null;
        /** Learning mode: hide metric curves past this step index. null renders all. */
        learningCutoff?: number | null;
        /** Disables hover/click interactions when true. */
        interactionsDisabled?: boolean;
        /** Bindable from parent — currently selected metrics. */
        selectedMetrics?: string[];
        /** Extra content rendered between chart-area and control-bar. */
        belowChart?: import("svelte").Snippet;
        /** true rotates the selectedStep at toggle time to 3 o'clock; false returns to 0. */
        rotateSelectedToRight?: boolean;
        /** Rollout phase length (metadata source of truth). Without it, phase progress is hidden. */
        rolloutSize?: number | null;
        /** When explainer opens and the radial area shrinks to 1/3, right-align chart-area
         *  so the chart stays visible in the remaining space. Returns to center on close. */
        explainerOpen?: boolean;
    }

    let {
        steps,
        downsampleBins = CHART_CONSTANTS.DOWNSAMPLE_BINS,
        focusRadius = DEFAULT_FISHEYE.focusRadius,
        focusFraction = DEFAULT_FISHEYE.focusFraction,
        rampFraction = DEFAULT_FISHEYE.rampFraction,
        taperSigma = DEFAULT_FISHEYE.taperSigma,
        minSegPx = DEFAULT_FISHEYE_SEGMENT.minSegPx,
        maxSegPx = DEFAULT_FISHEYE_SEGMENT.maxSegPx,
        gapPx = DEFAULT_FISHEYE_SEGMENT.gapPx,
        pointRadius = DEFAULT_FISHEYE_SEGMENT.pointRadius,
        onStepClick,
        selectedStep = null,
        learningCutoff = null,
        interactionsDisabled = false,
        selectedMetrics = $bindable([...DEFAULT_SELECTED_METRICS]),
        belowChart,
        rotateSelectedToRight = false,
        rolloutSize = null,
        explainerOpen = false,
    }: Props = $props();

    const mode: ChartMode = "rings";
    let hoverStep: number | null = $state(null);
    let svgEl: SVGSVGElement;
    // rollout band hover tooltip — { rolloutNumber, x, y } in container-relative px
    let rolloutBandHover: {
        rolloutNumber: number;
        startStep: number;
        endStep: number;
        length: number;
        x: number;
        y: number;
    } | null = $state(null);

    let innermostR = $derived(
        mode === "rings" ? ringBaseRadius(0) : CHART_CONSTANTS.BASE_RADIUS,
    );
    let markerStepIdx = $derived(
        interactionsDisabled ? null : hoverStep !== null ? hoverStep : selectedStep,
    );
    // Focus step for center text: hover takes priority over selection.
    let focusStep = $derived(
        hoverStep !== null
            ? hoverStep
            : selectedStep !== null
              ? selectedStep
              : null,
    );

    // Sort by METRIC_COLORS definition order (canonical) so chip order stays stable
    // across algorithms; unknown keys go to the end.
    let availableMetrics = $derived.by(() => {
        const set = new Set<string>();
        for (const s of steps) {
            for (const k of Object.keys(s.metrics)) {
                if (s.metrics[k] !== undefined) set.add(k);
            }
        }
        const order = Object.keys(METRIC_COLORS);
        const rank = (k: string) => {
            const i = order.indexOf(k);
            return i === -1 ? Number.POSITIVE_INFINITY : i;
        };
        return [...set].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    });

    let fisheyeConfig = $derived({
        focusRadius,
        focusFraction,
        rampFraction,
        taperSigma,
    });

    // Layout: viewBox is fixed; chart content uses fit-scale to always fill the outer.
    //   VIEW_SIZE: viewBox side length (fixed)
    //   TARGET_OUTER: outer radius the chart content should occupy (viewBox units)
    //   PADDING: margin so outer triangle markers (which extend +18) are not clipped
    // Pixel-unit constants (pointRadius, font-size, stroke-width, ...) stay in SVG units;
    // since viewBox is fixed, on-screen px stay constant regardless of ring count.
    const VIEW_SIZE = 1000;
    const PADDING = 22;
    const TARGET_OUTER = VIEW_SIZE / 2 - PADDING; // = 478
    let totalRings = $derived(mode === "rings" ? selectedMetrics.length : 1);
    let outerMostRadius = $derived(
        mode === "rings"
            ? ringBaseRadius(totalRings - 1) + CHART_CONSTANTS.MAX_AREA_HEIGHT
            : CHART_CONSTANTS.BASE_RADIUS + CHART_CONSTANTS.MAX_AREA_HEIGHT,
    );
    // Fit chart content to TARGET_OUTER. Few rings → >1 (zoom in); many → <1 (zoom out).
    // The outer radius stays fixed at TARGET_OUTER.
    let fit = $derived(TARGET_OUTER / outerMostRadius);
    const size = VIEW_SIZE;
    const cx = VIEW_SIZE / 2;
    const cy = VIEW_SIZE / 2;

    // px input is in viewBox units (= screen px). Fisheye angle calc uses chart-coord
    // radii, so convert viewBox px → chart-coord px via px / fit; that way the rendered
    // arc length on baseR*fit matches the input px visually.
    let segmentConfig = $derived({
        minSegPx: minSegPx / fit,
        maxSegPx: maxSegPx / fit,
        gapPx: gapPx / fit,
        baseRadius: CHART_CONSTANTS.BASE_RADIUS,
    });

    // --- Scales ---
    let angleScale = $derived(createAngleScale(steps.length));

    let radiusScales = $derived.by(() => {
        const scales = new Map<string, d3.ScaleLinear<number, number>>();
        for (const metric of selectedMetrics) {
            const values = steps
                .map((s) => s.metrics[metric])
                .filter(
                    (v): v is number => v !== undefined && Number.isFinite(v),
                );
            if (values.length === 0) continue;
            const [min, max] = d3.extent(values) as [number, number];
            scales.set(metric, createRadiusScale(min, max));
        }
        return scales;
    });

    // Downsampled data (downsampleBins=null → full resolution).
    let downsampledData = $derived.by(() => {
        const data = new Map<string, { index: number; value: number }[]>();
        for (const metric of selectedMetrics) {
            const series =
                downsampleBins === null
                    ? extractMetricSeries(steps, metric)
                    : lttbDownsample(steps, metric, downsampleBins);
            data.set(metric, series);
        }
        return data;
    });

    // Fisheye is active whenever focusStep (hover or selection) exists.
    // gapArc keeps area path and segments aligned to the same gap baseline.
    // viewBox-px → chart-coord-px: gapPx / fit; radians = chart-px / chart-radius.
    let gapArc = $derived((gapPx / fit) / CHART_CONSTANTS.BASE_RADIUS);
    let fisheyeAngleFn = $derived(
        createFisheyeAngle(steps.length, focusStep, {
            ...fisheyeConfig,
            gapArc,
        }),
    );

    // Start at 12 o'clock (angle=0) and leave a visual gap before the last step wraps back.
    // The fisheye function works on full [0, 2π]; rendering compresses to [0, 2π - END_GAP].
    const END_GAP = 0.04; // rad ≈ 17°
    const VISIBLE_RANGE = Math.PI * 2 - END_GAP;
    const VISIBLE_SCALE = VISIBLE_RANGE / (Math.PI * 2);
    function visAngle(raw: number): number {
        // raw can slightly exceed [0, 2π] near the edges of fisheye 'center' anchor mode.
        // Without clamp the result leaks past the 12 o'clock gap line.
        const r = Math.max(0, Math.min(raw, Math.PI * 2));
        return r * VISIBLE_SCALE;
    }
    // Mouse input → original [0, 2π] domain; null if inside the gap.
    function visAngleToRaw(vis: number): number | null {
        if (vis > Math.PI * 2 - END_GAP) return null;
        return vis / VISIBLE_SCALE;
    }

    // step → point angle. Only step 0 / last are snapped to their segment's left/right edge
    // so the start/end points sit exactly at 12 o'clock and the final position.
    function pointAngle(stepIdx: number): number {
        if (focusStep === null) return fisheyeAngleFn(stepIdx);
        const seg = fisheyeSegs.find((s) => s.step === stepIdx);
        if (!seg) return fisheyeAngleFn(stepIdx);
        if (stepIdx === 0) return seg.centerAngle - seg.halfArc;
        if (stepIdx === steps.length - 1)
            return seg.centerAngle + seg.halfArc;
        return seg.centerAngle;
    }

    // Render data: merge full-resolution points inside the fisheye region.
    let renderData = $derived.by(() => {
        const ds = downsampledData;
        const cutoff = learningCutoff;
        const filterCutoff = (pts: { index: number; value: number }[]) =>
            cutoff === null ? pts : pts.filter((p) => p.index <= cutoff);

        if (focusStep === null) {
            if (cutoff === null) return ds;
            const filtered = new Map<
                string,
                { index: number; value: number }[]
            >();
            for (const [k, v] of ds) filtered.set(k, filterCutoff(v));
            return filtered;
        }

        const mergeR = focusRadius + 5;
        const merged = new Map<string, { index: number; value: number }[]>();
        for (const metric of selectedMetrics) {
            const dsPoints = ds.get(metric);
            if (!dsPoints) continue;
            const full = mergeWithFullResolution(
                dsPoints,
                steps,
                metric,
                focusStep,
                mergeR,
            );
            merged.set(metric, filterCutoff(full));
        }
        return merged;
    });

    // Area path (fisheye-distorted but local only).
    function generateAreaPath(metric: string, metricIndex: number): string {
        const points = renderData.get(metric);
        if (!points || points.length === 0) return "";

        const rScale = radiusScales.get(metric);
        if (!rScale) return "";
        const baseR =
            mode === "rings"
                ? ringBaseRadius(metricIndex)
                : CHART_CONSTANTS.BASE_RADIUS;

        // chart-coord radii → viewBox radii via × fit.
        const areaGen = d3
            .areaRadial<{ index: number; value: number }>()
            .angle((d) => visAngle(pointAngle(d.index)))
            .innerRadius(baseR * fit)
            .outerRadius((d) => (baseR + rScale(d.value)) * fit)
            .curve(d3.curveLinear); // do not connect 0↔last — training is acyclic

        return areaGen(points) ?? "";
    }

    // Fisheye segments on circumference (hover or selection).
    let fisheyeSegs = $derived(
        focusStep === null
            ? []
            : fisheyeSegments(
                  steps.length,
                  focusStep,
                  fisheyeConfig,
                  segmentConfig,
              ),
    );

    // Rollout phase info (derived from is_first_step_after_rollout_phase).
    let rolloutPhases = $derived(computeRolloutPhases(steps));
    let phaseOfFocus = $derived(
        focusStep === null ? null : rolloutPhases.phaseOf(focusStep),
    );
    let rolloutSegments = $derived(
        computeRolloutSegments(rolloutPhases, steps.length),
    );

    // Rollout band: a thin concentric ring drawn just inside the innermost ring.
    //   BAND_OFFSET: chart-coord units (innermostR=150 → drawn at 142).
    //   BAND_HIT_HALF: tooltip hover hit radius (±) including stroke + visual margin.
    const ROLLOUT_BAND_OFFSET = 8;
    const ROLLOUT_BAND_HIT_HALF = 7;
    let rolloutBandR = $derived(innermostR - ROLLOUT_BAND_OFFSET);

    /**
     * Rollout segment groups visible inside the fisheye region. Only meaningful when
     * fisheye is active; if fisheye crosses a rollout boundary the band splits in two.
     * Each group spans up to its own step segments' left/right edges (may be clipped).
     */
    let rolloutBandSegments = $derived.by(() => {
        if (fisheyeSegs.length === 0 || rolloutSegments.length === 0)
            return [] as Array<{
                rolloutNumber: number;
                firstHalfArc: number;
                lastHalfArc: number;
                startCenter: number;
                endCenter: number;
                firstStep: number;
                rolloutSegStartIdx: number;
                rolloutSegEndIdx: number;
                rolloutSegLength: number;
            }>;
        const rolloutByNumber = new Map(
            rolloutSegments.map((r) => [r.number, r]),
        );
        const groups: Array<{
            rolloutNumber: number;
            firstHalfArc: number;
            lastHalfArc: number;
            startCenter: number;
            endCenter: number;
            firstStep: number;
            rolloutSegStartIdx: number;
            rolloutSegEndIdx: number;
            rolloutSegLength: number;
        }> = [];
        for (const fseg of fisheyeSegs) {
            const phase = rolloutPhases.phaseOf(fseg.step);
            if (!phase) continue;
            const rseg = rolloutByNumber.get(phase.number);
            if (!rseg) continue;
            const last = groups[groups.length - 1];
            if (last && last.rolloutNumber === phase.number) {
                last.lastHalfArc = fseg.halfArc;
                last.endCenter = fseg.centerAngle;
            } else {
                groups.push({
                    rolloutNumber: phase.number,
                    firstHalfArc: fseg.halfArc,
                    lastHalfArc: fseg.halfArc,
                    startCenter: fseg.centerAngle,
                    endCenter: fseg.centerAngle,
                    firstStep: fseg.step,
                    rolloutSegStartIdx: rseg.startIdx,
                    rolloutSegEndIdx: rseg.endIdx,
                    rolloutSegLength: rseg.length,
                });
            }
        }
        return groups;
    });
    // halfArc grows toward the center → brush-stroke effect (thick at center, thin at edges).
    let maxHalfArc = $derived(
        fisheyeSegs.length === 0
            ? 1
            : Math.max(...fisheyeSegs.map((s) => s.halfArc)),
    );
    function segStroke(halfArc: number): number {
        const t = halfArc / (maxHalfArc || 1);
        // viewBox=1000 units. Non-linear curve emphasizes the peak.
        return 3 + Math.pow(t, 0.7) * 9;
    }

    // Fisheye region angle range (to cut gap in baseline)
    let fisheyeAngleRange = $derived.by(
        (): { start: number; end: number } | null => {
            if (fisheyeSegs.length === 0) return null;
            const first = fisheyeSegs[0];
            const last = fisheyeSegs[fisheyeSegs.length - 1];
            const margin = (gapPx / fit) / CHART_CONSTANTS.BASE_RADIUS;
            return {
                start: first.centerAngle - first.halfArc - margin,
                end: last.centerAngle + last.halfArc + margin,
            };
        },
    );

    function angleToXY(
        angle: number,
        radius: number,
    ): { x: number; y: number } {
        const a = angle - Math.PI / 2;
        return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
    }

    function svgArc(
        startAngle: number,
        endAngle: number,
        radius: number,
    ): string {
        const p1 = angleToXY(startAngle, radius);
        const p2 = angleToXY(endAngle, radius);
        const large = endAngle - startAngle > Math.PI ? 1 : 0;
        return `M${p1.x},${p1.y} A${radius},${radius} 0 ${large} 1 ${p2.x},${p2.y}`;
    }

    function baselineRadii(): number[] {
        if (mode === "overlay") return [CHART_CONSTANTS.BASE_RADIUS];
        return selectedMetrics.map((_, i) => ringBaseRadius(i));
    }

    // mouse → viewBox coords → chart (unscaled) coords (undo fit).
    function svgMouse(event: MouseEvent): { mx: number; my: number } | null {
        if (!svgEl) return null;
        const rect = svgEl.getBoundingClientRect();
        const svgScale = VIEW_SIZE / rect.width;
        const vx = (event.clientX - rect.left) * svgScale - cx;
        const vy = (event.clientY - rect.top) * svgScale - cy;
        return { mx: vx / fit, my: vy / fit };
    }

    // Inside a rotated group, subtract the rotation from the screen angle to get logical step.
    function unrotateAngle(angle: number): number {
        const rotRad = (rotation.current * Math.PI) / 180;
        let a = angle - rotRad;
        const TAU = Math.PI * 2;
        a = ((a % TAU) + TAU) % TAU;
        return a;
    }

    function handleMouseMove(event: MouseEvent) {
        if (interactionsDisabled) return;
        const m = svgMouse(event);
        if (!m) return;
        let angle = Math.atan2(m.my, m.mx) + Math.PI / 2;
        angle = unrotateAngle(angle);
        const raw = visAngleToRaw(angle);
        if (raw === null) {
            hoverStep = null;
            rolloutBandHover = null;
            return;
        }
        const stepFromAngle = Math.round((raw / (Math.PI * 2)) * steps.length);
        const newHover = Math.max(
            0,
            Math.min(steps.length - 1, stepFromAngle),
        );
        hoverStep = newHover;

        // Rollout band hover hit-test: mouse r within band radius ± hit half.
        // r and bandR are both in chart-coords.
        const r = Math.hypot(m.mx, m.my);
        const inBand =
            r >= rolloutBandR - ROLLOUT_BAND_HIT_HALF &&
            r <= rolloutBandR + ROLLOUT_BAND_HIT_HALF;
        if (!inBand) {
            rolloutBandHover = null;
            return;
        }
        const phase = rolloutPhases.phaseOf(newHover);
        if (phase === null) {
            rolloutBandHover = null;
            return;
        }
        // The band only renders inside fisheye, so tooltip is limited to that region.
        const visibleGroup = rolloutBandSegments.find(
            (g) => g.rolloutNumber === phase.number,
        );
        if (!visibleGroup) {
            rolloutBandHover = null;
            return;
        }
        const seg = rolloutSegments.find((s) => s.number === phase.number);
        if (!seg) {
            rolloutBandHover = null;
            return;
        }
        // Tooltip position relative to chart-area (svg parent).
        const containerRect = (
            svgEl.parentElement as HTMLElement
        ).getBoundingClientRect();
        rolloutBandHover = {
            rolloutNumber: seg.number,
            startStep: steps[seg.startIdx]?.step ?? seg.startIdx,
            endStep: steps[seg.endIdx]?.step ?? seg.endIdx,
            length: seg.length,
            x: event.clientX - containerRect.left,
            y: event.clientY - containerRect.top,
        };
    }

    function handleMouseLeave() {
        if (interactionsDisabled) return;
        hoverStep = null;
        rolloutBandHover = null;
    }

    // Click in the chart-area outside the SVG (empty space) clears the selection.
    function handleAreaClick(event: MouseEvent) {
        if (interactionsDisabled) return;
        if (!onStepClick) return;
        if (event.target !== event.currentTarget) return;
        onStepClick(-1);
    }

    function handleClick(event: MouseEvent) {
        if (interactionsDisabled) return;
        if (!onStepClick) return;
        const m = svgMouse(event);
        if (!m) return;
        // Center click (r < BASE_RADIUS * 0.5) clears the selection.
        const r = Math.hypot(m.mx, m.my);
        if (r < CHART_CONSTANTS.BASE_RADIUS * 0.5) {
            onStepClick(-1); // -1 = clear signal
            return;
        }
        let angle = Math.atan2(m.my, m.mx) + Math.PI / 2;
        angle = unrotateAngle(angle);
        const raw = visAngleToRaw(angle);
        if (raw === null) return; // click inside the gap → ignore
        const stepIdx = Math.round((raw / (Math.PI * 2)) * steps.length);
        const clamped = Math.max(0, Math.min(steps.length - 1, stepIdx));
        // Re-clicking the already-selected step clears it.
        if (clamped === selectedStep) {
            onStepClick(-1);
            return;
        }
        onStepClick(clamped);
    }

    function toggleMetric(metric: string) {
        if (!availableMetrics.includes(metric)) return;
        const idx = selectedMetrics.indexOf(metric);
        if (idx >= 0) {
            if (selectedMetrics.length > 1)
                selectedMetrics = selectedMetrics.filter((m) => m !== metric);
        } else if (
            selectedMetrics.length < CHART_CONSTANTS.MAX_SELECTED_METRICS
        ) {
            selectedMetrics = [...selectedMetrics, metric];
        }
    }

    // Drop selectedMetrics that disappear after a data swap.
    // Skip when availableMetrics is empty (loading) so selectedMetrics is preserved.
    $effect(() => {
        if (availableMetrics.length === 0) return;
        const filtered = selectedMetrics.filter((m) => availableMetrics.includes(m));
        if (filtered.length !== selectedMetrics.length) {
            selectedMetrics =
                filtered.length > 0
                    ? filtered
                    : availableMetrics.slice(0, 1);
        }
    });

    // Rotation: when algorithm view toggles, animate the selected step's actual point
    // to 3 o'clock. First/last steps are snapped to segment edges (pointAngle) and then
    // compressed by visAngle, so the rotation anchor uses the same visAngle(pointAngle(sel)).
    // Capture selAngle at the toggle moment; on toggle-off, return to 0. selectedStep
    // changes mid-rotation must not retrigger the tween — hence untrack.
    const rotation = new Tween(0, { duration: 500, easing: cubicOut });

    $effect(() => {
        const active = rotateSelectedToRight;
        untrack(() => {
            if (!active) {
                rotation.target = 0;
                return;
            }
            const sel = selectedStep;
            if (sel === null || sel < 0 || sel >= steps.length) {
                rotation.target = 0;
                return;
            }
            const angle = visAngle(pointAngle(sel));
            const deg = ((Math.PI / 2 - angle) * 180) / Math.PI;
            rotation.target = deg;
        });
    });
</script>

<div class="radial-chart-container">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="chart-area"
        class:explainer-open={explainerOpen}
        onclick={handleAreaClick}
    >
        <svg
            bind:this={svgEl}
            viewBox="0 0 {VIEW_SIZE} {VIEW_SIZE}"
            class="radial-chart-svg"
            onmousemove={handleMouseMove}
            onmouseleave={handleMouseLeave}
            onclick={handleClick}
            role="img"
        >
            <g transform="translate({cx}, {cy}) rotate({rotation.current})">
                <!-- Area paths -->
                {#each selectedMetrics as metric, i}
                    <path
                        d={generateAreaPath(metric, i)}
                        fill="{metricColor(metric)}4d"
                        stroke={metricColor(metric)}
                        stroke-width="1.5"
                        opacity="1"
                    />
                {/each}

                <!-- Baseline circle(s) -->
                {#each baselineRadii() as radius}
                    {@const rView = radius * fit}
                    {#if fisheyeAngleRange}
                        <!-- Outside fisheye: split into end→(2π-GAP) and 0→start arcs -->
                        <path
                            d={svgArc(
                                visAngle(fisheyeAngleRange.end),
                                Math.PI * 2 - END_GAP,
                                rView,
                            )}
                            fill="none"
                            stroke="#707070"
                            stroke-width="2"
                        />
                        <path
                            d={svgArc(
                                0,
                                visAngle(fisheyeAngleRange.start),
                                rView,
                            )}
                            fill="none"
                            stroke="#707070"
                            stroke-width="2"
                        />
                        {#each fisheyeSegs as seg}
                            <path
                                d={svgArc(
                                    visAngle(seg.centerAngle - seg.halfArc),
                                    visAngle(seg.centerAngle + seg.halfArc),
                                    rView,
                                )}
                                fill="none"
                                stroke="#161616"
                                stroke-width={segStroke(seg.halfArc)}
                                stroke-linecap="butt"
                            />
                        {/each}
                    {:else}
                        <path
                            d={svgArc(0, Math.PI * 2 - END_GAP, rView)}
                            fill="none"
                            stroke="#707070"
                            stroke-width="2"
                        />
                    {/if}
                {/each}

                <!-- Tier 1: Rollout band — only inside the active fisheye region;
                     splits when fisheye crosses a rollout boundary. -->
                {#if rolloutBandSegments.length > 0}
                    {@const bandView = rolloutBandR * fit}
                    {@const segGapArc = 10 / fit / rolloutBandR}
                    {#each rolloutBandSegments as g (g.rolloutNumber)}
                        {@const startVis =
                            visAngle(g.startCenter - g.firstHalfArc) +
                            segGapArc / 2}
                        {@const endVis =
                            visAngle(g.endCenter + g.lastHalfArc) -
                            segGapArc / 2}
                        {#if endVis > startVis}
                            <path
                                d={svgArc(startVis, endVis, bandView)}
                                fill="none"
                                stroke="#e2e2e2"
                                stroke-width="6"
                                stroke-linecap="butt"
                            />
                            <!-- Rollout cycle start tick — only when the group's first
                                 visible step is the actual rollout start (skip when fisheye
                                 enters the cycle mid-way). -->
                            {#if g.firstStep === g.rolloutSegStartIdx}
                                {@const tickIn = angleToXY(startVis, bandView )}
                                {@const tickOut = angleToXY(startVis, bandView)}
                                <line
                                    x1={tickIn.x}
                                    y1={tickIn.y}
                                    x2={tickOut.x}
                                    y2={tickOut.y}
                                    stroke="#3a3a3a"
                                    stroke-width="6"
                                    stroke-linecap="round"
                                />
                            {/if}
                        {/if}
                    {/each}
                {/if}

                <!-- Fisheye: connectors + dots (hidden in learning mode to avoid leaking future metrics) -->
                {#if fisheyeSegs.length > 0 && !interactionsDisabled}
                    {#each fisheyeSegs as seg}
                        {#each selectedMetrics as metric, metricIndex}
                            {@const baseR =
                                mode === "rings"
                                    ? ringBaseRadius(metricIndex)
                                    : CHART_CONSTANTS.BASE_RADIUS}
                            {@const rScale = radiusScales.get(metric)}
                            {@const value = steps[seg.step]?.metrics[metric]}
                            {@const outerR =
                                baseR +
                                (rScale && value !== undefined
                                    ? rScale(value)
                                    : 0)}
                            {@const segPt = angleToXY(
                                visAngle(pointAngle(seg.step)),
                                baseR * fit,
                            )}
                            {@const areaPt = angleToXY(
                                visAngle(pointAngle(seg.step)),
                                outerR * fit,
                            )}

                            <line
                                x1={segPt.x}
                                y1={segPt.y}
                                x2={areaPt.x}
                                y2={areaPt.y}
                                stroke="#4a4a4a"
                                stroke-width="0.8"
                                opacity="0.4"
                            />
                            <circle
                                cx={areaPt.x}
                                cy={areaPt.y}
                                r={pointRadius}
                                fill={metricColor(metric)}
                            />
                        {/each}
                    {/each}
                {/if}

                <!-- Start point (step 0) marker: 12 o'clock tick + "0" label + short clockwise arrow. -->
                {#if innermostR > 0}
                    {@const outerView = outerMostRadius * fit}
                    {@const innerView = innermostR * fit}
                    {@const tickInner = angleToXY(0, innerView)}
                    {@const tickOuter = angleToXY(0, outerView)}
                    {@const startLabelPt = angleToXY(0, innerView - 35)}
                    {@const arrowR = innerView - 35}
                    {@const arrowStart = angleToXY(0.06, arrowR)}
                    {@const arrowEnd = angleToXY(0.18, arrowR)}
                    <line
                        x1={tickInner.x}
                        y1={tickInner.y}
                        x2={tickOuter.x}
                        y2={tickOuter.y}
                        stroke="#707070"
                        stroke-width="1.5"
                    />
                    <text
                        x={startLabelPt.x}
                        y={startLabelPt.y + 5}
                        text-anchor="middle"
                        font-size="17"
                        fill="#707070"
                    >
                        0
                    </text>
                    <path
                        d={`M ${arrowStart.x},${arrowStart.y} A ${arrowR},${arrowR} 0 0 1 ${arrowEnd.x},${arrowEnd.y}`}
                        fill="none"
                        stroke="#707070"
                        stroke-width="1.2"
                        marker-end="url(#start-arrow-head)"
                    />
                {/if}

                <!-- Selected step: always-on guide line + per-metric points -->
                {#if selectedStep !== null && selectedStep >= 0 && selectedStep < steps.length}
                    {@const selAngle = visAngle(pointAngle(selectedStep))}
                    {@const selInner = angleToXY(selAngle, innermostR * fit)}
                    {@const selOuter = angleToXY(
                        selAngle,
                        outerMostRadius * fit,
                    )}
                    <line
                        x1={selInner.x}
                        y1={selInner.y}
                        x2={selOuter.x}
                        y2={selOuter.y}
                        stroke="#161616"
                        stroke-width="1.5"
                        stroke-opacity="0.4"
                        stroke-dasharray="5 5"
                    />
                    {#if !interactionsDisabled}
                        {#each selectedMetrics as metric, mi}
                            {@const m = steps[selectedStep]?.metrics?.[metric]}
                            {#if m !== undefined && Number.isFinite(m)}
                                {@const rScale = radiusScales.get(metric)}
                                {#if rScale}
                                    {@const baseR = ringBaseRadius(mi)}
                                    {@const ptR = (baseR + rScale(m)) * fit}
                                    {@const pt = angleToXY(selAngle, ptR)}
                                    <circle
                                        cx={pt.x}
                                        cy={pt.y}
                                        r="5.5"
                                        fill={metricColor(metric)}
                                        stroke="#161616"
                                        stroke-width="1.5"
                                    />
                                {/if}
                            {/if}
                        {/each}
                    {/if}
                {/if}

                <!-- Hover/selected outer triangle marker -->
                {#if markerStepIdx !== null && markerStepIdx >= 0 && markerStepIdx < steps.length}
                    {@const markerAngle = visAngle(pointAngle(markerStepIdx))}
                    {@const tipR = outerMostRadius * fit + 5}
                    {@const mBaseR = tipR + 13}
                    {@const halfW = 8 / mBaseR}
                    {@const tipPt = angleToXY(markerAngle, tipR)}
                    {@const bLPt = angleToXY(markerAngle - halfW, mBaseR)}
                    {@const bRPt = angleToXY(markerAngle + halfW, mBaseR)}
                    <polygon
                        points={`${tipPt.x},${tipPt.y} ${bLPt.x},${bLPt.y} ${bRPt.x},${bRPt.y}`}
                        fill="#161616"
                    />
                {/if}
            </g>

            <!-- Center text overlay: outside the rotation group so it stays upright. -->
            <g transform="translate({cx}, {cy})">
                <text
                    x="0"
                    y="-22"
                    text-anchor="middle"
                    // dominant-baseline="middle"
                    font-size="20"
                    font-weight="500"
                    fill="#707070"
                >
                    {strings.radialChart.centerStepLabel}
                </text>
                <text
                    x="0"
                    y="30"
                    text-anchor="middle"
                    // dominant-baseline="middle"
                    font-family="-apple-system, system-ui, sans-serif"
                    fill="#171717"
                >
                    <tspan font-size="50" font-weight="400" dy="0" >
                        {(focusStep === null
                            ? 0
                            : (steps[focusStep]?.step ?? 0)
                        ).toLocaleString()}
                    </tspan>
                    <tspan
                        font-size="30"
                        font-weight="400"
                        fill="#707070"
                        dx="0"
                        dy="-5"   
                    >
                        /{(
                            steps[steps.length - 1]?.step ?? 0
                        ).toLocaleString()}
                    </tspan>
                </text>

                <!-- Tier 2/3: Rollout phase context. With rolloutSize metadata, show progress
                     (offset/length + arc); otherwise only the phase number. -->
                {#if phaseOfFocus !== null}
                    {@const p = phaseOfFocus}
                    {@const hasSize = rolloutSize != null && rolloutSize > 0}
                    <text
                        x="0"
                        y="60"
                        text-anchor="middle"
                        dominant-baseline="middle"
                        font-size="20"
                        font-weight="500"
                        fill="#707070"
                    >
                        rollout #{p.number}{hasSize
                            ? ` · step ${p.offset} / ${rolloutSize}`
                            : ""}
                    </text>
                    {#if hasSize}
                        {@const ratio = Math.max(
                            0,
                            Math.min(p.offset / (rolloutSize as number), 1),
                        )}
                        {@const arcR = 8}
                        {@const arcCirc = 2 * Math.PI * arcR}
                        <g transform="translate(0, 95)">
                            <circle
                                r={arcR}
                                fill="none"
                                stroke="#d8d8d8"
                                stroke-width="2"
                            />
                            <circle
                                r={arcR}
                                fill="none"
                                stroke="#161616"
                                stroke-width="2"
                                stroke-dasharray="{ratio *
                                    arcCirc} {arcCirc}"
                                transform="rotate(-90)"
                            />
                        </g>
                    {/if}
                {/if}
            </g>

            <!-- SVG defs for arrow marker -->
            <defs>
                <marker
                    id="start-arrow-head"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#707070" />
                </marker>
            </defs>
        </svg>

        <!-- Rollout band tooltip — absolute relative to chart-area container -->
        {#if rolloutBandHover}
            <div
                class="rollout-band-tooltip"
                style:left="{rolloutBandHover.x}px"
                style:top="{rolloutBandHover.y}px"
            >
                <div class="rollout-band-tooltip__title">
                    rollout #{rolloutBandHover.rolloutNumber}
                </div>
                <div class="rollout-band-tooltip__body">
                    step {rolloutBandHover.startStep.toLocaleString()}–{rolloutBandHover.endStep.toLocaleString()}
                    · {rolloutBandHover.length.toLocaleString()} steps
                </div>
            </div>
        {/if}
    </div>

    {#if belowChart}
        <div class="below-chart">{@render belowChart()}</div>
    {/if}

    <div class="control-bar">
        <div class="control-head">
            <h3 class="control-title">{strings.radialChart.controlBar.title}</h3>
            <Tooltip
                title={strings.radialChart.controlBar.infoTooltip.title}
                content={strings.radialChart.controlBar.infoTooltip.content}
                placement="top"
            >
                <span class="info-icon" aria-label={strings.radialChart.controlBar.infoAriaLabel}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2" fill="none" />
                        <circle cx="7" cy="4.2" r="0.8" fill="currentColor" />
                        <path d="M7 6.4 V10.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                    </svg>
                </span>
            </Tooltip>
        </div>
        <div class="metric-chips">
            {#each availableMetrics as metric, mi}
                {@const isSelected = selectedMetrics.includes(metric)}
                {@const color = metricColor(metric)}
                {@const value =
                    focusStep !== null
                        ? steps[focusStep]?.metrics?.[metric]
                        : undefined}
                {@const def = METRIC_DEFINITIONS[metric]?.def ?? null}
                {@const hint = METRIC_DEFINITIONS[metric]?.hint ?? null}
                <div class="chip-wrapper">
                    <Chip
                        selected={isSelected}
                        dotColor={color}
                        variant="tinted"
                        onclick={() => toggleMetric(metric)}
                    >
                        <span class="chip-label">
                            {metricLabel(metric)}
                        </span>
                        <span class="chip-value">
                            {fmtMetricValue(value)}
                        </span>
                    </Chip>
                    {#if def !== null || hint !== null}
                        <span class="chip-popover">
                            <strong>{metricLabel(metric)}</strong>
                            {#if def !== null}
                                <span class="def">{def}</span>
                            {/if}
                            {#if hint !== null}
                                <span class="hint">{hint}</span>
                            {/if}
                        </span>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</div>

<style lang="scss">
    .radial-chart-container {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: $sp-4;
        width: 100%;
        height: 100%;
        font-family: $font-sans;
        color: $c-ink-1;
    }
    .chart-area {
        position: relative;
        width: 100%;
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 0 2rem;
        padding-bottom: 10rem;
    }
    .rollout-band-tooltip {
        position: absolute;
        transform: translate(12px, 12px);
        pointer-events: none;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        box-shadow: $shadow-elevated;
        padding: 8px 12px;
        font-family: $font-sans;
        font-size: $fs-xs;
        color: $c-ink-1;
        line-height: $lh-normal;
        white-space: nowrap;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 10;
    }
    .rollout-band-tooltip__title {
        font-weight: $fw-semibold;
        font-size: $fs-sm;
    }
    .rollout-band-tooltip__body {
        color: $c-ink-2;
    }
    // justify-content does not interpolate, so when explainer opens we apply a translateX
    // to the SVG instead — synced with the rotation timing for a smooth right shift.
    .radial-chart-svg {
        transition: transform 220ms ease;
    }
    .chart-area.explainer-open .radial-chart-svg {
        transform: translateX(5%);
    }
    .below-chart {
        display: flex;
        justify-content: center;
        width: 100%;
        min-height: 36px; // reserve space regardless of selection
        flex-shrink: 0;
    }
    // Square SVG (aspect-ratio:1) sized by the shorter side of the available box.
    .radial-chart-svg {
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
        aspect-ratio: 1;
        font-family: $font-sans;
    }
    .control-bar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: $sp-2;
        padding: $sp-3 2rem 2rem;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(2px);
    }
    .control-head {
        display: flex;
        align-items: center;
        gap: 6px;
        padding-bottom: $sp-1;
    }
    .control-title {
        @include type-section-title;
        margin: 0;
        
    }
    .info-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: $c-ink-3;
        cursor: help;
        line-height: 0;
        transition: color 120ms ease;
    }
    .info-icon:hover {
        color: $c-ink-1;
    }
    .metric-chips {
        display: flex;
        gap: $sp-1;
        flex-wrap: wrap;
    }
    .chip-label {
        font-weight: 500;
        color: $c-ink-3;
        letter-spacing: -0.02em;
    }
    .chip-value {
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
        margin-left: 6px;
        font-weight: inherit;
    }
    .chip-wrapper {
        position: relative;
        display: inline-flex;
    }
    .chip-popover {
        display: none;
        position: absolute;
        bottom: calc(100% + 6px);
        left: 0;
        z-index: 10;
        min-width: 220px;
        max-width: 320px;
        padding: $sp-2 $sp-3;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        box-shadow: $shadow-card;
        font-family: $font-sans;
        font-size: $fs-xs;
        color: $c-ink-1;
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
    }
    .chip-wrapper:hover .chip-popover {
        display: flex;
    }
    .chip-popover strong {
        font-size: $fs-sm;
        font-weight: $fw-bold;
        color: $c-ink-1;
    }
    .chip-popover .def {
        font-size: $fs-xs;
        color: $c-ink-2;
    }
    .chip-popover .hint {
        font-size: $fs-xs;
        color: $c-ink-3;
        font-style: italic;
    }
    .chip-popover .unavail {
        font-size: $fs-xs;
        color: $c-red-strong;
        font-style: normal;
    }
</style>
