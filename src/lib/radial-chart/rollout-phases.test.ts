import { describe, it, expect } from "vitest";
import { computeRolloutPhases } from "./rollout-phases";
import type { TrainingStep } from "./types";

function mk(step: number, boundary = false): TrainingStep {
	return {
		step,
		metrics: {},
		...(boundary ? { is_first_step_after_rollout_phase: true } : {}),
	};
}

describe("computeRolloutPhases", () => {
	it("phaseOf returns null when there are no boundaries", () => {
		const p = computeRolloutPhases([mk(0), mk(1), mk(2)]);
		expect(p.boundaries).toEqual([]);
		expect(p.phaseOf(1)).toBeNull();
	});

	it("sparse phase: boundary every 4 steps, 1 logged step per boundary", () => {
		const steps: TrainingStep[] = [];
		for (let i = 0; i < 12; i++) steps.push(mk(i, i % 4 === 0));
		const p = computeRolloutPhases(steps);
		expect(p.boundaries).toEqual([0, 4, 8]);

		const at5 = p.phaseOf(5);
		expect(at5).toEqual({ number: 1, startIdx: 4, offset: 1 });

		const at0 = p.phaseOf(0);
		expect(at0).toEqual({ number: 0, startIdx: 0, offset: 0 });
	});

	it("dense phase: every step is a boundary (offset=0)", () => {
		const steps: TrainingStep[] = [
			mk(0, true),
			mk(16, true),
			mk(32, true),
		];
		const p = computeRolloutPhases(steps);
		expect(p.boundaries).toEqual([0, 1, 2]);
		expect(p.phaseOf(1)).toEqual({
			number: 1,
			startIdx: 1,
			offset: 0,
		});
	});

	it("offset is the step-value difference from the boundary", () => {
		const steps = [mk(0, true), mk(10, true), mk(25)];
		const p = computeRolloutPhases(steps);
		const at2 = p.phaseOf(2);
		expect(at2).toEqual({ number: 1, startIdx: 1, offset: 15 });
	});

	it("isBoundary lookup", () => {
		const p = computeRolloutPhases([
			mk(0, true),
			mk(1),
			mk(2, true),
		]);
		expect(p.isBoundary(0)).toBe(true);
		expect(p.isBoundary(1)).toBe(false);
		expect(p.isBoundary(2)).toBe(true);
	});

	it("stepIdx before the first boundary -> null", () => {
		const steps = [mk(0), mk(1), mk(2, true), mk(3)];
		const p = computeRolloutPhases(steps);
		expect(p.phaseOf(0)).toBeNull();
		expect(p.phaseOf(1)).toBeNull();
		expect(p.phaseOf(2)?.number).toBe(0);
	});
});
