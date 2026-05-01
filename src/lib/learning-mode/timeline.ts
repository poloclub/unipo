// src/lib/learning-mode/timeline.ts
import { gsap } from "gsap";
import { strings, t } from "$lib/i18n/strings";

/** Total time each beat is allowed (animation + hold). */
export const BEAT_DURATION = 2.0;

export interface TimelineRefs {
    promptBlockEl: HTMLElement | null;
    promptLabelEl: HTMLElement | null;
    responsesLabelEl: HTMLElement | null;
    rewardLabelEl: HTMLElement | null;
    objectiveBlockEl: HTMLElement | null;
    policyLossBlockEl: HTMLElement | null;
    beatTitleEl: HTMLElement | null;
    algorithm: string;
    genArrow: {
        draw: (d: number) => gsap.core.Timeline;
        startFlow: () => void;
        stopFlow: () => void;
        fadeOut: (d: number) => gsap.core.Timeline;
    } | null;
    rolloutCardEls: HTMLElement[];
    rewardEls: HTMLElement[];
    tokenEls: HTMLElement[];
    batchArrow: {
        draw: (d: number) => gsap.core.Timeline;
        startFlow: () => void;
        stopFlow: () => void;
        showLabel: (d: number) => gsap.core.Timeline;
    } | null;
    onAdvanceCutoff: () => void;
    onPaintHeatmap: () => void;
    onSetBeatTitle: (text: string) => void;
    onComplete: () => void;
}

/**
 * Append a beat that occupies exactly BEAT_DURATION.
 * - Start: title-text swap + fade-in (~0.3s)
 * - Main animation: sub-timeline defined by build()
 * - End: hold remaining time; title fades out when the next beat begins.
 */
function addBeat(
    tl: gsap.core.Timeline,
    refs: TimelineRefs,
    title: string,
    build: (sub: gsap.core.Timeline) => void,
): void {
    const beatStart = tl.duration();

    // title fade in
    tl.call(() => refs.onSetBeatTitle(title));
    if (refs.beatTitleEl) {
        tl.fromTo(
            refs.beatTitleEl,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
        );
    }

    // Main animation (sub-timeline).
    const sub = gsap.timeline();
    build(sub);
    tl.add(sub);

    // Hold the remaining time so the beat lands on exactly BEAT_DURATION.
    const elapsed = tl.duration() - beatStart;
    const remaining = Math.max(0.05, BEAT_DURATION - elapsed);
    tl.to({}, { duration: remaining });
}

export function buildTimeline(refs: TimelineRefs): gsap.core.Timeline {
    const tl = gsap.timeline({ paused: true, onComplete: refs.onComplete });

    // Setup: hide everything that subsequent beats will fade in.
    tl.call(() => {
        const setHidden = (el: HTMLElement | null) => {
            if (el) gsap.set(el, { opacity: 0 });
        };
        setHidden(refs.promptLabelEl);
        setHidden(refs.promptBlockEl);
        setHidden(refs.responsesLabelEl);
        setHidden(refs.rewardLabelEl);
        setHidden(refs.objectiveBlockEl);
        setHidden(refs.policyLossBlockEl);
        for (const el of refs.rolloutCardEls) setHidden(el);
        for (const el of refs.rewardEls) setHidden(el);
    });

    const beats = strings.learningMode.beatTitles;

    // Beat 1: Given prompts
    addBeat(tl, refs, beats.givenPrompts, (sub) => {
        if (refs.promptLabelEl) {
            sub.fromTo(
                refs.promptLabelEl,
                { opacity: 0, y: 10 },
                { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
            );
        }
        if (refs.promptBlockEl) {
            sub.fromTo(
                refs.promptBlockEl,
                { y: 20, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" },
                refs.promptLabelEl ? "<0.1" : ">",
            );
        }
    });

    // Beat 2: LLM generates responses
    addBeat(tl, refs, beats.llmGenerates, (sub) => {
        // arrow draw (0.5s) → start flow → responses stagger
        if (refs.genArrow) {
            const genArrow = refs.genArrow;
            sub.add(genArrow.draw(0.5));
            sub.call(() => genArrow.startFlow());
        }
        if (refs.responsesLabelEl) {
            sub.fromTo(
                refs.responsesLabelEl,
                { opacity: 0, y: 6 },
                { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
                "<0.2",
            );
        }
        if (refs.rolloutCardEls.length > 0) {
            sub.fromTo(
                refs.rolloutCardEls,
                { y: 20, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 0.3,
                    stagger: 0.1,
                    ease: "power2.out",
                },
                ">",
            );
        }
    });

    // Beat 3: Reward model scores each
    addBeat(tl, refs, beats.rewardModelScores, (sub) => {
        if (refs.rewardLabelEl) {
            sub.fromTo(
                refs.rewardLabelEl,
                { opacity: 0, y: 6 },
                { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
            );
        }
        if (refs.rewardEls.length > 0) {
            sub.fromTo(
                refs.rewardEls,
                { scale: 0.5, opacity: 0 },
                {
                    scale: 1,
                    opacity: 1,
                    duration: 0.3,
                    stagger: 0.12,
                    ease: "back.out(2)",
                },
                ">",
            );
        }
    });

    // Beat 4: {algorithm} calculates token objective
    const algoLabel = refs.algorithm.toUpperCase();
    addBeat(tl, refs, t(beats.algoCalculatesObjective, { ALGO: algoLabel }), (sub) => {
        if (refs.objectiveBlockEl) {
            sub.fromTo(
                refs.objectiveBlockEl,
                { opacity: 0, y: 8 },
                { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
            );
        }
        sub.call(() => refs.onPaintHeatmap());
        // Token paint is a CSS transition (~0.3s + stagger); hold long enough to be visible.
        sub.to({}, { duration: 0.6 });
    });

    // Beat 5: Aggregate policy loss
    addBeat(tl, refs, beats.aggregatePolicyLoss, (sub) => {
        if (refs.policyLossBlockEl) {
            sub.fromTo(
                refs.policyLossBlockEl,
                { opacity: 0, y: 8 },
                { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
            );
        }
    });

    // Beat 6: Update model parameter
    addBeat(tl, refs, beats.updateModelParameter, (sub) => {
        if (refs.batchArrow) {
            const batchArrow = refs.batchArrow;
            sub.add(batchArrow.draw(0.7));
            sub.call(() => batchArrow.startFlow());
        }
        sub.call(() => refs.onAdvanceCutoff());
    });

    return tl;
}
