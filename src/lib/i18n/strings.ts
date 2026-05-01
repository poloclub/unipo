// Single entry point for the UI string catalog (`ui-strings.json`).
// Algorithm explainer card text is managed separately under
// src/lib/algorithm-explainer/algorithms/*.json.
//
// Usage:
//   import { strings, t } from "$lib/i18n/strings";
//   <h3>{strings.responseList.title}</h3>
//   <Label>{t(strings.responseCard.responseLabelTemplate, { n: i + 1 })}</Label>

import data from "./ui-strings.json";

export const strings = data;

/** Replace `{key}` placeholders. Unknown keys are left intact for debugging. */
export function t(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  );
}
