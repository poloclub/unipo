<!-- src/lib/learning-mode/GenerationArrow.svelte -->
<script lang="ts">
    import { gsap } from "gsap";

    interface Props {
        start: { x: number; y: number };
        end: { x: number; y: number };
        apiRef?: (api: {
            draw: (duration: number) => gsap.core.Timeline;
            startFlow: () => void;
            stopFlow: () => void;
            fadeOut: (duration: number) => gsap.core.Timeline;
        }) => void;
    }
    let { start, end, apiRef }: Props = $props();

    let pathEl: SVGPathElement;
    let flowTween: gsap.core.Tween | null = null;

    let d = $derived(
        `M${start.x},${start.y} L${end.x - 8},${end.y}`,
    );

    function draw(duration: number): gsap.core.Timeline {
        const tl = gsap.timeline();
        tl.call(() => {
            gsap.killTweensOf(pathEl);
            const length = pathEl.getTotalLength() || 200;
            gsap.set(pathEl, {
                opacity: 1,
                strokeDasharray: `0 ${length}`,
                strokeDashoffset: 0,
            });
            gsap.to(pathEl, {
                attr: { "stroke-dasharray": `${length} 0` },
                duration,
                ease: "linear",
                onComplete: () => {
                    gsap.set(pathEl, { strokeDasharray: "8 6" });
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

    function fadeOut(duration: number): gsap.core.Timeline {
        stopFlow();
        return gsap.timeline().to(pathEl, { opacity: 0, duration });
    }

    $effect(() => {
        if (pathEl && apiRef) {
            apiRef({ draw, startFlow, stopFlow, fadeOut });
        }
    });

    $effect(() => {
        return () => stopFlow();
    });
</script>

<svg class="overlay">
    <defs>
        <marker
            id="gen-arrow-head"
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
        marker-end="url(#gen-arrow-head)"
    />
</svg>

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
</style>
