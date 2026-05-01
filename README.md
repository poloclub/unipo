# UNIPO

Interactive single-page tool for visualizing PPO / GRPO / DAPO and other policy-optimization training runs. Walk through metrics on a radial chart, click a step to inspect its prompts and rollouts, click a token to see how its objective was computed.

Bring your own training run — the tool runs locally and reads JSON / JSONL files you place in `data/`.

## Quick start (your own run)

### 1. Drop your training log into `data/`

Format your file per [`docs/canonical_schema.json`](docs/canonical_schema.json) (annotated reference). Single JSON or JSONL both work.

### 2. Run the build script

```bash
python scripts/build_data.py data/<your-file>.json
```

Splits your file into `static/<algo>/step-*.json` + `static/<algo>_metrics.json`, and registers the run in `static/algos.json`.

### 3. Start the dev server

```bash
npm install   # first time only
npm run dev
```

Open the printed URL. Your run appears in the left rail.

### Deploying to the web

`static/<algo>/` step files can easily reach 1GB+ — too heavy for git. Upload that folder to a CDN-fronted host (e.g. [Hugging Face Datasets](https://huggingface.co/docs/hub/datasets-adding) — free, CORS-enabled) and set `VITE_STEP_DATA_BASE` to the resolve URL before building:

```bash
VITE_STEP_DATA_BASE=https://huggingface.co/datasets/<user>/<repo>/resolve/main npm run build
```

Step JSONs are fetched from `${VITE_STEP_DATA_BASE}/<algo>/...`. Metrics stay in `static/`.

## Adding a custom algorithm

The algorithm explainer (right-panel cards, formulas, term links) is driven by per-algorithm JSON definitions. The repo ships GRPO by default; PPO / REINFORCE / DAPO / Dr.GRPO are included as reference examples. To add your own:

### 1. Write the algorithm definition

Create `src/lib/algorithm-explainer/algorithms/<key>.json` describing your algorithm's cards, sections, term links, and bindings. See [`docs/canonical_algorithm.json`](docs/canonical_algorithm.json) for an annotated reference, the existing files (`grpo.json`, `ppo.json`, ...) as working templates, and [`src/lib/algorithm-explainer/schema.ts`](src/lib/algorithm-explainer/schema.ts) for the authoritative schema.

### 2. Register it in the loader

In [`src/lib/algorithm-explainer/loader.ts`](src/lib/algorithm-explainer/loader.ts), add an import and an entry to the `ALGORITHMS` map:

```ts
import myalgoJson from "./algorithms/myalgo.json";
const MYALGO = myalgoJson as unknown as AlgorithmDef;
validateAlgorithmDef(MYALGO);

export const ALGORITHMS: Record<string, AlgorithmDef> = {
    // ...existing entries
    myalgo: MYALGO,
};
```

Without this, the explainer doesn't know your definition exists — clicking the rail item shows nothing.

### 3. Register it in the rail index

Add an entry to `static/algos.json` so the left-rail run picker shows your algorithm:

```json
{ "key": "myalgo", "abbr": "MY", "fullName": "My Algorithm" }
```

The `key` must match the filename in step 1 and the map key in step 2.

### 4. (Optional) Add a training run for the radial chart

If you also have training-log data for this algorithm, set `"algorithm": "myalgo"` in your file's `header` and follow the [Quick start](#quick-start-your-own-run) — `build_data.py` will derive the key from that field and write to `static/myalgo/`.

## Development

```bash
npm run check    # TypeScript / Svelte type check
npm run test     # Vitest unit tests
npm run build    # production static build
```
