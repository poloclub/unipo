// src/lib/learning-mode/script.ts
// Beat-duration constants for the learning-mode animation.
// Label text is sourced from the i18n catalog (`src/lib/i18n/ui-strings.json`)
// at `learningMode.labels`.

import { strings } from "$lib/i18n/strings";

export const BEATS = {
  promptSlideIn: 0.7,
  holdAfterPrompt: 1.0,

  centerLLMFadeIn: 0.5,
  holdAfterLLM: 0.5,

  generationArrowDraw: 0.7,
  holdAfterArrow: 0.6,

  rolloutStaggerEach: 0.4,
  rolloutStaggerGap: 0.15,
  holdAfterResponses: 1.2,

  rewardStaggerEach: 0.35,
  rewardStaggerGap: 0.12,
  holdAfterRewards: 1.2,

  holdAfterHeatmap: 1.0,

  policyLossBoxFadeIn: 0.5,
  holdAfterPolicyLoss: 0.6,

  batchArrowDraw: 0.8,
  parameterUpdateLabelFade: 0.3,
  batchArrowHold: 1.0,
  centerLLMPulse: 0.3,
};

export const LABELS = strings.learningMode.labels;
