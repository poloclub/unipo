// src/lib/radial-chart/downsample.ts

import type { TrainingStep } from './types';

export interface DownsampledPoint {
	/** Array index (used for angular positioning) */
	index: number;
	/** Metric value */
	value: number;
}

/**
 * Extract steps that contain `metric` as {index, value} pairs at full resolution.
 */
export function extractMetricSeries(
	steps: TrainingStep[],
	metric: string,
): DownsampledPoint[] {
	const out: DownsampledPoint[] = [];
	for (let i = 0; i < steps.length; i++) {
		const v = steps[i].metrics[metric];
		if (v !== undefined && Number.isFinite(v)) {
			out.push({ index: i, value: v });
		}
	}
	return out;
}

/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling.
 * Steps missing the metric are excluded automatically.
 */
export function lttbDownsample(
	steps: TrainingStep[],
	metric: string,
	targetBins: number,
): DownsampledPoint[] {
	const data = extractMetricSeries(steps, metric);

	if (data.length <= targetBins) return data;

	const sampled: DownsampledPoint[] = [];
	const bucketSize = (data.length - 2) / (targetBins - 2);

	sampled.push(data[0]);

	for (let i = 0; i < targetBins - 2; i++) {
		const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
		const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;

		const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
		const nextBucketEnd = Math.min(
			Math.floor((i + 2) * bucketSize) + 1,
			data.length,
		);
		let avgX = 0;
		let avgY = 0;
		const nextLen = nextBucketEnd - nextBucketStart;
		for (let j = nextBucketStart; j < nextBucketEnd; j++) {
			avgX += data[j].index;
			avgY += data[j].value;
		}
		avgX /= nextLen;
		avgY /= nextLen;

		const prev = sampled[sampled.length - 1];
		let maxArea = -1;
		let maxIdx = bucketStart;

		for (let j = bucketStart; j < bucketEnd; j++) {
			const area = Math.abs(
				(prev.index - avgX) * (data[j].value - prev.value) -
					(prev.index - data[j].index) * (avgY - prev.value),
			);
			if (area > maxArea) {
				maxArea = area;
				maxIdx = j;
			}
		}

		sampled.push(data[maxIdx]);
	}

	sampled.push(data[data.length - 1]);

	return sampled;
}

export function downsampleAllMetrics(
	steps: TrainingStep[],
	metrics: string[],
	targetBins: number,
): Map<string, DownsampledPoint[]> {
	const result = new Map<string, DownsampledPoint[]>();
	for (const metric of metrics) {
		result.set(metric, lttbDownsample(steps, metric, targetBins));
	}
	return result;
}

/**
 * Merge fisheye region with downsampled data:
 * within hoverIndex ± fisheyeRadius use full resolution, otherwise keep downsampled.
 * Steps missing the metric are skipped.
 */
export function mergeWithFullResolution(
	downsampled: DownsampledPoint[],
	fullData: TrainingStep[],
	metric: string,
	hoverIndex: number,
	fisheyeRadius: number,
): DownsampledPoint[] {
	const rangeStart = Math.max(0, hoverIndex - fisheyeRadius);
	const rangeEnd = Math.min(fullData.length - 1, hoverIndex + fisheyeRadius);

	const outside = downsampled.filter(
		(p) => p.index < rangeStart || p.index > rangeEnd,
	);

	const inside: DownsampledPoint[] = [];
	for (let i = rangeStart; i <= rangeEnd; i++) {
		const v = fullData[i].metrics[metric];
		if (v !== undefined && Number.isFinite(v)) {
			inside.push({ index: i, value: v });
		}
	}

	return [...outside, ...inside].sort((a, b) => a.index - b.index);
}
