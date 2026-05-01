import type {
    AlgorithmDef,
    BindingId,
    CardId,
    ComputeKind,
    ValueSlot,
} from "./schema";
import type {
    AlgoHparams,
    RunMeta,
    TrainingStep,
    PromptGroup,
    Response,
    TokenSeries,
} from "$lib/radial-chart/types";

export interface BindingContext {
    header: { hparams: AlgoHparams; meta: RunMeta };
    entry: TrainingStep;
    prompt: PromptGroup;
    response: Response;
    tokens: TokenSeries;
    tokenIndex: number;
}

const SCOPES = ["header", "entry", "prompt", "response", "tokens"] as const;
type Scope = (typeof SCOPES)[number];

export function readPath(path: string, ctx: BindingContext): unknown {
    // Wildcard form "scope.<...>[*].<sub>": read sub-path from each array element and
    // return as an array. Example: "prompt.responses[*].reward" → array of every
    // response.reward in the same prompt.
    const wildIdx = path.indexOf("[*].");
    if (wildIdx !== -1) {
        const arrayPath = path.slice(0, wildIdx);
        const restPath = path.slice(wildIdx + 4);
        const arr = readPath(arrayPath, ctx);
        if (!Array.isArray(arr)) return null;
        const restSegs = restPath.split(".");
        const out: unknown[] = [];
        for (const item of arr) {
            let cur: any = item;
            for (const seg of restSegs) {
                if (cur == null) break;
                cur = cur[seg];
            }
            if (cur != null) out.push(cur);
        }
        return out;
    }

    const dot = path.indexOf(".");
    if (dot === -1) return null;
    const scope = path.slice(0, dot) as Scope;
    if (!SCOPES.includes(scope)) return null;
    const rest = path.slice(dot + 1).split(".");
    let cur: any = ctx[scope];
    for (const seg of rest) {
        if (cur == null) return null;
        cur = cur[seg];
    }
    if (scope === "tokens" && Array.isArray(cur)) {
        const v = cur[ctx.tokenIndex];
        return v ?? null;
    }
    return cur ?? null;
}

type ComputeFn = (...args: any[]) => number | string;

export const computeFns: Record<ComputeKind, ComputeFn> = {
    exp: (a: number) => Math.exp(a),
    log: (a: number) => Math.log(a),
    neg: (a: number) => -a,
    neg_mul: (a: number, b: number) => -(a * b),
    add: (a: number, b: number) => a + b,
    sub: (a: number, b: number) => a - b,
    mul: (a: number, b: number) => a * b,
    div: (a: number, b: number) => a / b,
    min: (a: number, b: number) => Math.min(a, b),
    max: (a: number, b: number) => Math.max(a, b),
    min_winner: (a: number, b: number) => (a <= b ? "left" : "right"),
    clip_mul: (
        ratio: number,
        advantage: number,
        eps: number | [number, number],
    ) => {
        const [lo, hi] = Array.isArray(eps) ? eps : [eps, eps];
        const clipped = Math.min(Math.max(ratio, 1 - lo), 1 + hi);
        return clipped * advantage;
    },
    array_mean: (arr: number[]) => {
        const valid = (arr ?? []).filter((v) => Number.isFinite(v));
        if (valid.length === 0) return NaN;
        return valid.reduce((a, b) => a + b, 0) / valid.length;
    },
    // Sample std (Bessel-corrected, divisor n-1) — matches torch.std() default
    // and the convention used by the training code that produced the dataset,
    // so displayed std × advantage formula reconciles back to the stored advantage.
    array_std: (arr: number[]) => {
        const valid = (arr ?? []).filter((v) => Number.isFinite(v));
        if (valid.length < 2) return NaN;
        const m = valid.reduce((a, b) => a + b, 0) / valid.length;
        const v =
            valid.reduce((s, x) => s + (x - m) ** 2, 0) / (valid.length - 1);
        return Math.sqrt(v);
    },
};

export type SlotKind =
    | "card-header"
    | "section-header"
    | "term"
    | "compare-winner";

export function slotKey(
    cardId: CardId,
    sectionId: string | null,
    kind: SlotKind,
    termId: string | null,
): string {
    return `${cardId}::${sectionId ?? "_"}::${kind}::${termId ?? "_"}`;
}

export function formatValue(
    v: unknown,
    fmt: ValueSlot["format"],
): string | null {
    if (v == null) return null;
    if (typeof v === "string" || fmt === "string") return String(v);
    if (typeof v !== "number") return null;
    if (!Number.isFinite(v)) return null;
    if (!fmt || fmt.startsWith("decimal:")) {
        const digits = fmt ? Number(fmt.split(":")[1]) : 3;
        return v.toFixed(digits);
    }
    if (fmt.startsWith("sigfig:")) {
        const digits = Number(fmt.split(":")[1]);
        return v.toPrecision(digits).replace(/\.?0+$/, "");
    }
    return String(v);
}

export interface SlotValue {
    text: string;
    raw: unknown;
    slot: ValueSlot;
}

export function evaluateAllSlots(
    algo: AlgorithmDef,
    ctx: BindingContext,
    visibleCards: Set<CardId>,
): Map<string, string> {
    const out = new Map<string, string>();
    const cache = new Map<BindingId, unknown>();

    const put = (
        cardId: CardId,
        sectionId: string | null,
        kind: SlotKind,
        termId: string | null,
        slot: ValueSlot,
    ) => {
        const raw = evaluate(slot.binding, ctx, algo, cache);
        const text = formatValue(raw, slot.format);
        if (text != null) {
            out.set(slotKey(cardId, sectionId, kind, termId), text);
        }
    };

    for (const card of algo.cards) {
        if (!visibleCards.has(card.id)) continue;
        if (card.header) {
            put(card.id, null, "card-header", null, card.header);
        }
        for (const section of card.sections) {
            const sid = section.id ?? null;
            if (section.header) {
                put(card.id, sid, "section-header", null, section.header);
            }
            if (section.termValues) {
                for (const [termId, slot] of Object.entries(
                    section.termValues,
                )) {
                    put(card.id, sid, "term", termId, slot);
                }
            }
            if (section.compare) {
                const winner = evaluate(
                    section.compare.binding,
                    ctx,
                    algo,
                    cache,
                );
                if (typeof winner === "string") {
                    const termId = section.compare.candidates[winner];
                    if (termId) {
                        out.set(
                            slotKey(card.id, sid, "compare-winner", termId),
                            "✓",
                        );
                    }
                }
            }
        }
    }
    return out;
}

export function evaluate(
    id: BindingId,
    ctx: BindingContext,
    algo: AlgorithmDef,
    cache: Map<BindingId, unknown>,
): unknown {
    if (cache.has(id)) return cache.get(id) ?? null;
    const def = algo.bindings?.[id];
    if (!def) {
        cache.set(id, null);
        return null;
    }
    let result: unknown;
    if ("from" in def) {
        result = readPath(def.from, ctx);
    } else {
        const args = def.inputs.map((i) => evaluate(i, ctx, algo, cache));
        if (args.some((a) => a == null)) {
            result = null;
        } else {
            const fn = computeFns[def.compute];
            result = fn(...(args as number[]));
            if (typeof result === "number" && !Number.isFinite(result)) {
                result = null;
            }
        }
    }
    cache.set(id, result);
    return result;
}
