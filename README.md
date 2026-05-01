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

`static/<algo>/` step files can easily reach 1GB+ — too heavy for git. Upload that folder to a CDN-fronted host (e.g. [Hugging Face Datasets](https://huggingface.co/docs/hub/datasets-adding) — free, CORS-enabled) and point the app at it via `VITE_STEP_DATA_BASE`. Step JSONs are then fetched from `${VITE_STEP_DATA_BASE}/<algo>/...`; metrics stay in `static/`.

**Manual build** — pass it inline:

```bash
VITE_STEP_DATA_BASE=https://huggingface.co/datasets/<user>/<repo>/resolve/main npm run build
```

**GitHub Pages auto-deploy** — edit [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)'s `VITE_STEP_DATA_BASE` line to your URL. The included workflow builds on push to `main` and publishes to Pages.

## Adding a custom algorithm

The algorithm explainer (right-panel cards, formulas, term links) is driven by per-algorithm JSON definitions. The repo ships GRPO by default; PPO / REINFORCE / DAPO / Dr.GRPO are included as reference examples.

### 1. Drop the algorithm definition into `algorithms/`

Create `src/lib/algorithm-explainer/algorithms/<key>.json`. See [`docs/canonical_algorithm.json`](docs/canonical_algorithm.json) for an annotated reference, the existing files (`grpo.json`, `ppo.json`, ...) as working templates, and [`src/lib/algorithm-explainer/schema.ts`](src/lib/algorithm-explainer/schema.ts) for the authoritative schema.

### 2. (Optional) Add a training run

Set `"algorithm": "<key>"` in your training log's `header` and follow the [Quick start](#quick-start-your-own-run). `build_data.py` writes the metrics + step files and registers the run in `static/algos.json` so it shows up in the left rail.

A run can have an algorithm definition without training data (rail entry won't appear until you build a run), or training data without a definition (run shows in the rail and renders metrics, but the explainer panel stays empty).

## Development

```bash
npm run check    # TypeScript / Svelte type check
npm run test     # Vitest unit tests
npm run build    # production static build
```
