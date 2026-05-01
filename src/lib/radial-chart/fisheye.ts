// src/lib/radial-chart/fisheye.ts
//
// Pure step -> angle fisheye mapping.
// - Focus region (±focusRadius around hover, shifted at boundaries):
//   gaussian-weighted distribution over `focusFraction * 2π`.
// - Ramp region (rampSteps beyond focus): linear ramp absorbs the displacement.
// - Outside: natural angle.
// - Boundary anchoring: when hoverStep is near 0 or lastStep, the focus window
//   shifts and is anchored to angle 0 or 2π respectively.

export interface FisheyeConfig {
	/** Half-width of the focus region in steps. Window shifts in boundary modes. */
	focusRadius: number;
	/** Fraction of the circumference the focus region occupies (0..1 exclusive). */
	focusFraction: number;
	/** Ramp width as a fraction of totalSteps (0..0.5). One-sided width in center mode. */
	rampFraction: number;
	/** Gaussian sigma as a fraction of focusRadius. Default 0.6. */
	taperSigma?: number;
	/** Fixed gap between segments in radians. Default 0. */
	gapArc?: number;
}

export interface FisheyeSegmentConfig {
	minSegPx: number;
	maxSegPx: number;
	gapPx: number;
	baseRadius: number;
}

export interface FisheyeSegment {
	step: number;
	centerAngle: number;
	halfArc: number;
}

export type FisheyeAnchor = 'start' | 'end' | 'center';

export interface FisheyeRange {
	actualStart: number;
	actualEnd: number;
	anchor: FisheyeAnchor;
}

export const DEFAULT_TAPER_SIGMA = 0.6;

function gaussianWeight(offset: number, radius: number, sigmaRatio: number): number {
	if (radius <= 0) return 1;
	const sigma = radius * sigmaRatio;
	return Math.exp(-(offset * offset) / (2 * sigma * sigma));
}

/**
 * Compute the focus window range and anchor mode.
 *
 * Step window (always 2r+1 wide):
 * - hoverStep - r < 0          -> shifted to [0, 2r]
 * - hoverStep + r > lastStep   -> shifted to [lastStep-2r, lastStep]
 * - otherwise                  -> [hover-r, hover+r]
 *
 * Anchor (decided independently in angle space):
 * - hoverAngle < expandedAngle/2          -> 'start' (focus pinned to angle 0)
 * - hoverAngle > 2π - expandedAngle/2     -> 'end'   (focus pinned to angle 2π)
 * - otherwise                             -> 'center' (focus centered on hover)
 *
 * Step-window shift and angular anchor are independent but usually trigger together.
 */
export function computeFocusRange(
	totalSteps: number,
	hoverStep: number,
	config: { focusRadius: number; focusFraction: number },
): FisheyeRange {
	const lastStep = totalSteps - 1;
	const { focusRadius, focusFraction } = config;

	let actualStart: number;
	let actualEnd: number;
	if (hoverStep - focusRadius < 0) {
		actualStart = 0;
		actualEnd = Math.min(lastStep, 2 * focusRadius);
	} else if (hoverStep + focusRadius > lastStep) {
		actualStart = Math.max(0, lastStep - 2 * focusRadius);
		actualEnd = lastStep;
	} else {
		actualStart = hoverStep - focusRadius;
		actualEnd = hoverStep + focusRadius;
	}

	const stepAngle = (Math.PI * 2) / totalSteps;
	const hoverAngle = stepAngle * hoverStep;
	const expandedAngle = focusFraction * Math.PI * 2;
	const halfExpanded = expandedAngle / 2;

	let anchor: FisheyeAnchor;
	if (hoverAngle < halfExpanded) {
		anchor = 'start';
	} else if (hoverAngle > Math.PI * 2 - halfExpanded) {
		anchor = 'end';
	} else {
		anchor = 'center';
	}

	return { actualStart, actualEnd, anchor };
}

/** Validate config. Throws on impossible values; clamps fixable ones. */
export function normalizeFisheyeConfig(
	totalSteps: number,
	config: FisheyeConfig,
): Required<FisheyeConfig> {
	if (!Number.isFinite(totalSteps) || totalSteps <= 0) {
		throw new Error(`totalSteps must be a positive number, got ${totalSteps}`);
	}
	if (!Number.isInteger(config.focusRadius) || config.focusRadius < 0) {
		throw new Error(`focusRadius must be a non-negative integer, got ${config.focusRadius}`);
	}
	if (config.focusRadius * 2 + 1 > totalSteps) {
		throw new Error(
			`focusRadius too large: needs ${config.focusRadius * 2 + 1} steps but totalSteps=${totalSteps}`,
		);
	}
	if (!(config.focusFraction > 0 && config.focusFraction < 1)) {
		throw new Error(`focusFraction must be in (0, 1), got ${config.focusFraction}`);
	}
	if (!Number.isFinite(config.rampFraction) || config.rampFraction < 0 || config.rampFraction > 0.5) {
		throw new Error(`rampFraction must be in [0, 0.5], got ${config.rampFraction}`);
	}

	const taperSigma = config.taperSigma ?? DEFAULT_TAPER_SIGMA;
	if (!(taperSigma > 0)) {
		throw new Error(`taperSigma must be positive, got ${taperSigma}`);
	}

	// rampFraction * totalSteps = one-sided ramp width in steps for center mode.
	// Center mode: ramp on each side. Edge mode: one side has no ramp,
	// the other side has 2*rampSteps (preserving slope).
	// Monotonicity condition (same in both modes):
	//   rampSteps > |halfExtra| / stepAngle
	const requestedRampSteps = Math.floor(config.rampFraction * totalSteps);
	const maxRamp = Math.max(0, Math.floor(totalSteps / 2) - config.focusRadius);
	let rampSteps = Math.min(requestedRampSteps, maxRamp);

	const stepAngle = (Math.PI * 2) / totalSteps;
	const naturalFocusArc = (2 * config.focusRadius + 1) * stepAngle;
	const expandedAngle = config.focusFraction * Math.PI * 2;
	const halfExtra = Math.abs(expandedAngle - naturalFocusArc) / 2;
	const minRampForMonotonic = Math.floor(halfExtra / stepAngle) + 1;
	if (rampSteps < minRampForMonotonic) {
		rampSteps = Math.min(minRampForMonotonic, maxRamp);
		if (rampSteps < minRampForMonotonic) {
			throw new Error(
				`Cannot satisfy monotonicity: need rampSteps>=${minRampForMonotonic} but max available is ${maxRamp}. Reduce focusFraction or focusRadius.`,
			);
		}
	}

	return {
		focusRadius: config.focusRadius,
		focusFraction: config.focusFraction,
		rampFraction: rampSteps / totalSteps,
		taperSigma,
		gapArc: config.gapArc ?? 0,
	};
}

/**
 * Distribute the available arc (expandedAngle minus (n-1)*gapArc) across the
 * window proportionally to each step's gaussian weight. Returns segment arcs
 * (centerAngle = arc/2 for each segment).
 */
function computeSegmentAngles(
	actualStart: number,
	actualEnd: number,
	hoverStep: number,
	focusRadius: number,
	focusFraction: number,
	taperSigma: number,
	gapArc: number,
): number[] {
	const expandedAngle = focusFraction * Math.PI * 2;
	const weights: number[] = [];
	let total = 0;
	for (let s = actualStart; s <= actualEnd; s++) {
		const w = gaussianWeight(s - hoverStep, focusRadius, taperSigma);
		weights.push(w);
		total += w;
	}
	if (total === 0) return weights.map(() => 0);
	const n = weights.length;
	const totalGap = Math.max(0, (n - 1) * gapArc);
	const available = Math.max(0, expandedAngle - totalGap);
	return weights.map((w) => (w / total) * available);
}

/**
 * Step -> angle (radians) mapping.
 *
 * - hoverStep === null    -> identical to the natural angle scale
 * - center anchor         -> centered on hoverStep, ramps absorb displacement on both sides
 * - start anchor          -> actualStart=0 anchored to angle 0 (right ramp only)
 * - end anchor            -> actualEnd=lastStep anchored to angle 2π (left ramp only)
 * - Always strictly monotonic: step n < m  =>  angle(n) < angle(m).
 */
export function createFisheyeAngle(
	totalSteps: number,
	hoverStep: number | null,
	rawConfig: FisheyeConfig,
): (step: number) => number {
	const stepAngle = (Math.PI * 2) / totalSteps;

	if (hoverStep === null) {
		return (step: number) => stepAngle * step;
	}

	const config = normalizeFisheyeConfig(totalSteps, rawConfig);
	const { focusRadius, focusFraction, rampFraction, taperSigma } = config;
	const gapArc = rawConfig.gapArc ?? 0;
	const rampSteps = Math.floor(rampFraction * totalSteps);
	const { actualStart, actualEnd, anchor } = computeFocusRange(totalSteps, hoverStep, {
		focusRadius,
		focusFraction,
	});
	const segAngles = computeSegmentAngles(
		actualStart,
		actualEnd,
		hoverStep,
		focusRadius,
		focusFraction,
		taperSigma,
		gapArc,
	);
	const expandedAngle = focusFraction * Math.PI * 2;

	let expandedRangeStart: number;
	if (anchor === 'start') {
		expandedRangeStart = 0;
	} else if (anchor === 'end') {
		expandedRangeStart = Math.PI * 2 - expandedAngle;
	} else {
		// center: hoverStep at window center; angle(hoverStep) preserves its natural angle.
		const hoverAngle = stepAngle * hoverStep;
		const hoverIdx = hoverStep - actualStart;
		const leftHalf =
			segAngles.slice(0, hoverIdx).reduce((a, b) => a + b, 0) +
			hoverIdx * gapArc +
			segAngles[hoverIdx] / 2;
		expandedRangeStart = hoverAngle - leftHalf;
	}

	// Precompute boundary displacement for ramp.
	const leftBoundaryAngle = expandedRangeStart + segAngles[0] / 2;
	const rightBoundaryAngle =
		expandedRangeStart + expandedAngle - segAngles[segAngles.length - 1] / 2;
	const leftBoundaryDisp = leftBoundaryAngle - stepAngle * actualStart;
	const rightBoundaryDisp = rightBoundaryAngle - stepAngle * actualEnd;

	// Edge anchors: one side has no ramp, the other side has 2*rampSteps (constant slope).
	// Center anchor: rampSteps on each side.
	const leftRamp = anchor === 'start' ? 0 : anchor === 'end' ? 2 * rampSteps : rampSteps;
	const rightRamp = anchor === 'end' ? 0 : anchor === 'start' ? 2 * rampSteps : rampSteps;

	return (step: number): number => {
		// Focus region
		if (step >= actualStart && step <= actualEnd) {
			const idx = step - actualStart;
			let cum = 0;
			for (let i = 0; i < idx; i++) cum += segAngles[i];
			cum += idx * gapArc;
			cum += segAngles[idx] / 2;
			return expandedRangeStart + cum;
		}

		const natural = stepAngle * step;

		// Left ramp
		if (step < actualStart) {
			if (leftRamp === 0) return natural;
			const dist = actualStart - step;
			if (dist > leftRamp) return natural;
			return natural + leftBoundaryDisp * (1 - dist / leftRamp);
		}

		// Right ramp
		if (rightRamp === 0) return natural;
		const dist = step - actualEnd;
		if (dist > rightRamp) return natural;
		return natural + rightBoundaryDisp * (1 - dist / rightRamp);
	};
}

/**
 * Compute the center angle and half-arc of each segment (the magnified tick bars)
 * along the circumference. Pixel size per segment follows the gaussian on offset
 * from hoverStep.
 */
export function fisheyeSegments(
	totalSteps: number,
	hoverStep: number,
	config: FisheyeConfig,
	segConfig: FisheyeSegmentConfig,
): FisheyeSegment[] {
	const { gapPx, baseRadius } = segConfig;
	const gapArc = gapPx / baseRadius;
	const angleFn = createFisheyeAngle(totalSteps, hoverStep, {
		...config,
		gapArc,
	});
	const norm = normalizeFisheyeConfig(totalSteps, config);
	const { focusRadius, focusFraction, taperSigma } = norm;
	const { actualStart, actualEnd } = computeFocusRange(totalSteps, hoverStep, {
		focusRadius,
		focusFraction,
	});
	// segAngles: arc length per segment (gap already excluded). halfArc = segAngles[i] / 2.
	const segAngles = computeSegmentAnglesPublic(
		actualStart,
		actualEnd,
		hoverStep,
		focusRadius,
		focusFraction,
		taperSigma,
		gapArc,
	);

	const segs: FisheyeSegment[] = [];
	for (let s = actualStart; s <= actualEnd; s++) {
		const idx = s - actualStart;
		segs.push({
			step: s,
			centerAngle: angleFn(s),
			halfArc: segAngles[idx] / 2,
		});
	}
	return segs;
}

// Public alias of the same logic so the private helper isn't exported directly.
function computeSegmentAnglesPublic(
	actualStart: number,
	actualEnd: number,
	hoverStep: number,
	focusRadius: number,
	focusFraction: number,
	taperSigma: number,
	gapArc: number,
): number[] {
	return computeSegmentAngles(
		actualStart,
		actualEnd,
		hoverStep,
		focusRadius,
		focusFraction,
		taperSigma,
		gapArc,
	);
}
