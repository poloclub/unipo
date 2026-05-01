import { describe, it, expect } from 'vitest';
import { createAngleScale, createRadiusScale, ringBaseRadius } from './scales';
import { CHART_CONSTANTS } from './types';

describe('createAngleScale', () => {
	it('maps 0 to 0 rad', () => {
		const scale = createAngleScale(100);
		expect(scale(0)).toBe(0);
	});

	it('maps totalSteps to 2π', () => {
		const scale = createAngleScale(100);
		expect(scale(100)).toBeCloseTo(Math.PI * 2);
	});

	it('maps midpoint to π', () => {
		const scale = createAngleScale(100);
		expect(scale(50)).toBeCloseTo(Math.PI);
	});

	it('scales linearly', () => {
		const scale = createAngleScale(10);
		expect(scale(2.5)).toBeCloseTo(Math.PI * 0.5);
		expect(scale(7.5)).toBeCloseTo(Math.PI * 1.5);
	});
});

describe('createRadiusScale', () => {
	it('maps minVal to 0', () => {
		const scale = createRadiusScale(0, 10);
		expect(scale(0)).toBe(0);
	});

	it('maps maxVal to maxHeight default', () => {
		const scale = createRadiusScale(0, 10);
		expect(scale(10)).toBe(CHART_CONSTANTS.MAX_AREA_HEIGHT);
	});

	it('honors custom maxHeight', () => {
		const scale = createRadiusScale(0, 10, 200);
		expect(scale(10)).toBe(200);
		expect(scale(5)).toBe(100);
	});

	it('clamps below minVal to 0', () => {
		const scale = createRadiusScale(0, 10);
		expect(scale(-5)).toBe(0);
	});

	it('clamps above maxVal to maxHeight', () => {
		const scale = createRadiusScale(0, 10, 60);
		expect(scale(999)).toBe(60);
	});

	it('handles negative domain', () => {
		const scale = createRadiusScale(-1, 1, 100);
		expect(scale(-1)).toBe(0);
		expect(scale(0)).toBe(50);
		expect(scale(1)).toBe(100);
	});
});

describe('ringBaseRadius', () => {
	it('returns baseRadius for index 0', () => {
		expect(ringBaseRadius(0, 150, 60, 10)).toBe(150);
	});

	it('stacks rings by (maxHeight + gap)', () => {
		expect(ringBaseRadius(1, 150, 60, 10)).toBe(220);
		expect(ringBaseRadius(2, 150, 60, 10)).toBe(290);
	});

	it('uses CHART_CONSTANTS defaults', () => {
		const { BASE_RADIUS, MAX_AREA_HEIGHT, RING_GAP } = CHART_CONSTANTS;
		expect(ringBaseRadius(0)).toBe(BASE_RADIUS);
		expect(ringBaseRadius(3)).toBe(BASE_RADIUS + 3 * (MAX_AREA_HEIGHT + RING_GAP));
	});
});
