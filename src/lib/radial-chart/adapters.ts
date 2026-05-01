// src/lib/radial-chart/adapters.ts
//
// External data source -> canonical TrainingStep conversion.
// Add an adapter function here for each source whose field names differ.
// Adapters return AlgoData = {algorithm, hparams, steps} so the Explainer
// can resolve algorithm name / hyperparameters.

import { base } from '$app/paths';
import type {
	TrainingStep,
	Response,
	AlgoData,
	AlgoHparams,
	RunMeta,
	StepBatchInfo,
	PromptGroup,
} from './types';

/** Shape of a single `static/{algo}_mock.json` file. */
export interface MockAlgoFile {
	header: {
		algorithm: string;
		totalSteps: number;
		hparams?: AlgoHparams;
		meta?: RunMeta;
	};
	blueprint: {
		prompts: PromptGroup[];
	};
	entries: Array<{
		step: number;
		metrics: Record<string, number>;
		batch?: StepBatchInfo;
	}>;
}

/**
 * Lazy fetch of PPO/GRPO mock data.
 * Blueprint prompts/responses are shared across all steps (shared reference);
 * only metrics vary per step (used for the radial training curve).
 */
export async function loadMockAlgo(
	algo: 'ppo' | 'grpo',
): Promise<AlgoData> {
	const res = await fetch(`${base}/${algo}_mock.json`);
	if (!res.ok)
		throw new Error(`${algo.toUpperCase()} mock fetch failed: HTTP ${res.status}`);
	const data = (await res.json()) as MockAlgoFile;
	const steps: TrainingStep[] = data.entries.map((e) => ({
		step: e.step,
		metrics: e.metrics,
		prompts: data.blueprint.prompts,
		...(e.batch ? { batch: e.batch } : {}),
	}));
	return {
		algorithm: data.header.algorithm,
		hparams: data.header.hparams ?? {},
		steps,
		meta: {
			totalSteps: data.header.totalSteps,
			...(data.header.meta ?? {}),
		},
	};
}

/** Raw shape of a single `static/dapo/step-{N}.json` file. */
export interface DapoStepFile {
	step: number;
	prompts: Array<{
		prompt: string;
		responses: Array<{
			id: string;
			reward: number | null;
			advantage: number | null;
			response_text: string;
			response_length: number;
			tokens: {
				ids: number[];
				strings: string[];
				log_probs: number[];
				ref_log_probs: number[];
				advantages: number[];
				returns: number[];
				token_kl: number[];
			};
		}>;
	}>;
}

/**
 * DapoStepFile -> Response[] (flatten all groups).
 * null reward collapses to 0 (TS type invariant); null advantage -> undefined.
 */
export function dapoStepToResponses(file: DapoStepFile): Response[] {
	return file.prompts.flatMap((g) =>
		g.responses.map((r) => ({
			id: r.id,
			reward: r.reward ?? 0,
			advantage: r.advantage ?? undefined,
			response_text: r.response_text,
			response_length: r.response_length,
			tokens: {
				ids: r.tokens.ids,
				strings: r.tokens.strings,
				log_probs: r.tokens.log_probs,
				ref_log_probs: r.tokens.ref_log_probs,
				advantages: r.tokens.advantages,
				returns: r.tokens.returns,
				token_kl: r.tokens.token_kl,
			},
		})),
	);
}

/**
 * Base URL for step-data hosting.
 * - dev/local: defaults to `base` (SvelteKit static — fetched directly from `static/<algo>/`,
 *   flat layout)
 * - web deploy: set `VITE_STEP_DATA_BASE` to point at an external host (e.g. HF Datasets,
 *   sharded layout — see SHARD_SIZE below),
 *   e.g. VITE_STEP_DATA_BASE=https://huggingface.co/datasets/<user>/<repo>/resolve/main npm run build
 */
const STEP_DATA_BASE: string =
	(import.meta.env.VITE_STEP_DATA_BASE as string | undefined) ?? base;
// Remote hosts (HF Datasets) cap files-per-directory at 10k, so shard step files into
// sub-buckets of `SHARD_SIZE` steps. Local dev keeps the flat layout that
// build_real_static.py emits — no sharding needed under 10k per algo.
const REMOTE_HOSTED = STEP_DATA_BASE !== base;
const SHARD_SIZE = 1000;

function stepFileUrl(algo: string, step: number): string {
	if (REMOTE_HOSTED) {
		const shard = String(Math.floor(step / SHARD_SIZE)).padStart(4, '0');
		return `${STEP_DATA_BASE}/${algo}/${shard}/step-${step}.json`;
	}
	return `${STEP_DATA_BASE}/${algo}/step-${step}.json`;
}

/**
 * Lazy-fetch a DAPO step file and return { prompts, actualStep }.
 */
export async function loadDapoStep(
	step: number,
): Promise<{ prompts: PromptGroup[]; actualStep: number }> {
	const res = await fetch(stepFileUrl('dapo', step));
	if (!res.ok)
		throw new Error(
			`DAPO step ${step} fetch failed: HTTP ${res.status}`,
		);
	const file = (await res.json()) as DapoStepFile;
	const prompts: PromptGroup[] = file.prompts.map((g) => ({
		prompt: g.prompt,
		responses: g.responses.map((r) => ({
			id: r.id,
			reward: r.reward ?? 0,
			advantage: r.advantage ?? undefined,
			response_text: r.response_text,
			response_length: r.response_length,
			tokens: { ...r.tokens },
		})),
	}));
	return { prompts, actualStep: step };
}

/* -------------------------------------------------------------------------
 * Real algo adapter (DAPO, PPO, REINFORCE, ...).
 * Every static/_metrics.json already has a canonical flat header, so this
 * adapter is a pass-through with no per-algo branching.
 *
 * static/{algo}_metrics.json:
 *   { header: { algorithm, totalSteps, hparams, model_name?, ... }, entries: [...] }
 * static/{algo}/step-{N}.json:
 *   { step, prompts: [{ prompt, responses: [...] }] }
 * ------------------------------------------------------------------------- */

interface RealMetricsFile {
	header: {
		algorithm?: string;
		totalSteps?: number;
		model_name?: string;
		reference_model_name?: string;
		task?: string;
		dataset?: string;
		reward_strategy?: string;
		hparams?: Record<string, unknown>;
		[key: string]: unknown;
	};
	entries: Array<{
		step: number;
		metrics: Record<string, number>;
		is_first_step_after_rollout_phase?: boolean;
	}>;
}

interface RealStepFile {
	step: number;
	prompts: Array<{
		prompt: string;
		responses: Array<{
			id: string;
			reward: number;
			advantage?: number | null;
			response_text: string;
			response_length: number;
			tokens: {
				ids: number[];
				strings?: string[];
				log_probs?: number[];
				old_log_probs?: number[];
				ref_log_probs?: number[];
				values?: number[];
				advantages?: number[];
				rewards?: number[];
				token_kl?: number[];
				token_loss?: number[];
			};
		}>;
	}>;
}

/**
 * canonical metrics file -> AlgoData. `algoKey` is the stable identifier used
 * by rail/explainer branching. The header is already canonical/flat so we
 * read fields directly.
 */
export async function loadRealAlgo(algoKey: string): Promise<AlgoData> {
	const res = await fetch(`${base}/${algoKey}_metrics.json`);
	if (!res.ok) throw new Error(`${algoKey} metrics fetch failed: HTTP ${res.status}`);
	const data = (await res.json()) as RealMetricsFile;
	const h = data.header as Record<string, unknown>;
	const steps: TrainingStep[] = data.entries.map((e) => ({
		step: e.step,
		metrics: e.metrics,
		...(e.is_first_step_after_rollout_phase ? { is_first_step_after_rollout_phase: true } : {}),
	}));
	const meta: RunMeta = { totalSteps: steps.length };
	if (typeof h.model_name === 'string') meta.model_name = h.model_name;
	if (typeof h.reference_model_name === 'string') meta.reference_model_name = h.reference_model_name as string;
	if (typeof h.reward_strategy === 'string') meta.reward_strategy = h.reward_strategy as string;
	if (typeof h.task === 'string') meta.task = h.task as string;
	if (typeof h.dataset === 'string') meta.dataset = h.dataset as string;
	if (typeof h.totalSteps === 'number') meta.totalSteps = h.totalSteps;
	if (typeof h.rollout_batch_size === 'number') meta.rolloutBatchSize = h.rollout_batch_size as number;
	if (typeof h.update_epochs === 'number') meta.updateEpochs = h.update_epochs as number;
	const algorithm = typeof h.algorithm === 'string' ? h.algorithm : algoKey;
	const hparams = (h.hparams ?? {}) as AlgoHparams;
	if (meta.rolloutBatchSize == null && typeof hparams.micro_rollout_batch_size === 'number') {
		meta.rolloutBatchSize = hparams.micro_rollout_batch_size as number;
	}
	if (meta.groupSize == null) {
		const nSamples = hparams.n_samples_per_prompt;
		if (typeof nSamples === 'number') meta.groupSize = nSamples;
		else if (typeof hparams.group_size === 'number') meta.groupSize = hparams.group_size;
	}
	return { algorithm, hparams, steps, meta };
}

/**
 * Real algo step file -> { prompts, actualStep }.
 */
export async function loadRealStep(
	algoKey: string,
	step: number,
): Promise<{ prompts: PromptGroup[]; actualStep: number }> {
	const res = await fetch(stepFileUrl(algoKey, step));
	if (!res.ok)
		throw new Error(`${algoKey} step ${step} fetch failed: HTTP ${res.status}`);
	const file = (await res.json()) as RealStepFile;
	const prompts: PromptGroup[] = file.prompts.map((g) => ({
		prompt: g.prompt,
		responses: g.responses.map((r) => ({
			id: r.id,
			reward: r.reward,
			advantage: r.advantage ?? undefined,
			response_text: r.response_text,
			response_length: r.response_length,
			tokens: { ...r.tokens },
		})),
	}));
	return { prompts, actualStep: step };
}
