import { describe, it, expect } from 'vitest';
import {
	lttbDownsample,
	downsampleAllMetrics,
	mergeWithFullResolution,
} from './downsample';
import type { TrainingStep } from './types';

function makeSteps(
	values: (number | undefined)[],
	metric: string = 'reward',
): TrainingStep[] {
	return values.map((v, i) => ({
		step: i,
		metrics: v === undefined ? {} : { [metric]: v },
	}));
}

describe('lttbDownsample', () => {
	it('returns original data when length <= targetBins', () => {
		const steps = makeSteps([1, 2, 3]);
		const out = lttbDownsample(steps, 'reward', 10);
		expect(out).toHaveLength(3);
		expect(out.map((p) => p.value)).toEqual([1, 2, 3]);
	});

	it('returns targetBins points when downsampled', () => {
		const steps = makeSteps(Array.from({ length: 100 }, (_, i) => i));
		const out = lttbDownsample(steps, 'reward', 20);
		expect(out).toHaveLength(20);
	});

	it('preserves first and last points (by array index)', () => {
		const steps = makeSteps(Array.from({ length: 100 }, (_, i) => i * 2));
		const out = lttbDownsample(steps, 'reward', 10);
		expect(out[0]).toEqual({ index: 0, value: 0 });
		expect(out[out.length - 1]).toEqual({ index: 99, value: 198 });
	});

	it('output is monotonically increasing by index', () => {
		const steps = makeSteps(Array.from({ length: 500 }, () => Math.random()));
		const out = lttbDownsample(steps, 'reward', 50);
		for (let i = 1; i < out.length; i++) {
			expect(out[i].index).toBeGreaterThan(out[i - 1].index);
		}
	});

	it('skips steps where the metric is undefined', () => {
		// 100 steps, only every 10th has the metric
		const values = Array.from({ length: 100 }, (_, i) =>
			i % 10 === 0 ? i : undefined,
		);
		const steps = makeSteps(values);
		const out = lttbDownsample(steps, 'reward', 100);
		expect(out).toHaveLength(10);
		expect(out[0].index).toBe(0);
		expect(out[out.length - 1].index).toBe(90);
	});

	it('returns empty array if no step has the metric', () => {
		const steps: TrainingStep[] = Array.from({ length: 10 }, (_, i) => ({
			step: i,
			metrics: {},
		}));
		const out = lttbDownsample(steps, 'reward', 10);
		expect(out).toEqual([]);
	});

	it('picks the correct metric field', () => {
		const steps: TrainingStep[] = [1, 2, 3].map((v, i) => ({
			step: i,
			metrics: { policy_loss: v },
		}));
		const out = lttbDownsample(steps, 'policy_loss', 10);
		expect(out.map((p) => p.value)).toEqual([1, 2, 3]);
		const outOther = lttbDownsample(steps, 'reward', 10);
		expect(outOther).toEqual([]);
	});

	it('preserves visually significant peaks', () => {
		const values = Array.from({ length: 100 }, () => 1);
		values[50] = 1000;
		const steps = makeSteps(values);
		const out = lttbDownsample(steps, 'reward', 10);
		const peak = out.find((p) => p.value === 1000);
		expect(peak).toBeDefined();
	});
});

describe('downsampleAllMetrics', () => {
	it('returns a map with an entry per metric', () => {
		const steps: TrainingStep[] = Array.from({ length: 50 }, (_, i) => ({
			step: i,
			metrics: { reward: i, policy_loss: i * 2 },
		}));
		const result = downsampleAllMetrics(steps, ['reward', 'policy_loss'], 10);
		expect(result.size).toBe(2);
		expect(result.get('reward')!.map((p) => p.value)).toHaveLength(10);
		expect(result.get('policy_loss')!.map((p) => p.value)).toHaveLength(10);
	});

	it('returns empty map when metrics is empty', () => {
		const steps = makeSteps([1, 2, 3]);
		const result = downsampleAllMetrics(steps, [], 10);
		expect(result.size).toBe(0);
	});
});

describe('mergeWithFullResolution', () => {
	it('replaces downsampled points within fisheye range with full res', () => {
		const full = makeSteps(Array.from({ length: 20 }, (_, i) => i));
		const downsampled = [
			{ index: 0, value: 0 },
			{ index: 10, value: 10 },
			{ index: 19, value: 19 },
		];
		const merged = mergeWithFullResolution(downsampled, full, 'reward', 10, 2);
		const indexes = merged.map((p) => p.index);
		expect(indexes).toContain(8);
		expect(indexes).toContain(9);
		expect(indexes).toContain(10);
		expect(indexes).toContain(11);
		expect(indexes).toContain(12);
	});

	it('preserves downsampled points outside the fisheye range', () => {
		const full = makeSteps(Array.from({ length: 20 }, (_, i) => i));
		const downsampled = [
			{ index: 0, value: 0 },
			{ index: 10, value: 10 },
			{ index: 19, value: 19 },
		];
		const merged = mergeWithFullResolution(downsampled, full, 'reward', 10, 2);
		const indexes = merged.map((p) => p.index);
		expect(indexes).toContain(0);
		expect(indexes).toContain(19);
	});

	it('result is sorted by index ascending', () => {
		const full = makeSteps(Array.from({ length: 20 }, (_, i) => i));
		const downsampled = [
			{ index: 0, value: 0 },
			{ index: 5, value: 5 },
			{ index: 15, value: 15 },
			{ index: 19, value: 19 },
		];
		const merged = mergeWithFullResolution(downsampled, full, 'reward', 10, 3);
		for (let i = 1; i < merged.length; i++) {
			expect(merged[i].index).toBeGreaterThanOrEqual(merged[i - 1].index);
		}
	});

	it('clamps range to [0, fullData.length - 1]', () => {
		const full = makeSteps(Array.from({ length: 10 }, (_, i) => i));
		const downsampled = [
			{ index: 0, value: 0 },
			{ index: 9, value: 9 },
		];
		const merged = mergeWithFullResolution(downsampled, full, 'reward', 9, 50);
		const indexes = merged.map((p) => p.index);
		expect(Math.min(...indexes)).toBe(0);
		expect(Math.max(...indexes)).toBe(9);
	});

	it('skips steps that lack the metric', () => {
		const full: TrainingStep[] = Array.from({ length: 10 }, (_, i) => ({
			step: i,
			metrics: i % 2 === 0 ? { reward: i } : ({} as Record<string, number>),
		}));
		const merged = mergeWithFullResolution([], full, 'reward', 5, 3);
		const indexes = merged.map((p) => p.index);
		// steps 2, 4, 6, 8 have reward within [2..8]
		expect(indexes).toEqual([2, 4, 6, 8]);
	});

	it('uses the given metric field for full-res values', () => {
		const full: TrainingStep[] = Array.from({ length: 10 }, (_, i) => ({
			step: i,
			metrics: { policy_loss: i * 100 },
		}));
		const merged = mergeWithFullResolution([], full, 'policy_loss', 5, 1);
		const values = merged.map((p) => p.value);
		expect(values).toEqual([400, 500, 600]);
	});
});
