import { describe, it, expect } from 'vitest';
import {
	createFisheyeAngle,
	normalizeFisheyeConfig,
	computeFocusRange,
	fisheyeSegments,
	type FisheyeConfig,
} from './fisheye';

const baseConfig: FisheyeConfig = {
	focusRadius: 5,
	focusFraction: 0.1,
	rampFraction: 0.05,
};

describe('normalizeFisheyeConfig', () => {
	it('accepts valid config unchanged', () => {
		const out = normalizeFisheyeConfig(10000, baseConfig);
		expect(out.focusRadius).toBe(5);
		expect(out.focusFraction).toBe(0.1);
		expect(out.rampFraction).toBe(0.05);
		expect(out.taperSigma).toBe(0.6);
	});

	it('throws when focusRadius too large for totalSteps', () => {
		expect(() => normalizeFisheyeConfig(10, { ...baseConfig, focusRadius: 10 })).toThrow(
			/focusRadius too large/,
		);
	});

	it('throws on focusFraction out of (0, 1)', () => {
		expect(() => normalizeFisheyeConfig(10000, { ...baseConfig, focusFraction: 0 })).toThrow();
		expect(() => normalizeFisheyeConfig(10000, { ...baseConfig, focusFraction: 1 })).toThrow();
		expect(() => normalizeFisheyeConfig(10000, { ...baseConfig, focusFraction: -0.1 })).toThrow();
	});

	it('throws on rampFraction out of [0, 0.5]', () => {
		expect(() => normalizeFisheyeConfig(10000, { ...baseConfig, rampFraction: -0.1 })).toThrow();
		expect(() => normalizeFisheyeConfig(10000, { ...baseConfig, rampFraction: 0.6 })).toThrow();
	});

	it('throws on non-integer focusRadius', () => {
		expect(() => normalizeFisheyeConfig(10000, { ...baseConfig, focusRadius: 1.5 })).toThrow();
	});

	it('clamps rampFraction down when focus+ramp exceeds half the circle', () => {
		// totalSteps=100, focusRadius=10 → maxRamp = 40 steps. Request rampFraction=0.5 = 50 steps.
		const out = normalizeFisheyeConfig(100, {
			...baseConfig,
			focusRadius: 10,
			rampFraction: 0.5,
		});
		// rampFraction should reflect clamped step count ≤ 40/100
		expect(out.rampFraction).toBeLessThanOrEqual(0.4);
	});

	it('clamps rampFraction up to min required for monotonicity', () => {
		// focusFraction 0.2 on 10000 steps: halfExtra needs ~500 steps (5%)
		const out = normalizeFisheyeConfig(10000, {
			focusRadius: 5,
			focusFraction: 0.2,
			rampFraction: 0.001,
		});
		// rampFraction should be bumped up to cover halfExtra
		expect(out.rampFraction * 10000).toBeGreaterThan(400);
	});

	it('throws if monotonicity cannot be satisfied (focus+ramp larger than available)', () => {
		// focusRadius 9 on 20 steps: max ramp = 1 step. focusFraction 0.05 needs more.
		expect(() =>
			normalizeFisheyeConfig(20, { focusRadius: 9, focusFraction: 0.05, rampFraction: 0 }),
		).toThrow(/monotonicity/);
	});
});

describe('createFisheyeAngle — hoverStep null', () => {
	it('returns natural angle scale (identity with angleScale)', () => {
		const fn = createFisheyeAngle(10000, null, baseConfig);
		const stepAngle = (Math.PI * 2) / 10000;
		expect(fn(0)).toBe(0);
		expect(fn(2500)).toBeCloseTo(Math.PI * 0.5);
		expect(fn(5000)).toBeCloseTo(Math.PI);
		expect(fn(7500)).toBeCloseTo(Math.PI * 1.5);
		expect(fn(100)).toBeCloseTo(stepAngle * 100);
	});
});

describe('createFisheyeAngle — with hover', () => {
	const total = 10000;
	const hover = 5000;
	const fn = createFisheyeAngle(total, hover, baseConfig);
	const stepAngle = (Math.PI * 2) / total;

	it('preserves center: fisheyeAngle(hoverStep) === hover natural angle', () => {
		expect(fn(hover)).toBeCloseTo(stepAngle * hover, 10);
	});

	it('far outside range: returns natural angle', () => {
		const far = 200; // well outside focus + ramp
		expect(fn(far)).toBeCloseTo(stepAngle * far, 10);
		expect(fn(9000)).toBeCloseTo(stepAngle * 9000, 10);
	});

	it('just past ramp boundary: returns natural angle', () => {
		const normalized = normalizeFisheyeConfig(total, baseConfig);
		const normRampSteps = Math.floor(normalized.rampFraction * total);
		const past = hover + baseConfig.focusRadius + normRampSteps + 1;
		expect(fn(past)).toBeCloseTo(stepAngle * past, 10);
	});

	it('is monotonically increasing across the full range', () => {
		let prev = -Infinity;
		for (let s = 0; s < total; s++) {
			const a = fn(s);
			expect(a).toBeGreaterThan(prev);
			prev = a;
		}
	});

	it('focus region spans approximately focusFraction * 2π', () => {
		const focusStart = fn(hover - 5);
		const focusEnd = fn(hover + 5);
		const span = focusEnd - focusStart;
		const expected = 0.1 * Math.PI * 2;
		// Center-preserved variant: span is expectedArc - (first + last seg)/2
		// So slightly less than expected, but same order of magnitude
		expect(span).toBeGreaterThan(expected * 0.7);
		expect(span).toBeLessThan(expected);
	});

	it('focus region is much larger than natural arc (zoomed in)', () => {
		const focusSpan = fn(hover + 5) - fn(hover - 5);
		const naturalSpan = stepAngle * 10;
		expect(focusSpan).toBeGreaterThan(naturalSpan * 50);
	});

	it('is symmetric around hoverStep', () => {
		const hoverAngle = stepAngle * hover;
		for (let off = 1; off <= 5; off++) {
			const left = hoverAngle - fn(hover - off);
			const right = fn(hover + off) - hoverAngle;
			expect(right).toBeCloseTo(left, 10);
		}
	});
});

describe('createFisheyeAngle — edge anchor (near start)', () => {
	const total = 10000;
	const r = 5;

	it('hover=0: focus window shifted to [0, 2r], anchored at angle 0', () => {
		const fn = createFisheyeAngle(total, 0, baseConfig);
		// fn(0) should be at angle 0 + (first segment half width), not at 0 exactly
		expect(fn(0)).toBeGreaterThan(0);
		// fn(2r) should be close to expandedAngle (end of focus region)
		const expandedAngle = 0.1 * Math.PI * 2;
		expect(fn(2 * r)).toBeLessThan(expandedAngle);
		expect(fn(2 * r)).toBeGreaterThan(expandedAngle * 0.8);
	});

	it('hover=0 to hover=r: always anchored at angle 0 (start mode)', () => {
		for (let h = 0; h <= r; h++) {
			const fn = createFisheyeAngle(total, h, baseConfig);
			// First step (0) should have positive but very small angle
			expect(fn(0)).toBeGreaterThan(0);
			expect(fn(0)).toBeLessThan(0.2);
			// Focus should span approximately expandedAngle
			const expandedAngle = 0.1 * Math.PI * 2;
			expect(fn(2 * r) - fn(0)).toBeGreaterThan(expandedAngle * 0.5);
		}
	});

	it('hover=0 to hover=r: monotonic across full range', () => {
		for (const h of [0, 1, 2, 3, 4, 5]) {
			const fn = createFisheyeAngle(total, h, baseConfig);
			for (let s = 0; s < total - 1; s++) {
				expect(fn(s + 1)).toBeGreaterThan(fn(s));
			}
		}
	});

	it('hover far from both boundaries: center mode with center preservation', () => {
		// For focusFraction=0.1 on 10k steps, angular threshold ≈ 500 steps
		const interiorHover = 2000;
		const fn = createFisheyeAngle(total, interiorHover, baseConfig);
		const stepAngle = (Math.PI * 2) / total;
		expect(fn(interiorHover)).toBeCloseTo(stepAngle * interiorHover, 10);
	});
});

describe('createFisheyeAngle — edge anchor (near end)', () => {
	const total = 10000;
	const r = 5;

	it('hover=last: focus anchored at angle 2π', () => {
		const fn = createFisheyeAngle(total, total - 1, baseConfig);
		const twoPi = Math.PI * 2;
		// fn(last) should be close to 2π (but not exceed it)
		expect(fn(total - 1)).toBeLessThan(twoPi);
		expect(fn(total - 1)).toBeGreaterThan(twoPi * 0.95);
	});

	it('hover in last r steps: always anchored near 2π (end mode)', () => {
		const twoPi = Math.PI * 2;
		for (let off = 0; off <= r; off++) {
			const h = total - 1 - off;
			const fn = createFisheyeAngle(total, h, baseConfig);
			expect(fn(total - 1)).toBeGreaterThan(twoPi * 0.95);
			expect(fn(total - 1)).toBeLessThan(twoPi);
		}
	});

	it('hover near end: monotonic across full range', () => {
		for (let off = 0; off <= r; off++) {
			const h = total - 1 - off;
			const fn = createFisheyeAngle(total, h, baseConfig);
			for (let s = 0; s < total - 1; s++) {
				expect(fn(s + 1)).toBeGreaterThan(fn(s));
			}
		}
	});
});

describe('computeFocusRange', () => {
	const total = 500;
	const cfg = { focusRadius: 5, focusFraction: 0.1 };

	it('center mode when hover is far from both boundaries angularly', () => {
		const range = computeFocusRange(total, 250, cfg);
		expect(range.anchor).toBe('center');
		expect(range.actualStart).toBe(245);
		expect(range.actualEnd).toBe(255);
	});

	it('start anchor when hoverAngle < expandedAngle/2', () => {
		// For totalSteps=500, focusFraction=0.1: threshold ≈ 25 steps
		for (let h = 0; h < 20; h++) {
			const range = computeFocusRange(total, h, cfg);
			expect(range.anchor).toBe('start');
		}
	});

	it('step window shifts to [0, 2r] when hover < focusRadius', () => {
		for (let h = 0; h < cfg.focusRadius; h++) {
			const range = computeFocusRange(total, h, cfg);
			expect(range.actualStart).toBe(0);
			expect(range.actualEnd).toBe(2 * cfg.focusRadius);
		}
	});

	it('start anchor can trigger even when step window is interior', () => {
		// hover=6 (angle 0.075): hover-r=1 ≥ 0 so step window interior [1..11]
		// but hoverAngle (0.075) < expandedAngle/2 (0.314) so anchor='start'
		const range = computeFocusRange(total, 6, cfg);
		expect(range.anchor).toBe('start');
		expect(range.actualStart).toBe(1);
		expect(range.actualEnd).toBe(11);
	});

	it('end anchor when hoverAngle > 2π - expandedAngle/2', () => {
		const last = total - 1;
		for (let off = 0; off < 20; off++) {
			const range = computeFocusRange(total, last - off, cfg);
			expect(range.anchor).toBe('end');
		}
	});

	it('step window shifts to [last-2r, last] when hover > lastStep - focusRadius', () => {
		const last = total - 1;
		for (let off = 0; off < cfg.focusRadius; off++) {
			const range = computeFocusRange(total, last - off, cfg);
			expect(range.actualEnd).toBe(last);
			expect(range.actualStart).toBe(last - 2 * cfg.focusRadius);
		}
	});
});

describe('createFisheyeAngle — configurable', () => {
	it('larger focusFraction creates wider focus region', () => {
		const small = createFisheyeAngle(10000, 5000, { ...baseConfig, focusFraction: 0.05 });
		const large = createFisheyeAngle(10000, 5000, { ...baseConfig, focusFraction: 0.2, rampFraction: 0.15 });

		const smallSpan = small(5005) - small(4995);
		const largeSpan = large(5005) - large(4995);
		expect(largeSpan).toBeGreaterThan(smallSpan * 3);
	});

	it('larger focusRadius covers more steps in focus', () => {
		const small = createFisheyeAngle(10000, 5000, { ...baseConfig, focusRadius: 3 });
		const large = createFisheyeAngle(10000, 5000, { ...baseConfig, focusRadius: 10 });

		// All 21 steps in large's focus should have fisheye displacement (not natural)
		const stepAngle = (Math.PI * 2) / 10000;
		expect(Math.abs(large(5007) - stepAngle * 5007)).toBeGreaterThan(1e-6);
		// small's focusRadius=3 so step 5007 is outside focus (in ramp or natural)
		// still displaced but less than large's
	});

	it('custom taperSigma changes distribution shape', () => {
		const tight = createFisheyeAngle(10000, 5000, { ...baseConfig, taperSigma: 0.3 });
		const wide = createFisheyeAngle(10000, 5000, { ...baseConfig, taperSigma: 1.0 });

		// Both are symmetric and centered but distribution differs
		// tight sigma → more mass at center, edges smaller
		const tightCenter = tight(5001) - tight(5000);
		const wideCenter = wide(5001) - wide(5000);
		expect(tightCenter).toBeGreaterThan(wideCenter);
	});

	it('rampFraction=0 makes transition abrupt but still monotonic (if monotonic possible)', () => {
		// Must use tiny focusFraction where no ramp needed
		const fn = createFisheyeAngle(10000, 5000, {
			focusRadius: 2,
			focusFraction: 0.0006, // ~ natural arc of 5 steps, no expansion needed
			rampFraction: 0,
		});
		const stepAngle = (Math.PI * 2) / 10000;
		// Outside focus, natural
		expect(fn(4000)).toBeCloseTo(stepAngle * 4000, 10);
		// Monotonic
		for (let s = 4900; s < 5100; s++) {
			expect(fn(s + 1)).toBeGreaterThan(fn(s));
		}
	});
});

describe('fisheyeSegments', () => {
	const total = 10000;
	const hover = 5000;
	const segConfig = { minSegPx: 2, maxSegPx: 6, gapPx: 4, baseRadius: 150 };

	it('returns 2*focusRadius+1 segments in center case', () => {
		const segs = fisheyeSegments(total, hover, baseConfig, segConfig);
		expect(segs).toHaveLength(11);
	});

	it('shifts window to [0, 2r] near start boundary', () => {
		const segsStart = fisheyeSegments(total, 2, baseConfig, segConfig);
		// Window shifted to [0, 10], always 2r+1 = 11 segments
		expect(segsStart).toHaveLength(11);
		expect(segsStart[0].step).toBe(0);
		expect(segsStart[segsStart.length - 1].step).toBe(10);
	});

	it('shifts window to [lastStep-2r, lastStep] near end boundary', () => {
		const segsEnd = fisheyeSegments(total, total - 3, baseConfig, segConfig);
		expect(segsEnd).toHaveLength(11);
		expect(segsEnd[0].step).toBe(total - 1 - 10);
		expect(segsEnd[segsEnd.length - 1].step).toBe(total - 1);
	});

	it('segment centerAngle matches fisheyeAngle at that step', () => {
		// Pass the same gapArc so it aligns with the segment's internal angleFn.
		const gapArc = segConfig.gapPx / segConfig.baseRadius;
		const angleFn = createFisheyeAngle(total, hover, {
			...baseConfig,
			gapArc,
		});
		const segs = fisheyeSegments(total, hover, baseConfig, segConfig);
		for (const seg of segs) {
			expect(seg.centerAngle).toBeCloseTo(angleFn(seg.step), 10);
		}
	});

	it('halfArc is largest at center (gaussian peak)', () => {
		const segs = fisheyeSegments(total, hover, baseConfig, segConfig);
		const centerIdx = segs.findIndex((s) => s.step === hover);
		expect(centerIdx).toBeGreaterThanOrEqual(0);
		const centerArc = segs[centerIdx].halfArc;
		expect(centerArc).toBeGreaterThan(segs[0].halfArc);
		expect(centerArc).toBeGreaterThan(segs[segs.length - 1].halfArc);
	});

	it('gap between adjacent segments is constant (= gapPx on baseRadius)', () => {
		const segs = fisheyeSegments(total, hover, baseConfig, segConfig);
		const gapArc = segConfig.gapPx / segConfig.baseRadius;
		for (let i = 0; i < segs.length - 1; i++) {
			const gap =
				segs[i + 1].centerAngle -
				segs[i].centerAngle -
				(segs[i].halfArc + segs[i + 1].halfArc);
			expect(gap).toBeCloseTo(gapArc, 8);
		}
	});
});
