// src/lib/radial-chart/metric-definitions.ts
//
// Per-metric definition / interpretation guide. Used by chip hover popovers
// and step-metrics tooltips. Strings are sourced from the i18n catalog
// (`src/lib/i18n/ui-strings.json`).

import { strings } from "$lib/i18n/strings";

export interface MetricDefinition {
  def: string;   // 1-2 sentence definition
  hint: string;  // one-line interpretation guide
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> =
  strings.metrics.definitions;
