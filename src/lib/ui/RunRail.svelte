<script lang="ts" module>
    import type { RunMeta } from "$lib/radial-chart/types";

    export interface RailRun {
        key: string;
        abbr: string;
        fullName?: string;
        disabled?: boolean;
        meta?: RunMeta;
    }
</script>

<script lang="ts">
    import { strings } from "$lib/i18n/strings";
    import logoSvg from "$lib/assets/logo.svg?raw";
    import Tooltip from "./Tooltip.svelte";

    type AlgoInfo = { year: string; description: string };
    const algoInfo = strings.runRail.algorithms as Record<string, AlgoInfo>;

    interface Props {
        runs: RailRun[];
        current: string;
        loading?: boolean;
        onSelect: (key: string) => void;
        onGallery?: () => void;
        onUpload?: () => void;
    }
    let {
        runs,
        current,
        loading = false,
        onSelect,
    }: Props = $props();

    // Skip arrow (GRPO → Dr.GRPO) — curved bypass around DAPO.
    let runsEl: HTMLDivElement | null = $state(null);
    let btnRefs: Record<string, HTMLButtonElement | null> = $state({});
    let skipPath = $state("");
    let skipBox = $state({ w: 0, h: 0 });

    function computeSkipPath() {
        if (!runsEl) return;
        const fromBtn = btnRefs["grpo"];
        const toBtn = btnRefs["drgrpo"];
        if (!fromBtn || !toBtn) {
            skipPath = "";
            return;
        }
        const cRect = runsEl.getBoundingClientRect();
        const fr = fromBtn.getBoundingClientRect();
        const tr = toBtn.getBoundingClientRect();
        skipBox = { w: cRect.width, h: cRect.height };

        // Start: same point as the GRPO→DAPO connector dot (GRPO bottom + 2.5).
        const startX = fr.left - cRect.left + fr.width / 2;
        const startY = fr.bottom - cRect.top + 2.5;
        // End: top-center of DR.GRPO.
        const endX = tr.left - cRect.left + tr.width / 2;
        const endY = tr.top - cRect.top;
        // Curve control: bulge slightly past the buttons (skip-arrow is z-index:2).
        const ctrlX = fr.right - cRect.left + 12;
        const c1y = startY + (endY - startY) * 0.25;
        const c2y = endY - (endY - startY) * 0.25;
        skipPath = `M ${startX} ${startY} C ${ctrlX} ${c1y}, ${ctrlX} ${c2y}, ${endX} ${endY}`;
    }

    $effect(() => {
        if (!runsEl) return;
        computeSkipPath();
        const ro = new ResizeObserver(() => computeSkipPath());
        ro.observe(runsEl);
        const onResize = () => computeSkipPath();
        window.addEventListener("resize", onResize);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", onResize);
        };
    });

    function displayName(run: RailRun): string {
        return (run.fullName ?? run.abbr).toUpperCase();
    }

    function handleRunKeydown(e: KeyboardEvent, run: RailRun, idx: number) {
        if (run.disabled) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(run.key);
            return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const dir = e.key === "ArrowDown" ? 1 : -1;
            let j = idx + dir;
            while (j >= 0 && j < runs.length && runs[j].disabled) j += dir;
            if (j < 0 || j >= runs.length) return;
            const btns = document.querySelectorAll<HTMLButtonElement>(
                ".rail .run-btn",
            );
            btns[j]?.focus();
        }
    }
</script>

<aside class="rail" aria-label={strings.runRail.ariaLabel}>
    <div class="brand" aria-hidden="true">{@html logoSvg}</div>

    <div
        class="runs"
        role="tablist"
        aria-orientation="vertical"
        bind:this={runsEl}
    >
        {#each runs as run, i (run.key)}
            {#if i > 0 && run.key !== "drgrpo"}
                <svg
                    class="connector"
                    width="14"
                    height="18"
                    viewBox="0 0 14 18"
                    aria-hidden="true"
                >
                    <circle cx="7" cy="2.5" r="2" />
                    <line x1="7" y1="3.5" x2="7" y2="12" />
                    <path d="M3 11.5 L7 16.5 L11 11.5 Z" />
                </svg>
            {:else if i > 0}
                <span class="connector-spacer" aria-hidden="true"></span>
            {/if}
            {#if algoInfo[run.key]}
                <Tooltip
                    placement="right"
                    title={`${displayName(run)} (${algoInfo[run.key].year})`}
                    content={algoInfo[run.key].description}
                >
                    <button
                        type="button"
                        class="run-btn"
                        class:active={current === run.key}
                        class:disabled={run.disabled}
                        role="tab"
                        aria-selected={current === run.key}
                        aria-disabled={run.disabled || undefined}
                        disabled={run.disabled || (loading && current !== run.key)}
                        bind:this={btnRefs[run.key]}
                        onclick={() => !run.disabled && onSelect(run.key)}
                        onkeydown={(e) => handleRunKeydown(e, run, i)}
                    >
                        <span class="name">{displayName(run)}</span>
                    </button>
                </Tooltip>
            {:else}
                <button
                    type="button"
                    class="run-btn"
                    class:active={current === run.key}
                    class:disabled={run.disabled}
                    role="tab"
                    aria-selected={current === run.key}
                    aria-disabled={run.disabled || undefined}
                    disabled={run.disabled || (loading && current !== run.key)}
                    bind:this={btnRefs[run.key]}
                    onclick={() => !run.disabled && onSelect(run.key)}
                    onkeydown={(e) => handleRunKeydown(e, run, i)}
                >
                    <span class="name">{displayName(run)}</span>
                </button>
            {/if}
        {/each}

        {#if skipPath}
            <svg
                class="skip-arrow"
                width={skipBox.w + 32}
                height={skipBox.h}
                aria-hidden="true"
            >
                <defs>
                    <marker
                        id="rail-skip-head"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        markerUnits="userSpaceOnUse"
                        orient="auto"
                    >
                        <path
                            d="M 0 0 L 10 5 L 0 10 Z"
                            fill="#b8b8b8"
                        />
                    </marker>
                </defs>
                <path
                    class="skip-line"
                    d={skipPath}
                    fill="none"
                    stroke-linecap="round"
                    marker-end="url(#rail-skip-head)"
                />
            </svg>
        {/if}
    </div>

    <a
        class="github-link"
        href="https://github.com/poloclub/unipo"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={strings.runRail.githubAriaLabel}
    >
        <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
        >
            <path
                d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.16-.02-2.1-3.2.69-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.21-1.5 3.18-1.18 3.18-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z"
            />
        </svg>
    </a>
</aside>

<style lang="scss">
    .rail {
        flex-shrink: 0;
        width: 152px;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: $sp-5 $sp-4 $sp-6;
        gap: $sp-3;
        background: #f4f5f7;
        border-left: 1px solid $c-line;
    }

    .brand {
        display: flex;
        justify-content: center;
        align-items: center;

        :global(svg) {
            display: block;
            height: auto;
            max-width: 100%;
        }
    }

    .runs {
        position: relative;
        flex: 1;
        min-height: 0;
        overflow: visible;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: 0;
    }

    .connector-spacer {
        flex-shrink: 0;
        height: 18px;
    }

    .connector {
        flex-shrink: 0;
        align-self: center;
        color: #b8b8b8;
        circle {
            fill: currentColor;
        }
        line {
            stroke: currentColor;
            stroke-width: 1.2;
        }
        path {
            fill: currentColor;
        }
    }

    .skip-arrow {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        overflow: visible;
        z-index: 2;

        .skip-line {
            stroke: #b8b8b8;
            stroke-width: 1.2;
        }
    }

    .run-btn {
        @include type-overline;
        position: relative;
        z-index: 1;
        appearance: none;
        width: 100%;
        background: $c-surface;
        border: 1px solid $c-line;
        border-radius: $radius-md;
        padding: $sp-2 $sp-3;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $c-ink-1;
        cursor: pointer;
        transition:
            color 120ms ease,
            background 120ms ease,
            border-color 120ms ease,
            box-shadow 120ms ease;

        &:hover:not(:disabled):not(.active) {
            border-color: $c-ink-3;
        }

        &.active {
            color: $c-ink-1;
            background: $c-surface;
            border-color: $c-ink-1;
            box-shadow: inset 0 0 0 1px $c-ink-1;
        }

        &.disabled,
        &:disabled {
            color: $c-ink-2;
            border-color: $c-line;
            background: $c-surface;
            opacity: 0.7;
            cursor: not-allowed;
        }
    }

    .name {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: clip;
        white-space: nowrap;
    }

    .github-link {
        align-self: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #9ea2adb2;
        padding: $sp-1;
        border-radius: $radius-sm;
        transition: color 120ms ease;

        &:hover,
        &:focus-visible {
            color: #9ea2adf0;
        }

        svg {
            display: block;
        }
    }

</style>
