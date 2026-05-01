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
    <div class="overline">{strings.runRail.overline}</div>

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
</aside>

<style lang="scss">
    .rail {
        flex-shrink: 0;
        width: 152px;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        padding: $sp-5 $sp-4 $sp-4;
        gap: $sp-3;
        background: #f4f5f7;
        border-left: 1px solid $c-line;
    }

    .overline {
        @include type-overline;
        text-align: center;
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

</style>
