<!-- src/lib/detail-panel/ResponseList.svelte -->
<!--
  Response Examples section. Parent (DetailPanel) gives flex 1 to fill height.
  Inner structure:
    [scroll area — prompt blocks + response cards]          flex 1, overflow-y auto
      └ raw/rendered Switch sits right of the first group's prompt label row
    [scroll fade — white → transparent gradient hinting at more content]   absolute bottom
-->
<script lang="ts">
    import ResponseCard from "./ResponseCard.svelte";
    import PromptBlock from "./PromptBlock.svelte";
    import type { PromptGroup } from "$lib/radial-chart/types";
    import { Tooltip, Label, Switch } from "$lib/ui";
    import { strings, t } from "$lib/i18n/strings";

    interface Props {
        prompts: PromptGroup[];
        selectedToken?: { rolloutId: string; tokenIndex: number } | null;
        /**
         * Gate enabling dim treatment. Parent (+page) flips this true after
         * the explainer slide-in completes, and immediately false on close.
         * The dim CSS transition only applies while .dim is set, so removing
         * the class snaps off and doesn't race with the slide-out.
         */
        dimEnabled?: boolean;
        onTokenClick?: (responseId: string, tokenIndex: number) => void;
        algorithm?: string;
        domain?: [number, number];
        /** Learning mode: hide token heatmap. */
        paintDisabled?: boolean;
        /** PPO/REIN: each response has its own prompt — render a prompt block per card. */
        multiPrompt?: boolean;
    }
    let {
        prompts,
        selectedToken = null,
        dimEnabled = false,
        onTokenClick,
        algorithm = "",
        domain = [-1, 1],
        paintDisabled = false,
        multiPrompt = false,
    }: Props = $props();

    let renderMath = $state(false);

    let flatItems = $derived.by(() => {
        const items: { response: import("$lib/radial-chart/types").Response; globalIdx: number; groupIdx: number }[] = [];
        let idx = 0;
        for (let gi = 0; gi < prompts.length; gi++) {
            for (const r of prompts[gi].responses) {
                items.push({ response: r, globalIdx: idx++, groupIdx: gi });
            }
        }
        return items;
    });

    // Dim/highlight in the response-examples area while a token is selected:
    //   - GRPO/Dr.GRPO/DAPO: whole group participates in advantage calc → highlight
    //     R label + reward cell for every response in the group.
    //   - PPO/REINFORCE: only the clicked response is highlighted.
    // The clicked token itself is full-opacity in any algorithm; other tokens dim.
    let dimMode = $derived(!!selectedToken && dimEnabled);
    // algorithm prop comes from header.algorithm (a display label), so normalize (lowercase + strip dots) before comparing.
    let isGroupAlgo = $derived.by(() => {
        const norm = algorithm.toLowerCase().replace(/\./g, "");
        return norm === "grpo" || norm === "drgrpo" || norm === "dapo";
    });
    function isRowHighlighted(responseId: string): boolean {
        if (!dimMode) return false;
        if (isGroupAlgo) return true;
        return selectedToken?.rolloutId === responseId;
    }

    // Scroll state — only show the fade overlay when more content is below.
    let scrollEl: HTMLDivElement | undefined = $state();
    let canScrollDown = $state(false);

    function updateScrollState() {
        if (!scrollEl) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollEl;
        canScrollDown = scrollHeight - scrollTop - clientHeight > 1;
    }
    $effect(() => {
        // Re-measure on the next tick when prompts change.
        void prompts.length;
        void renderMath;
        queueMicrotask(updateScrollState);
    });
</script>

<section class="response-list">
    <div class="scroll-wrap">
        <div
            class="scroll-area"
            bind:this={scrollEl}
            onscroll={updateScrollState}
        >
            {#each prompts as group, gi}
                {@const groupItems = flatItems.filter(it => it.groupIdx === gi)}
                <div class="prompt-group">
                    {#if group.prompt}
                        <div class="sub-block" class:dim={dimMode}>
                            <div class="prompt-label-row">
                                <Label overline>
                                    {prompts.length > 1
                                        ? t(strings.responseList.promptLabelIndexed, { n: gi + 1 })
                                        : strings.responseList.promptLabel}
                                </Label>
                                {#if gi === 0}
                                    <Switch
                                        options={[
                                            {
                                                value: "raw",
                                                label: strings.responseList.renderModeToggle.raw.label,
                                                title: strings.responseList.renderModeToggle.raw.title,
                                            },
                                            {
                                                value: "rendered",
                                                label: strings.responseList.renderModeToggle.rendered.label,
                                                title: strings.responseList.renderModeToggle.rendered.title,
                                            },
                                        ]}
                                        value={renderMath ? "rendered" : "raw"}
                                        onChange={(v) => (renderMath = v === "rendered")}
                                    />
                                {/if}
                            </div>
                            <PromptBlock prompt={group.prompt} />
                        </div>
                    {/if}
                    <div class="sub-block">
                        <div class="column-headers" class:dim={dimMode}>
                            <span class="ch-cell ch-body">
                                <Label overline>
                                    {groupItems.length > 1
                                        ? strings.responseList.responseGroupLabel
                                        : strings.responseList.responseLabelSingular}
                                </Label>
                            </span>
                            <span class="ch-cell ch-reward">
                                <Tooltip
                                    title={strings.responseList.rewardColumn.tooltip.title}
                                    content={strings.responseList.rewardColumn.tooltip.content}
                                    hint={strings.responseList.rewardColumn.tooltip.hint}
                                >
                                    <Label tooltipped overline>{strings.responseList.rewardColumn.label}</Label>
                                </Tooltip>
                            </span>
                        </div>
                        {#each groupItems as { response, globalIdx }}
                            <ResponseCard
                                {response}
                                index={globalIdx}
                                colorSource="token_objective"
                                {domain}
                                selectedTokenIndex={selectedToken &&
                                selectedToken.rolloutId === response.id
                                    ? selectedToken.tokenIndex
                                    : null}
                                {onTokenClick}
                                {algorithm}
                                {renderMath}
                                {paintDisabled}
                                {dimMode}
                                rowHighlight={isRowHighlighted(response.id)}
                            />
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
        <div
            class="scroll-fade"
            class:visible={canScrollDown}
            aria-hidden="true"
        ></div>
    </div>
</section>

<style lang="scss">
    .response-list {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: $sp-3;
    }
    // The raw/rendered Switch sits right-aligned next to the first group's prompt label.
    .prompt-label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: $sp-3;
        padding-bottom: $sp-2;

    }
    // Match RolloutCard grid (`auto 1fr auto auto`, gap $sp-3, padding $sp-2 $sp-3 + 1px border)
    // so "Response Group" lines up over body and "Reward" lines up over the reward cell.
    //
    // The card's R-label cell is auto width, so we fix the header R cell at
    // 22px to match the average card width (R1..R10 covers one or two digits).
    .column-headers {
        display: grid;
        grid-template-columns: 22px 1fr 22px 56px;
        column-gap: $sp-3;
        // 1px left/right offset to compensate the card's outer border so text aligns.
        padding: 0;
        padding-left: $sp-1;
        padding-bottom: $sp-2;
        padding-right: $sp-3 ;
        align-items: center;
        // Cancel parent (.prompt-group) flex gap — no extra space between header and cards.
        margin-bottom: calc(-1 * #{$sp-2});
    }
    .ch-cell {
        display: inline-flex;
        align-items: center;
    }
    .ch-body {
        grid-column: 1 / 3; // From R-cell left edge to body end — aligns to card left edge.
    }
    .ch-reward {
        grid-column: 4; // Above the reward cell.
        justify-content: center;
    }

    // Scroll area — flex 1 from parent; relative so the fade overlay can be absolute.
    .scroll-wrap {
        flex: 1;
        min-height: 0;
        position: relative;
    }
    .scroll-area {
        height: 100%;
        overflow-y: auto;
        // Slight bottom padding so content isn't covered by the fade.
        padding-bottom: $sp-3;
        // Spacing between prompt-groups (prompt-response pairs).
        display: flex;
        flex-direction: column;
        gap: $sp-4;
    }
    .scroll-fade {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 56px;
        background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0) 0%,
            $c-surface 100%
        );
        pointer-events: none;
        opacity: 0;
        transition: opacity 150ms ease;
    }
    .scroll-fade.visible {
        opacity: 1;
    }

    // Common to all algorithms: prompt + responses bundle. Groups are separated
    // by a hairline (only ::before on adjacent siblings → no line above first group).
    // For left/right inset we use an absolute pseudo-element instead of border-top.
    .prompt-group {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: $sp-4;
        padding: $sp-4 $sp-4 $sp-4 0;
        border-radius: $radius-md;
        background: $c-surface;
    }
    .prompt-group + .prompt-group::before {
        content: "";
        position: absolute;
        top: 0;
        left: $sp-4;
        right: $sp-4;
        height: 1px;
        background: $c-line;
    }
    // Inside a sub-block, label/block (or header/cards) read as one unit (gap 0).
    .sub-block {
        display: flex;
        flex-direction: column;
        gap: 0;
    }
    // While a token is selected, dim unrelated elements (prompt block, column
    // header). Per-card dim/highlight is handled inside RolloutCard.
    // Transition only declared on .dim — when class is removed it snaps off.
    .sub-block.dim,
    .column-headers.dim {
        opacity: 0.3;
        transition: opacity 180ms ease;
    }
</style>
