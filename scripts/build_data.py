#!/usr/bin/env python3
"""Build SvelteKit static assets from canonical JSON/JSONL training logs.

Inputs:
    - JSON  (.json):  { header, blueprint?, entries[] }
    - JSONL (.jsonl): first line {"type":"header", ...}, then {"type":"step", ...}

Outputs (relative to repo_root/static/):
    static/{key}_metrics.json        — header + entries (metrics only, prompts removed)
    static/{key}/step-{N}.json       — only steps that have prompts (with blueprint fallback)
    static/algos.json                — algorithm index (append/update)

Usage:
    python scripts/build_data.py data/<file>.json
    python scripts/build_data.py data/<file>.jsonl
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

# Resolve repo root from the script location (parent of scripts/).
REPO_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = REPO_ROOT / "static"


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def sanitize_key(algorithm: str) -> str:
    """Algorithm name -> file key. Lowercased, trimmed, disallowed chars -> '_'."""
    s = algorithm.strip().lower()
    s = re.sub(r"[^a-z0-9_\-]", "_", s)
    return s


def derive_abbr(key: str) -> str:
    return key.upper()[:6]


def derive_full_name(key: str) -> str:
    return key.upper()


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> tuple[dict, list[dict]]:
    """JSON file -> (header, entries). Blueprint is passed back via header."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        print("error: JSON root is not an object.", file=sys.stderr)
        sys.exit(1)

    header = raw.get("header")
    if not isinstance(header, dict) or not header.get("algorithm"):
        print("error: header.algorithm field is missing.", file=sys.stderr)
        sys.exit(1)

    entries = raw.get("entries")
    if not isinstance(entries, list):
        print("error: entries field is not a list.", file=sys.stderr)
        sys.exit(1)

    # blueprint is JSON-only shorthand. Tag onto header for the caller to extract.
    blueprint = raw.get("blueprint")
    header["__blueprint__"] = blueprint

    return header, entries


def load_jsonl(path: Path):
    """JSONL file -> (header, generator[entry_dict]).
    First line is the header, subsequent lines are step entries (with `type` removed).
    Returns a generator to keep memory bounded."""
    f = path.open(encoding="utf-8")
    first_line = f.readline()
    if not first_line.strip():
        f.close()
        print("error: JSONL file is empty.", file=sys.stderr)
        sys.exit(1)

    first = json.loads(first_line)
    if not isinstance(first, dict) or not first.get("algorithm"):
        f.close()
        print("error: first JSONL line is missing the algorithm field.", file=sys.stderr)
        sys.exit(1)

    # Drop `type` from the header dict.
    header = {k: v for k, v in first.items() if k != "type"}
    header["__blueprint__"] = None  # JSONL has no blueprint

    # Stream remaining lines as entries.
    def _entry_gen():
        try:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if not isinstance(obj, dict):
                    continue
                # Drop `type` and treat the rest as the entry.
                entry = {k: v for k, v in obj.items() if k != "type"}
                yield entry
        finally:
            f.close()

    return header, _entry_gen()


# ---------------------------------------------------------------------------
# Build logic
# ---------------------------------------------------------------------------

def normalize_prompts(prompts: list) -> None:
    """Convert non-canonical token fields into canonical form (in-place).
    - tokens.prob -> tokens.log_probs = log(prob); preserve log_probs if already present.
    - Drop the prob field after conversion (not part of the canonical form).
    """
    if not isinstance(prompts, list):
        return
    for g in prompts:
        if not isinstance(g, dict):
            continue
        for r in g.get("responses", []) or []:
            tok = r.get("tokens") if isinstance(r, dict) else None
            if not isinstance(tok, dict):
                continue
            prob = tok.get("prob")
            if isinstance(prob, list) and "log_probs" not in tok:
                tok["log_probs"] = [
                    math.log(p) if isinstance(p, (int, float)) and p > 0 else None
                    for p in prob
                ]
            if "prob" in tok:
                tok.pop("prob", None)


def clean_step_dir(algo_dir: Path) -> None:
    """Remove existing step-*.json (leave unrelated files untouched)."""
    if not algo_dir.exists():
        return
    for p in algo_dir.iterdir():
        if re.match(r"^step-\d+\.json$", p.name):
            p.unlink()


def build(header: dict, entries_iter) -> None:
    """header + entries -> static files."""
    algorithm_raw = header.get("algorithm", "")
    if not algorithm_raw:
        print("error: header.algorithm is empty.", file=sys.stderr)
        sys.exit(1)

    key = sanitize_key(algorithm_raw)

    # Pop blueprint (JSON-only; None for JSONL).
    blueprint = header.pop("__blueprint__", None)
    blueprint_prompts = None
    if isinstance(blueprint, dict):
        blueprint_prompts = blueprint.get("prompts")

    # Output directory
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    algo_dir = STATIC_DIR / key
    clean_step_dir(algo_dir)

    metrics_entries: list[dict] = []
    step_count = 0

    for entry in entries_iter:
        if not isinstance(entry, dict):
            continue

        step = entry.get("step")
        if step is None:
            continue

        metrics = entry.get("metrics", {})

        # metrics-file entry: step, metrics, is_first_step_after_rollout_phase
        m_entry: dict = {"step": step, "metrics": metrics}
        if "is_first_step_after_rollout_phase" in entry:
            m_entry["is_first_step_after_rollout_phase"] = entry["is_first_step_after_rollout_phase"]
        metrics_entries.append(m_entry)

        # step file: resolve prompts
        entry_prompts = entry.get("prompts")
        resolved_prompts = entry_prompts if entry_prompts is not None else blueprint_prompts

        if resolved_prompts is not None:
            normalize_prompts(resolved_prompts)
            algo_dir.mkdir(parents=True, exist_ok=True)
            step_obj: dict = {"step": step, "prompts": resolved_prompts}
            if "batch" in entry:
                step_obj["batch"] = entry["batch"]
            out_path = algo_dir / f"step-{step}.json"
            out_path.write_text(json.dumps(step_obj, ensure_ascii=False))
            step_count += 1

    # {key}_metrics.json
    metrics_out = {"header": header, "entries": metrics_entries}
    (STATIC_DIR / f"{key}_metrics.json").write_text(
        json.dumps(metrics_out, ensure_ascii=False)
    )
    print(f"wrote {key}_metrics.json ({len(metrics_entries)} entries)")
    print(f"wrote {key}/ — {step_count} step files")

    # Update algos.json
    update_algos(key)


def update_algos(key: str) -> None:
    """static/algos.json — append `key` if missing, otherwise leave untouched."""
    algos_path = STATIC_DIR / "algos.json"

    if algos_path.exists():
        data = json.loads(algos_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or "algos" not in data:
            data = {"algos": []}
    else:
        data = {"algos": []}

    algos: list[dict] = data["algos"]

    existing_keys = {a["key"] for a in algos if isinstance(a, dict)}
    if key in existing_keys:
        print(f'algos.json: existing "{key}" preserved')
    else:
        algos.append({
            "key": key,
            "abbr": derive_abbr(key),
            "fullName": derive_full_name(key),
        })
        data["algos"] = algos
        algos_path.write_text(json.dumps(data, ensure_ascii=False))
        print(f'algos.json: added "{key}"')


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python scripts/build_data.py <input_file.json|jsonl>", file=sys.stderr)
        sys.exit(1)

    in_path = Path(sys.argv[1])
    if not in_path.exists():
        print(f"error: input file not found: {in_path}", file=sys.stderr)
        sys.exit(1)

    ext = in_path.suffix.lower()
    if ext == ".json":
        header, entries = load_json(in_path)
    elif ext == ".jsonl":
        header, entries = load_jsonl(in_path)
    else:
        print(f"error: unsupported file extension '{ext}'. Must be .json or .jsonl.", file=sys.stderr)
        sys.exit(1)

    build(header, entries)


if __name__ == "__main__":
    main()
