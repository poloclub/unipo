<script lang="ts">
    import type { Snippet } from "svelte";
    import type { RunMeta } from "$lib/radial-chart/types";
    import { strings } from "$lib/i18n/strings";

    interface Props {
        algorithm: string;
        meta?: RunMeta;
        description?: string;
        actions?: Snippet;
    }
    let { algorithm, meta, description, actions }: Props = $props();

    const DASH = strings.common.dash;
    const fmt = (v: unknown) =>
        v === undefined || v === null || v === "" ? DASH : String(v);

    type MetaRow = { label: string; value: string };
    const metaRows = $derived.by((): MetaRow[] => [
        { label: strings.runHeader.metaLabels.task, value: fmt(meta?.task) },
        { label: strings.runHeader.metaLabels.dataset, value: fmt(meta?.dataset) },
        { label: strings.runHeader.metaLabels.baseModel, value: fmt(meta?.model_name) },
        { label: strings.runHeader.metaLabels.rewardStrategy, value: fmt(meta?.reward_strategy) },
    ]);
</script>

<header class="run-header">
    <div class="lead">
        <h1 class="title">{algorithm.toUpperCase()} {strings.runHeader.titleSuffix}</h1>
        {#if actions}
            <div class="actions">{@render actions()}</div>
        {/if}
    </div>
    <dl class="meta">
        {#each metaRows as row}
            <div class="row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
            </div>
        {/each}
    </dl>
</header>

<style lang="scss">
    .run-header {
        flex-shrink: 0;
        flex-grow: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
        gap: $sp-4;
        padding: $sp-4 2rem 0;
    }

    .lead {
        min-width: 0;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: $sp-2;
    }

    .title {
        @include type-view-title;
        margin: 0;
    }

    .desc {
        @include type-description;
        margin: 0;
        max-width: 52ch;
    }

    .meta {
        display: grid;
        grid-template-columns: auto auto;
        column-gap: $sp-2;
        margin: 0;
        justify-content: start;
        align-items: flex-start;
        padding: $sp-2 $sp-3;
        padding-right: 1rem;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(2px);
        border-radius: $radius-md;
    }

    .row {
        display: contents;
    }

    dt {
        @include type-meta-label;
        white-space: nowrap;
    }

    dd {
        @include type-meta-value;
        margin: 0;
        text-align: left;
    }

    .actions {
        display: flex;
        align-items: center;
        gap: $sp-2;
        pointer-events: auto;
    }
</style>
