<!-- src/lib/detail-panel/ResponseCard.svelte -->
<script lang="ts">
    import TokenSequence from "./TokenSequence.svelte";
    import type {
        Response,
        ColorSource,
        TokenSeries,
    } from "$lib/radial-chart/types";
    import { registerAnchor } from "$lib/anchor/anchors.svelte";
    import { Tooltip, Label } from "$lib/ui";
    import { strings, t } from "$lib/i18n/strings";
    import * as d3 from "d3";

    interface Props {
        response: Response;
        index: number;
        colorSource: ColorSource;
        domain?: [number, number];
        /** Selected token index within this response. null when token isn't in this response. */
        selectedTokenIndex?: number | null;
        onTokenClick?: (responseId: string, tokenIndex: number) => void;
        algorithm?: string;
        /** Globally controlled by parent — toggles all cards together. */
        renderMath?: boolean;
        /** Learning mode: hide token heatmap. */
        paintDisabled?: boolean;
        /** A token is selected globally (dim mode). */
        dimMode?: boolean;
        /** Whether to highlight this card's row (R label + reward). Only meaningful when dimMode. */
        rowHighlight?: boolean;
    }
    let {
        response,
        index,
        colorSource,
        domain,
        selectedTokenIndex = null,
        onTokenClick,
        algorithm = "",
        renderMath = false,
        paintDisabled = false,
        dimMode = false,
        rowHighlight = false,
    }: Props = $props();

    let expanded = $state(false);

    // PPO: show V badges from the selected token to the end of the response —
    // GAE consumes V/r of every later token, so the full future chain is exposed.
    let valueHighlights = $derived.by((): number[] => {
        if (algorithm !== "ppo") return [];
        if (selectedTokenIndex === null) return [];
        const vs = response.tokens?.values;
        if (!vs) return [];
        const out: number[] = [];
        for (let i = Math.max(0, selectedTokenIndex); i < vs.length; i++) {
            out.push(i);
        }
        return out;
    });

    function fmt(v: number | undefined): string {
        if (v === undefined || !Number.isFinite(v)) return strings.common.dash;
        return v.toFixed(2);
    }

    // Reward color: 1.0 → green, 0.5 → neutral grey, 0.0 → near-black dark grey.
    // High color matches SCSS $c-reward (= $c-green).
    const REWARD_HIGH = "#2AB466";
    let rewardScale = d3
        .scaleLinear<string>()
        .domain([0, 0.5, 1])
        .range(["#171717", "#909090", REWARD_HIGH])
        .clamp(true);
    let rewardColor = $derived(
        response.reward !== undefined && Number.isFinite(response.reward)
            ? rewardScale(response.reward)
            : "#707070",
    );
    // Connector line opacity: linear from reward 0 (black) → 0.2 to reward 1 (green) → 0.5.
    // Keeps lines faint over card content, with stronger rewards drawn more boldly.
    let rewardLineOpacity = $derived(
        response.reward !== undefined && Number.isFinite(response.reward)
            ? 0.1 + 0.3 * Math.max(0, Math.min(1, response.reward))
            : 0.1,
    );

    function sliceTokens(
        tokens: TokenSeries,
        start: number,
        end?: number,
    ): TokenSeries {
        const len = tokens.strings?.length ?? tokens.ids?.length ?? 0;
        const e = end ?? len;
        if (start <= 0 && e === len) return tokens;
        return {
            ids: tokens.ids?.slice(start, e),
            strings: tokens.strings?.slice(start, e),
            log_probs: tokens.log_probs?.slice(start, e),
            ref_log_probs: tokens.ref_log_probs?.slice(start, e),
            old_log_probs: tokens.old_log_probs?.slice(start, e),
            values: tokens.values?.slice(start, e),
            advantages: tokens.advantages?.slice(start, e),
            returns: tokens.returns?.slice(start, e),
            token_kl: tokens.token_kl?.slice(start, e),
            rewards: tokens.rewards?.slice(start, e),
            prob: tokens.prob?.slice(start, e),
            token_objective: tokens.token_objective?.slice(start, e),
            token_loss: tokens.token_loss?.slice(start, e),
        };
    }

    /** Whether token is a chat-template marker (eot_id, im_end, etc.). */
    function isSpecialToken(s: string | undefined): boolean {
        return typeof s === "string" && /^<\|.*\|>$/.test(s);
    }

    /** End index excluding trailing special tokens. */
    function nonSpecialEnd(strings: string[]): number {
        let end = strings.length;
        while (end > 0 && isSpecialToken(strings[end - 1])) end--;
        return end;
    }

    // Collapsed view uses row-reverse + overflow:hidden so only the tail is visible.
    // Rendering all 7000+ tokens (DAPO) costs ~1s per mount/unmount, so we slice
    // the data to the last N tokens — visually identical, render cost dropped.
    const COLLAPSED_TAIL = 120;
    let collapsedSlice = $derived.by(() => {
        if (!response.tokens) return null;
        const strings = response.tokens.strings ?? [];
        const end = nonSpecialEnd(strings);
        const start = Math.max(0, end - COLLAPSED_TAIL);
        return { start, end, tokens: sliceTokens(response.tokens, start, end) };
    });
    let collapsedSelectedIndex = $derived(
        collapsedSlice && selectedTokenIndex !== null
            ? selectedTokenIndex - collapsedSlice.start
            : null,
    );
    let collapsedValueHighlights = $derived(
        collapsedSlice
            ? valueHighlights
                  .map((i) => i - collapsedSlice.start)
                  .filter(
                      (i) =>
                          i >= 0 &&
                          i < collapsedSlice.end - collapsedSlice.start,
                  )
            : [],
    );
</script>

<div class="card" class:expanded class:dim-card={dimMode && !rowHighlight}>
    <Tooltip
        title={t(strings.responseCard.responseTooltip.title, { n: index + 1 })}
        content={strings.responseCard.responseTooltip.content}
        placement="bottom"
    >
        <Label tooltipped>{t(strings.responseCard.responseLabelTemplate, { n: index + 1 })}</Label>
    </Tooltip>
    <div class="body">
        {#if response.tokens}
            {#if expanded}
                <div class="expanded-area">
                    <TokenSequence
                        tokens={response.tokens}
                        advantage={response.advantage ?? 0}
                        {colorSource}
                        {domain}
                        {renderMath}
                        rolloutId={response.id}
                        selectedIndex={selectedTokenIndex}
                        {onTokenClick}
                        {valueHighlights}
                        {paintDisabled}
                        dimNonSelected={dimMode && rowHighlight}
                    />
                </div>
            {:else if collapsedSlice}
                <div class="collapsed-area" data-rollout-clip={response.id}>
                    <TokenSequence
                        tokens={collapsedSlice.tokens}
                        advantage={response.advantage ?? 0}
                        {colorSource}
                        {domain}
                        {renderMath}
                        rolloutId={response.id}
                        selectedIndex={collapsedSelectedIndex}
                        {onTokenClick}
                        valueHighlights={collapsedValueHighlights}
                        indexOffset={collapsedSlice.start}
                        {paintDisabled}
                        singleLine
                        dimNonSelected={dimMode && rowHighlight}
                    />
                    <div class="fade-left" aria-hidden="true"></div>
                </div>
            {/if}
        {:else}
            <div class="no-tokens">{strings.responseCard.noTokens}</div>
        {/if}
    </div>
    <button
        type="button"
        class="expand-btn"
        title={expanded ? strings.responseCard.expand.titleCollapse : strings.responseCard.expand.titleExpand}
        onclick={() => (expanded = !expanded)}
        aria-label={expanded ? strings.responseCard.expand.ariaCollapse : strings.responseCard.expand.ariaExpand}
    >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            {#if expanded}
                <path
                    d="M3 9 L7 5 L11 9"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            {:else}
                <path
                    d="M3 5 L7 9 L11 5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            {/if}
        </svg>
    </button>
    <div class="reward" style:color={rewardColor}>
        <span
            class="reward-value"
            data-connect={`reward-${response.id}`}
            data-line-opacity={rewardLineOpacity}
            use:registerAnchor={`reward-${response.id}`}
        >{fmt(response.reward)}</span>
    </div>
</div>

<style lang="scss">
    .card {
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        gap: $sp-3;
        padding: $sp-2 $sp-3;
        align-items: center;

        // Expanded: align R label / reward to body's first-line baseline,
        // but pin expand-btn to the top (svg buttons have no baseline).
        &.expanded {
            align-items: baseline;
            > .expand-btn {
                align-self: start;
            }
        }

        // Dim mode (token selected): fade entire card if it's not the highlight
        // row (PPO/REIN non-clicked card). Per-token dim within the highlight
        // row is handled by .tok.dim inside TokenSequence.
        // Transition only declared when .dim-card is set — when the class is
        // removed it snaps off, preventing paint races with the slide-out.
        &.dim-card {
            opacity: 0.3;
            transition: opacity 180ms ease;
        }
    }
    .body {
        min-width: 0;
    }
    .no-tokens {
        @include type-body;
        color: $c-ink-3;
        font-style: italic;
    }
    // Collapsed view: all tokens on one line, right-aligned via row-reverse.
    // Overflow on the left is hidden by fade-left's white→transparent gradient,
    // making the truncation appear to fade out.
    .collapsed-area {
        position: relative;
        display: flex;
        flex-direction: row-reverse;
        align-items: center;
        height: 24px;
        overflow-x: hidden;
        overflow-y: visible;

        :global(.token-seq) {
            min-width: 0;
            flex: 0 0 auto;
            overflow-y: visible;
        }
    }
    .expanded-area {
        padding: 2px;
        margin: -2px;
    }
    .fade-left {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 32px;
        background: linear-gradient(
            to right,
            $c-surface 0%,
            rgba(255, 255, 255, 0) 100%
        );
        pointer-events: none;
        z-index: 1;
    }
    .expand-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        background: transparent;
        border: none;
        color: $c-ink-3;
        opacity: 0.4;
        cursor: pointer;
        padding: 0;
        border-radius: $radius-sm;
        line-height: 1;
        // Partially offset grid gap($sp-3) so it sits right next to reward,
        // tightening the card's right margin.
        margin-left: calc(-1 * #{$sp-2});
        transition:
            opacity 120ms ease,
            color 120ms ease,
            background 120ms ease;

        &:hover {
            color: $c-ink-1;
            opacity: 1;
            background: $c-surface-subtle;
        }

        svg {
            display: block;
        }
    }
    .reward {
        @include type-mono;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        font-size: $fs-lg;
        font-weight: $fw-medium;
        line-height: 1;
        letter-spacing: -0.02em;
        min-width: 56px;
        text-align: center;
        margin-left: $sp-3;
    }
</style>
