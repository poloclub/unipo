<!-- src/lib/detail-panel/TokenSequence.svelte -->
<!--
  Two modes:
  - raw (default): per-token span + background color (no LaTeX, exact per-token color)
  - rendered: joined text rendered by KaTeX (no color, looks nicer for math)
-->
<script lang="ts">
    import { onMount, tick } from "svelte";
    import * as d3 from "d3";
    import renderMathInElement from "katex/contrib/auto-render";
    import "katex/dist/katex.min.css";
    import type { TokenSeries, ColorSource } from "$lib/radial-chart/types";
    import { registerAnchor } from "$lib/anchor/anchors.svelte";
    import { strings } from "$lib/i18n/strings";
    import {
        buildTokenHeatmapScale,
        applyTokenHeatmapAlpha,
    } from "./color-domain";

    interface Props {
        tokens: TokenSeries;
        advantage?: number;
        colorSource: ColorSource;
        /** Color scale domain (global basis). When omitted, derived from this sequence. */
        domain?: [number, number];
        /** Force single line (nowrap + clip). */
        singleLine?: boolean;
        /** true → render with LaTeX (no color); false → raw tokens with per-color background. */
        renderMath?: boolean;
        /** Rollout id (passed to click events). Disables click handling when omitted. */
        rolloutId?: string;
        /** Selected token index within this sequence. null if not selected here. */
        selectedIndex?: number | null;
        /** Token-click callback. Not invoked in rendered mode. */
        onTokenClick?: (rolloutId: string, tokenIndex: number) => void;
        /** Token indices that should display the V badge (for PPO GAE visualization). */
        valueHighlights?: number[];
        /**
         * Local index → full index correction when tokens are sliced from a larger source.
         * Applied only to anchor ids (`token-…-<full>`) and onTokenClick callbacks.
         */
        indexOffset?: number;
        /** Learning mode: when true, all backgrounds are transparent (heatmap hidden). */
        paintDisabled?: boolean;
        /** When true, dim all tokens except selectedIndex. Used to spotlight a selection. */
        dimNonSelected?: boolean;
    }
    let {
        tokens,
        advantage = 0,
        colorSource,
        domain,
        singleLine = false,
        renderMath = false,
        rolloutId,
        selectedIndex = null,
        onTokenClick,
        valueHighlights = [],
        indexOffset = 0,
        paintDisabled = false,
        dimNonSelected = false,
    }: Props = $props();

    let highlightSet = $derived(new Set(valueHighlights));

    function valueAt(i: number): number | undefined {
        switch (colorSource) {
            case "prob":
                return tokens.prob?.[i];
            case "token_kl":
                return tokens.token_kl?.[i];
            case "token_objective":
                return tokens.token_objective?.[i];
            case "advantage":
                return tokens.advantages?.[i] ?? advantage;
        }
    }

    // Hover tooltip: a single floating element shown above the hovered token.
    // Wrapping each token in <Tooltip> would cost too much at thousands of tokens — share one.
    let hover = $state<{ index: number; left: number; top: number } | null>(
        null,
    );
    function onTokEnter(e: MouseEvent, i: number) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        hover = {
            index: i,
            left: r.left + r.width / 2,
            top: r.top,
        };
    }
    function onTokLeave() {
        hover = null;
    }
    let hoverValue = $derived(
        hover !== null ? tokens.token_objective?.[hover.index] : undefined,
    );

    let values = $derived.by(() => {
        const n = tokens.strings?.length ?? tokens.ids?.length ?? 0;
        const out: Array<number | undefined> = new Array(n);
        for (let i = 0; i < n; i++) out[i] = valueAt(i);
        return out;
    });

    let localDomain = $derived.by((): [number, number] => {
        if (domain) return domain;
        const finite = values.filter(
            (v): v is number => v !== undefined && Number.isFinite(v),
        );
        if (finite.length === 0) return [0, 1];
        // Quantile clamp (outlier removal) + 0-centered symmetric domain (except for prob).
        const sorted = [...finite].sort((a, b) => a - b);
        const lo = d3.quantileSorted(sorted, 0.02) ?? sorted[0];
        const hi = d3.quantileSorted(sorted, 0.98) ?? sorted[sorted.length - 1];
        if (colorSource !== "prob") {
            const m = Math.max(Math.abs(lo), Math.abs(hi));
            return m === 0 ? [-1, 1] : [-m, m];
        }
        if (lo === hi) return [lo - 1, hi + 1];
        return [lo, hi];
    });

    // Token-heatmap palette / gamma / alpha are owned by color-domain.ts.
    // Here we only compute the domain locally, build the scale, then apply the alpha helper.
    let colorScale = $derived(buildTokenHeatmapScale(localDomain));

    function bgAt(i: number): string {
        if (paintDisabled) return "transparent";
        const v = values[i];
        if (v === undefined || !Number.isFinite(v)) return "transparent";
        return applyTokenHeatmapAlpha(colorScale(v)) ?? "transparent";
    }

    let fullText = $derived(tokens.strings?.join("") ?? "");

    let containerEl: HTMLElement | undefined = $state();

    async function runKaTeX() {
        await tick();
        if (!containerEl || !renderMath) return;
        try {
            renderMathInElement(containerEl, {
                delimiters: [
                    { left: "$$", right: "$$", display: false },
                    { left: "\\[", right: "\\]", display: false },
                    { left: "\\(", right: "\\)", display: false },
                    { left: "$", right: "$", display: false },
                ],
                throwOnError: false,
                strict: "ignore",
            });
        } catch {
            // Keep raw text on render failure.
        }
    }

    onMount(runKaTeX);
    $effect(() => {
        fullText;
        renderMath;
        runKaTeX();
    });
</script>

{#if renderMath}
    <!-- Separate div: switching modes destroys the entire DOM that KaTeX mutated. -->
    <div
        bind:this={containerEl}
        class="token-seq rendered"
        class:single-line={singleLine}
    >
        {fullText}
    </div>
{:else}
    <div class="token-seq" class:single-line={singleLine}>
        {#each tokens.strings ?? [] as str, i}
            {@const full = i + indexOffset}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <span
                class="tok"
                class:selected={selectedIndex === i}
                class:dim={dimNonSelected && selectedIndex !== i}
                class:clickable={!!(onTokenClick && rolloutId)}
                style:background={bgAt(i)}
                data-connect={rolloutId ? `token-${rolloutId}-${full}` : undefined}
                use:registerAnchor={rolloutId && selectedIndex === i
                    ? `token-${rolloutId}-${full}`
                    : ""}
                role={onTokenClick && rolloutId ? "button" : undefined}
                tabindex={onTokenClick && rolloutId ? 0 : undefined}
                onmouseenter={(e) => onTokEnter(e, i)}
                onmouseleave={onTokLeave}
                onclick={(e) => {
                    if (!onTokenClick || !rolloutId) return;
                    e.stopPropagation();
                    onTokenClick(rolloutId, full);
                }}
                onkeydown={(e) => {
                    if (!onTokenClick || !rolloutId) return;
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onTokenClick(rolloutId, full);
                    }
                }}
                >{str}</span
            >{#if rolloutId && highlightSet.has(i) && tokens.values?.[i] !== undefined}<sub
                    class="v-badge"
                    data-connect={`value-${rolloutId}-${full}`}
                    use:registerAnchor={`value-${rolloutId}-${full}`}
                    >{strings.tokenSequence.vBadgePrefix}{tokens.values[i].toFixed(3)}</sub
                >{/if}
        {/each}
    </div>
{/if}

{#if hover}
    <div
        class="tok-tip"
        style:left="{hover.left}px"
        style:top="{hover.top}px"
        role="tooltip"
    >
        {hoverValue !== undefined && Number.isFinite(hoverValue)
            ? hoverValue.toFixed(3)
            : strings.common.dash}
    </div>
{/if}

<style lang="scss">
    .token-seq {
        @include type-mono;
        line-height: 1.6;
        letter-spacing: -0.02em;
        white-space: pre-wrap;
        word-break: break-word;
    }
    .rendered {
        line-height: 1.5;
    }
    // singleLine: simple nowrap. Overflow handling is owned by the parent
    // (collapsed-area) so the left-side truncation stays consistent.
    .single-line {
        white-space: nowrap;
        line-height: 1.3;
    }
    .tok {
        display: inline;
        padding: 1px 2px;
        border-radius: 3px;

        &.clickable {
            cursor: pointer;
        }
        // Selection indicator uses inset box-shadow so it isn't clipped by overflow:hidden.
        &.selected {
            box-shadow: inset 0 0 0 2px $c-ink-1;
            border-radius: $radius-sm;
        }
        // Dim mode: fade tokens other than the selected one.
        // Transition declared only on .dim — snaps off when the class is removed,
        // avoiding paint races during close.
        &.dim {
            opacity: 0.3;
            transition: opacity 180ms ease;
        }
    }
    .v-badge {
        display: inline-block;
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
        font-size: $fs-xs;
        line-height: 1;
        padding: 1px 4px;
        margin: 0 1px 0 2px;
        background: $c-blue-tint;
        color: $c-blue-strong;
        border: 1px solid $c-blue;
        border-radius: $radius-sm;
        vertical-align: 0;
    }
    // Mini tooltip floating above the hovered token. position:fixed so it isn't
    // clipped by overflow:hidden parents (collapsed-area).
    .tok-tip {
        position: fixed;
        z-index: 1000;
        transform: translate(-50%, calc(-100% - 6px));
        padding: 4px 8px;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-sm;
        box-shadow: $shadow-elevated;
        font-family: $font-mono;
        font-variant-numeric: tabular-nums;
        font-size: $fs-xs;
        line-height: 1.2;
        color: $c-ink-1;
        font-weight: $fw-medium;
        pointer-events: none;
        white-space: nowrap;
    }
</style>
