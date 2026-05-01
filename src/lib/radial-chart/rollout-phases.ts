// src/lib/radial-chart/rollout-phases.ts
//
// Compute rollout-phase information from the `is_first_step_after_rollout_phase`
// flag.
// Input:  TrainingStep[] (indexed by array position)
// Output: list of boundary indices + lookup of the phase context for any stepIdx.

import type { TrainingStep } from "./types";

export interface PhaseInfo {
	/** 0-based phase number (for display) */
	number: number;
	/** Array index of the phase's start boundary */
	startIdx: number;
	/** Position within the phase = difference of original step values
	 *  (steps[focusStepIdx].step - steps[boundaryIdx].step) */
	offset: number;
}

export interface RolloutPhases {
	/** Array indices of boundary steps, ascending. */
	boundaries: number[];
	/** Whether the given array index is a boundary. */
	isBoundary(stepIdx: number): boolean;
	/** Phase context for the given array index, or null if no phase info. */
	phaseOf(stepIdx: number): PhaseInfo | null;
}

export function computeRolloutPhases(steps: TrainingStep[]): RolloutPhases {
	const boundaries: number[] = [];
	for (let i = 0; i < steps.length; i++) {
		if (steps[i]?.is_first_step_after_rollout_phase) boundaries.push(i);
	}
	const boundarySet = new Set(boundaries);

	function phaseOf(stepIdx: number): PhaseInfo | null {
		if (boundaries.length === 0) return null;
		if (stepIdx < boundaries[0]) return null; // before the first boundary the phase is undefined

		// Find the last boundary <= stepIdx (binary search).
		let lo = 0;
		let hi = boundaries.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (boundaries[mid] <= stepIdx) lo = mid;
			else hi = mid - 1;
		}
		const startBoundaryIdx = boundaries[lo];
		const startStep = steps[startBoundaryIdx]?.step ?? 0;
		const focusStepValue = steps[stepIdx]?.step ?? startStep;
		const offset = focusStepValue - startStep;

		return {
			number: lo,
			startIdx: startBoundaryIdx,
			offset,
		};
	}

	return {
		boundaries,
		isBoundary: (stepIdx: number) => boundarySet.has(stepIdx),
		phaseOf,
	};
}
