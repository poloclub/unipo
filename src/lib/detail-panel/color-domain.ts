// src/lib/detail-panel/color-domain.ts
//
// Single source of truth for token-heatmap coloring:
//   - palette (pink → white → green) / gamma / alpha constants
//   - domain → d3 scale builder
//   - alpha-application helper
// Both the detail panel's token span (TokenSequence) and the algorithm-explainer
// heatmap header use these so colors are decided in one place.

import * as d3 from "d3";
import type { Response } from "$lib/radial-chart/types";

/** Alpha shared by detail panel and algorithm-explainer header. */
export const TOKEN_HEATMAP_BG_ALPHA = 0.7;
const HEATMAP_RANGE = ["#FD80A0", "#ffffff", "#2AB466"] as const;

const HEATMAP_GAMMA = 1;

/** domain → pink/white/green d3 linear scale. Caller should build once and reuse. */
export function buildTokenHeatmapScale(domain: [number, number]) {
  return d3
    .scaleLinear<string>()
    .domain([domain[0], (domain[0] + domain[1]) / 2, domain[1]])
    .range(HEATMAP_RANGE as unknown as string[])
    .interpolate(d3.interpolateRgb.gamma(HEATMAP_GAMMA))
    .clamp(true);
}

/** Apply the shared alpha to a raw scale color, returning an rgba string (null if invalid). */
export function applyTokenHeatmapAlpha(
  rawColor: string | null | undefined,
): string | null {
  if (!rawColor) return null;
  const c = d3.color(rawColor);
  if (!c) return null;
  c.opacity = TOKEN_HEATMAP_BG_ALPHA;
  return c.toString();
}

/**
 * Map value through domain and apply alpha (null if invalid).
 * One-shot helper — when coloring many tokens, build the scale once with
 * buildTokenHeatmapScale and pair with applyTokenHeatmapAlpha for efficiency.
 */
export function tokenHeatmapColor(
  value: number | null | undefined,
  domain: [number, number],
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return applyTokenHeatmapAlpha(buildTokenHeatmapScale(domain)(value));
}

/**
 * Quantile-based robust symmetric domain (0-centered).
 * If no token_objective is present, returns the [-1, 1] fallback (UI shows grey).
 */
export function robustTokenObjectiveDomain(
  responses: Response[] | undefined,
): [number, number] {
  if (!responses) return [-1, 1];
  const vals: number[] = [];
  for (const r of responses) {
    const obj = r.tokens?.token_objective;
    if (!obj) continue;
    for (const v of obj) {
      if (Number.isFinite(v)) vals.push(v);
    }
  }
  if (vals.length === 0) return [-1, 1];
  const sorted = [...vals].sort((a, b) => a - b);
  const lo = d3.quantileSorted(sorted, 0.02) ?? sorted[0];
  const hi = d3.quantileSorted(sorted, 0.98) ?? sorted[sorted.length - 1];
  const m = Math.max(Math.abs(lo), Math.abs(hi));
  return m === 0 ? [-1, 1] : [-m, m];
}
