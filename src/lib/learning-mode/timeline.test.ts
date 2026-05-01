import { describe, it, expect, vi } from "vitest";
import { buildTimeline, BEAT_DURATION, type TimelineRefs } from "./timeline";

function mockRefs(overrides: Partial<TimelineRefs> = {}): TimelineRefs {
    return {
        promptBlockEl: null,
        promptLabelEl: null,
        responsesLabelEl: null,
        rewardLabelEl: null,
        objectiveBlockEl: null,
        policyLossBlockEl: null,
        beatTitleEl: null,
        algorithm: "grpo",
        genArrow: null,
        rolloutCardEls: [],
        rewardEls: [],
        tokenEls: [],
        batchArrow: null,
        onAdvanceCutoff: vi.fn(),
        onPaintHeatmap: vi.fn(),
        onSetBeatTitle: vi.fn(),
        onComplete: vi.fn(),
        ...overrides,
    };
}

describe("buildTimeline", () => {
    it("returns paused timeline", () => {
        const tl = buildTimeline(mockRefs());
        expect(tl.paused()).toBe(true);
    });

    it("total duration = 6 beats × BEAT_DURATION (within tolerance)", () => {
        const tl = buildTimeline(mockRefs());
        const expected = 6 * BEAT_DURATION;
        // setup tl.call() consumes ~0 — allow small tolerance
        expect(tl.duration()).toBeGreaterThanOrEqual(expected - 0.5);
        expect(tl.duration()).toBeLessThanOrEqual(expected + 0.5);
    });

    it("calls onAdvanceCutoff when played to end", () => {
        const onAdvanceCutoff = vi.fn();
        const tl = buildTimeline(mockRefs({ onAdvanceCutoff }));
        tl.progress(1);
        expect(onAdvanceCutoff).toHaveBeenCalledTimes(1);
    });

    it("calls onSetBeatTitle 6 times (once per beat)", () => {
        const onSetBeatTitle = vi.fn();
        const tl = buildTimeline(mockRefs({ onSetBeatTitle }));
        tl.progress(1);
        expect(onSetBeatTitle).toHaveBeenCalledTimes(6);
    });
});
