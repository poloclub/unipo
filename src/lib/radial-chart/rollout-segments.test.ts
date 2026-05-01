import { describe, it, expect } from "vitest";
import { computeRolloutPhases } from "./rollout-phases";
import { computeRolloutSegments } from "./rollout-segments";
import type { TrainingStep } from "./types";

function mk(step: number, boundary = false): TrainingStep {
	return {
		step,
		metrics: {},
		...(boundary ? { is_first_step_after_rollout_phase: true } : {}),
	};
}

describe("computeRolloutSegments", () => {
	it("zero boundaries -> empty array", () => {
		const steps = [mk(0), mk(1), mk(2)];
		const phases = computeRolloutPhases(steps);
		expect(computeRolloutSegments(phases, steps.length)).toEqual([]);
	});

	it("boundary every 4 steps over 12 steps -> 3 segments", () => {
		const steps: TrainingStep[] = [];
		for (let i = 0; i < 12; i++) steps.push(mk(i, i % 4 === 0));
		const phases = computeRolloutPhases(steps);
		const segs = computeRolloutSegments(phases, steps.length);
		expect(segs).toEqual([
			{ number: 0, startIdx: 0, endIdx: 3, length: 4 },
			{ number: 1, startIdx: 4, endIdx: 7, length: 4 },
			{ number: 2, startIdx: 8, endIdx: 11, length: 4 },
		]);
	});

	it("range before the first boundary produces no segment", () => {
		const steps = [mk(0), mk(1), mk(2, true), mk(3), mk(4, true), mk(5)];
		const phases = computeRolloutPhases(steps);
		const segs = computeRolloutSegments(phases, steps.length);
		expect(segs).toEqual([
			{ number: 0, startIdx: 2, endIdx: 3, length: 2 },
			{ number: 1, startIdx: 4, endIdx: 5, length: 2 },
		]);
	});

	it("last segment extends to totalSteps-1", () => {
		const steps = [mk(0, true), mk(1), mk(2), mk(3), mk(4)];
		const phases = computeRolloutPhases(steps);
		const segs = computeRolloutSegments(phases, steps.length);
		expect(segs).toEqual([
			{ number: 0, startIdx: 0, endIdx: 4, length: 5 },
		]);
	});

	it("dense: adjacent boundaries -> length=1 segments", () => {
		const steps = [mk(0, true), mk(16, true), mk(32, true)];
		const phases = computeRolloutPhases(steps);
		const segs = computeRolloutSegments(phases, steps.length);
		expect(segs).toEqual([
			{ number: 0, startIdx: 0, endIdx: 0, length: 1 },
			{ number: 1, startIdx: 1, endIdx: 1, length: 1 },
			{ number: 2, startIdx: 2, endIdx: 2, length: 1 },
		]);
	});
});
