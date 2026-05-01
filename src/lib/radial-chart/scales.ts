// src/lib/radial-chart/scales.ts

import * as d3 from 'd3';
import { CHART_CONSTANTS } from './types';

/** Linear step -> angle scale: [0, totalSteps] -> [0, 2π]. */
export function createAngleScale(totalSteps: number): d3.ScaleLinear<number, number> {
  return d3.scaleLinear().domain([0, totalSteps]).range([0, Math.PI * 2]);
}

/** Metric value -> radius scale: [minVal, maxVal] -> [0, MAX_AREA_HEIGHT]. */
export function createRadiusScale(
  minVal: number,
  maxVal: number,
  maxHeight: number = CHART_CONSTANTS.MAX_AREA_HEIGHT,
): d3.ScaleLinear<number, number> {
  return d3.scaleLinear().domain([minVal, maxVal]).range([0, maxHeight]).clamp(true);
}

/** Baseline radius of the N-th ring in concentric mode. */
export function ringBaseRadius(
  ringIndex: number,
  baseRadius: number = CHART_CONSTANTS.BASE_RADIUS,
  maxHeight: number = CHART_CONSTANTS.MAX_AREA_HEIGHT,
  gap: number = CHART_CONSTANTS.RING_GAP,
): number {
  return baseRadius + ringIndex * (maxHeight + gap);
}
