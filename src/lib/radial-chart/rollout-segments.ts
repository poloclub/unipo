// src/lib/radial-chart/rollout-segments.ts
//
// Convert rollout boundary indices into step-span segments for direct SVG
// rendering of the rollout band (the strip just inside the innermost ring).

import type { RolloutPhases } from "./rollout-phases";

export interface RolloutSegment {
	/** 0-based rollout number (matches phaseOf().number). */
	number: number;
	/** Array index of the segment's first step. */
	startIdx: number;
	/** Array index of the segment's last step (inclusive). */
	endIdx: number;
	/** Step count in the segment = endIdx - startIdx + 1. */
	length: number;
}

/**
 * Convert boundary list to step-span segments.
 *
 * Rules:
 * - i-th segment: [boundaries[i], boundaries[i+1]-1]
 * - Last segment: [boundaries[last], totalSteps-1]
 * - If the first boundary is > 0, the [0, boundaries[0]-1] range has no defined phase
 *   and produces no segment.
 * - Zero boundaries -> empty array.
 */
export function computeRolloutSegments(
	phases: RolloutPhases,
	totalSteps: number,
): RolloutSegment[] {
	const { boundaries } = phases;
	if (boundaries.length === 0 || totalSteps <= 0) return [];

	const segs: RolloutSegment[] = [];
	for (let i = 0; i < boundaries.length; i++) {
		const startIdx = boundaries[i];
		const nextBoundary = boundaries[i + 1];
		const endIdx =
			nextBoundary === undefined ? totalSteps - 1 : nextBoundary - 1;
		if (endIdx < startIdx) continue; // guard against malformed boundary order
		segs.push({
			number: i,
			startIdx,
			endIdx,
			length: endIdx - startIdx + 1,
		});
	}
	return segs;
}
