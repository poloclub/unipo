<!-- src/lib/learning-mode/BatchUpdateArrow.svelte -->
<script lang="ts">
    import { gsap } from "gsap";
    import { LABELS } from "./script";

    interface Props {
        start: { x: number; y: number };
        end: { x: number; y: number };
        turnDown?: number;
        apiRef?: (api: {
            draw: (duration: number) => gsap.core.Timeline;
            startFlow: () => void;
            stopFlow: () => void;
            showLabel: (duration: number) => gsap.core.Timeline;
        }) => void;
    }
    let { start, end, turnDown = 40, apiRef }: Props = $props();

    let pathEl: SVGPathElement;
    let labelEl: HTMLDivElement;
    let flowTween: gsap.core.Tween | null = null;

    let turnY = $derived(start.y + turnDown);
    let d = $derived(
        `M${start.x},${start.y} L${start.x},${turnY} L${end.x},${turnY} L${end.x},${end.y}`,
    );
    let labelX = $derived((start.x + end.x) / 2);
    let labelY = $derived(turnY - 16);

    function draw(duration: number): gsap.core.Timeline {
        const tl = gsap.timeline();
        tl.call(() => {
            gsap.killTweensOf(pathEl);
            const length = pathEl.getTotalLength() || 300;
            gsap.set(pathEl, {
                opacity: 1,
                strokeDasharray: `${length}`,
                strokeDashoffset: length,
            });
            gsap.to(pathEl, {
                strokeDashoffset: 0,
                duration,
                ease: "linear",
                onComplete: () => {
                    gsap.set(pathEl, {
                        strokeDasharray: "8 6",
                        strokeDashoffset: 0,
                    });
                },
            });
        });
        tl.to({}, { duration });
        return tl;
    }

    function startFlow() {
        stopFlow();
        gsap.set(pathEl, { strokeDasharray: "8 6", strokeDashoffset: 0 });
        flowTween = gsap.to(pathEl, {
            strokeDashoffset: -14,
            duration: 0.6,
            repeat: -1,
            ease: "none",
        });
    }

    function stopFlow() {
        if (flowTween) {
            flowTween.kill();
            flowTween = null;
        }
    }

    function showLabel(duration: number): gsap.core.Timeline {
        return gsap.timeline().fromTo(
            labelEl,
            { opacity: 0 },
            { opacity: 1, duration },
        );
    }

    $effect(() => {
        if (pathEl && labelEl && apiRef) {
            apiRef({ draw, startFlow, stopFlow, showLabel });
        }
    });

    $effect(() => {
        return () => stopFlow();
    });
</script>

<svg class="overlay">
    <defs>
        <marker
            id="batch-arrow-head"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
        >
            <polygon points="0,0 8,3 0,6" fill="#707070" />
        </marker>
    </defs>
    <path
        bind:this={pathEl}
        {d}
        fill="none"
        stroke="#707070"
        stroke-width="1.5"
        opacity="0"
        marker-end="url(#batch-arrow-head)"
    />
</svg>

<div
    bind:this={labelEl}
    class="param-label"
    style:left="{labelX}px"
    style:top="{labelY}px"
>
    {LABELS.parameterUpdate}
</div>

<style lang="scss">
    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 45;
        overflow: visible;
    }
    .param-label {
        position: fixed;
        transform: translate(-50%, -50%);
        font-size: $fs-xs;
        color: $c-ink-3;
        background: $c-surface;
        padding: 2px 6px;
        border-radius: $radius-sm;
        pointer-events: none;
        z-index: 46;
        opacity: 0;
    }
</style>
