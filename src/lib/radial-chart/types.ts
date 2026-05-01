// src/lib/radial-chart/types.ts
//
// Canonical TrainingStep schema. Every data source (mock, DAPO, future
// additions) is converted to this schema through an adapter.

// Known metric key -> color. Unknown keys fall back to FALLBACK_METRIC_PALETTE.
// Family rules:
//   reward family   -> green
//   policy family   -> purple/pink
//   kl family       -> red
//   advantage       -> cyan/teal
//   loss (value/total) -> violet
//   length / lr     -> neutral grey
//   other           -> orange/amber/pink (distinguishing colors)
export const METRIC_COLORS: Record<string, string> = {
  // green — reward family
  reward: "#22c583",
  reward_std: "#95e1a3",
  return: "#50fa7b",
  group_reward_std: "#9ef1c1",

  // purple/pink — policy family
  policy_objective: "#c455c0",
  policy_loss: "#ff79c6",
  importance_sampling_ratio: "#e89adc",
  clip_fraction: "#ebbfeb",
  policy_clip_ratio: "#b06fd4",
  policy_lr: "#ff92ff",

  // red — kl family
  kl: "#ff5555",
  ref_kl: "#ff8a8a",

  // cyan/teal — advantage
  advantage_mean: "#5ec5d6",
  advantage_std: "#9ad9e3",

  // violet — loss
  value_loss: "#bd93f9",
  total_loss: "#d6acff",

  // neutral — length / lr
  learning_rate: "#6272a4",
  response_length: "#8d99ae",
  total_length: "#44475a",

  // distinguishing colors
  grad_norm: "#ffb86c",
  entropy: "#ff79c6",
  dynamic_sampling_pass_rate: "#e0c5ff",
};

// Cycled fallback colors for unknown metric keys.
export const FALLBACK_METRIC_PALETTE: string[] = [
  "#ffb86c",
  "#50fa7b",
  "#bd93f9",
  "#f1fa8c",
  "#ff6e6e",
  "#a7d8ff",
];

// METRIC_LABELS is sourced from the i18n catalog (`src/lib/i18n/ui-strings.json`);
// add/edit labels there.
import { strings } from "$lib/i18n/strings";
export const METRIC_LABELS: Record<string, string> = strings.metrics.labels;

// Unknown keys fall back to a key-hashed palette color so the same key always
// resolves to the same color regardless of caller-side list ordering
// (chip list vs. selected-metric list).
export function metricColor(key: string): string {
  if (METRIC_COLORS[key]) return METRIC_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % FALLBACK_METRIC_PALETTE.length;
  return FALLBACK_METRIC_PALETTE[idx];
}
export function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key;
}

/**
 * Per-step batch structure shown in the DetailPanel header.
 * All fields optional; missing fields render as "—" or are hidden.
 */
export interface StepBatchInfo {
  /** Number of prompts in this step's batch. Usually equals the run's
   *  rollout_batch_size, but dynamic sampling/filtering can cause variation. */
  promptsInBatch?: number;
  /** Responses (rollouts) per prompt. Usually group_size, but may differ after filtering. */
  responsesPerPrompt?: number;
  /** Step at which this rollout was originally sampled.
   *  Equal to the current step => fresh; otherwise reusing a prior step's rollout. */
  rolloutCollectedAtStep?: number;
  /** How many times this rollout batch has been used (1-based).
   *  Meaningful when PPO update_epochs > 1; otherwise always 1/1. */
  reuseEpoch?: { current: number; total: number };
}

export interface PromptGroup {
  prompt: string;
  responses: Response[]; // non-empty (canonical invariant)
}

/**
 * One training step. `step` is the original step value (for display);
 * positioning uses the array index. `metrics` is a partial map — only the
 * metrics present in the source are populated.
 */
export interface TrainingStep {
  step: number;
  metrics: Record<string, number>; // freeform
  prompts?: PromptGroup[];
  batch?: StepBatchInfo;
  is_first_step_after_rollout_phase?: boolean;
}

/**
 * Algorithm hyperparameters: canonical fields plus original-field preservation.
 * Used by the Explainer to substitute values into algorithm formulas.
 */
export interface AlgoHparams {
  gamma?: number; // discount factor (default 1.0)
  gae_lambda?: number; // PPO GAE lambda (default 0.95)
  clip_eps?: number | [number, number]; // PPO clip epsilon, or DAPO [lo, hi] (default 0.2)
  kl_coef?: number; // KL penalty coefficient (default 0.0)
  kl_value?: number; // measured KL (falls back to 0 when missing)
  learning_rate?: number; // policy LR
  group_size?: number; // GRPO/DAPO group size
  [key: string]: unknown; // preserve unmapped original fields
}

/**
 * Run header — meta info displayed above the chart. Missing fields render as "—".
 */
export interface RunMeta {
  model_name?: string;
  reference_model_name?: string;
  task?: string; // e.g. "math reasoning"
  dataset?: string; // e.g. "GSM8K"
  reward_strategy?: string;
  totalSteps?: number; // total step count (may differ from logged step count)
  rolloutBatchSize?: number; // prompts per step (B). Falls back to step.batch.promptsInBatch.
  groupSize?: number; // responses per prompt (G). Falls back to step.batch.responsesPerPrompt.
  maxResponseTokens?: number; // generate_max_len.
  updateEpochs?: number; // how many times a rollout batch is reused (PPO ppo_epochs).
  label?: string; // user-supplied label; useful when distinguishing duplicate algorithms.
}

/**
 * Adapter return shape: algorithm name + hparams + steps.
 * Required by the Explainer to render formulas with the correct values.
 */
export interface AlgoData {
  algorithm: string; // 'ppo' | 'grpo' | 'dapo' | ...
  hparams: AlgoHparams;
  steps: TrainingStep[];
  meta?: RunMeta;
}

export type ChartMode = "overlay" | "rings";

export const CHART_CONSTANTS = {
  DOWNSAMPLE_BINS: 500,
  MAX_SELECTED_METRICS: 4,
  BASE_RADIUS: 150,
  MAX_AREA_HEIGHT: 60,
  RING_GAP: 10,
} as const;

/** Default fisheye config — keeps ~13 steps in focus with a slightly sharper center. */
export const DEFAULT_FISHEYE = {
  focusRadius: 6, // 13-step window (±6)
  focusFraction: 0.2, // arc fraction; lower = narrower wedge
  rampFraction: 0.08,
  taperSigma: 0.28, // sharper central peak
} as const;

/** Default fisheye segment rendering config — emphasized line length/thickness, larger center. */
export const DEFAULT_FISHEYE_SEGMENT = {
  // Pixels relative to viewBox=1000 (approximately CSS px). Old size=640 baseline × 1.5625.
  minSegPx: 13,
  maxSegPx: 44,
  gapPx: 6,
  pointRadius: 5,
} as const;

export const DEFAULT_SELECTED_METRICS: string[] = ["reward", "policy_loss"];

/** Token-level series. All arrays share the same length (= response token count). */
export interface TokenSeries {
  ids: number[];
  strings?: string[];
  log_probs?: number[];
  ref_log_probs?: number[];
  old_log_probs?: number[]; // PPO-only — not present in DAPO
  values?: number[]; // PPO-only — GRPO has no critic
  advantages?: number[]; // GRPO uses a single value across all tokens
  returns?: number[];
  token_kl?: number[];
  rewards?: number[]; // sparse per-token
  prob?: number[]; // used if stored, else derived via derive.getProb
  token_objective?: number[]; // used if stored, else derived via derive.getTokenObjective
  token_loss?: number[]; // per-token loss recorded during training — sample-level color source
}

/** Single response to a prompt. */
export interface Response {
  id: string; // format `step{N}_sample{i}`
  reward: number;
  advantage?: number; // GRPO scalar advantage
  response_text?: string;
  response_length?: number;
  tokens?: TokenSeries;
}

export const COLOR_SOURCES = [
  "token_objective",
  "prob",
  "token_kl",
  "advantage",
] as const;

export type ColorSource = (typeof COLOR_SOURCES)[number];

export const DEFAULT_COLOR_SOURCE: ColorSource = "token_objective";
