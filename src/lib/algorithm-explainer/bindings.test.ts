import { describe, it, expect } from "vitest";
import { computeFns } from "./bindings";

describe("computeFns", () => {
    it("exp", () => {
        expect(computeFns.exp(0)).toBeCloseTo(1);
        expect(computeFns.exp(1)).toBeCloseTo(Math.E);
    });
    it("log", () => {
        expect(computeFns.log(1)).toBeCloseTo(0);
        expect(computeFns.log(Math.E)).toBeCloseTo(1);
    });
    it("neg", () => {
        expect(computeFns.neg(2)).toBe(-2);
    });
    it("neg_mul", () => {
        expect(computeFns.neg_mul(2, 3)).toBe(-6);
    });
    it("add / sub / mul / div", () => {
        expect(computeFns.add(2, 3)).toBe(5);
        expect(computeFns.sub(5, 3)).toBe(2);
        expect(computeFns.mul(2, 3)).toBe(6);
        expect(computeFns.div(6, 3)).toBe(2);
    });
    it("min / max", () => {
        expect(computeFns.min(2, 3)).toBe(2);
        expect(computeFns.max(2, 3)).toBe(3);
    });
    it("min_winner: returns 'left' when first arg is smaller", () => {
        expect(computeFns.min_winner(0.001, 0.005)).toBe("left");
        expect(computeFns.min_winner(0.005, 0.001)).toBe("right");
        expect(computeFns.min_winner(0.005, 0.005)).toBe("left");
    });
    it("clip_mul (symmetric epsilon)", () => {
        // ratio=2, advantage=1, eps=0.2 → clip(2, 0.8, 1.2) = 1.2 → 1.2 * 1 = 1.2
        expect(computeFns.clip_mul(2, 1, 0.2)).toBeCloseTo(1.2);
        // ratio=0.5, advantage=2, eps=0.2 → clip(0.5, 0.8, 1.2) = 0.8 → 0.8 * 2 = 1.6
        expect(computeFns.clip_mul(0.5, 2, 0.2)).toBeCloseTo(1.6);
        // ratio=1.0, advantage=3, eps=0.2 → no clip → 1.0 * 3 = 3.0
        expect(computeFns.clip_mul(1.0, 3, 0.2)).toBeCloseTo(3.0);
    });
    it("clip_mul (asymmetric epsilon [lo, hi])", () => {
        // ratio=2, advantage=1, eps=[0.1, 0.5] → clip(2, 0.9, 1.5) = 1.5 → 1.5 * 1 = 1.5
        expect(computeFns.clip_mul(2, 1, [0.1, 0.5])).toBeCloseTo(1.5);
        // ratio=0.5, advantage=2, eps=[0.3, 0.5] → clip(0.5, 0.7, 1.5) = 0.7 → 0.7 * 2 = 1.4
        expect(computeFns.clip_mul(0.5, 2, [0.3, 0.5])).toBeCloseTo(1.4);
    });
});

import { readPath } from "./bindings";
import type { BindingContext } from "./bindings";

const ctx: BindingContext = {
    header: {
        hparams: { clip_eps: 0.2, kl_coef: 0.04 },
        meta: { model_name: "llama" },
    },
    entry: {
        step: 5,
        metrics: { reward: 0.8, baseline: 0.05 },
    } as any,
    prompt: { prompt: "Q?", responses: [] } as any,
    response: { id: "r0", reward: 0.9, advantage: 0.4 } as any,
    tokens: {
        ids: [0, 1, 2],
        strings: ["The", " answer", " is"],
        log_probs: [-0.2, -0.5, -0.1],
        advantages: [0.3, 0.3, 0.3],
    } as any,
    tokenIndex: 1,
};

describe("readPath", () => {
    it("header scope", () => {
        expect(readPath("header.hparams.clip_eps", ctx)).toBe(0.2);
        expect(readPath("header.hparams.kl_coef", ctx)).toBe(0.04);
        expect(readPath("header.meta.model_name", ctx)).toBe("llama");
    });
    it("entry scope", () => {
        expect(readPath("entry.metrics.reward", ctx)).toBe(0.8);
        expect(readPath("entry.metrics.baseline", ctx)).toBe(0.05);
        expect(readPath("entry.step", ctx)).toBe(5);
    });
    it("response scope", () => {
        expect(readPath("response.reward", ctx)).toBe(0.9);
        expect(readPath("response.advantage", ctx)).toBe(0.4);
    });
    it("tokens scope auto-indexes by tokenIndex", () => {
        expect(readPath("tokens.log_probs", ctx)).toBe(-0.5);
        expect(readPath("tokens.strings", ctx)).toBe(" answer");
        expect(readPath("tokens.advantages", ctx)).toBe(0.3);
    });
    it("missing path returns null", () => {
        expect(readPath("header.hparams.missing", ctx)).toBeNull();
        expect(readPath("tokens.token_kl", ctx)).toBeNull();
        expect(readPath("nonexistent.path", ctx)).toBeNull();
    });
    it("tokens path with non-array leaf returns the value", () => {
        const ctx2 = { ...ctx, tokens: { count: 3 } as any };
        expect(readPath("tokens.count", ctx2)).toBe(3);
    });
});

import { evaluate } from "./bindings";
import type { AlgorithmDef } from "./schema";

const algoFixture: AlgorithmDef = {
    id: "test",
    name: "test",
    title: "test",
    defaultVisibleCards: [],
    cards: [],
    bindings: {
        log_prob_current: { from: "tokens.log_probs" },
        prob_current: { compute: "exp", inputs: ["log_prob_current"] },
        ratio: {
            compute: "div",
            inputs: ["prob_current", "prob_old"],
        },
        prob_old: { from: "tokens.old_log_probs" }, // missing in ctx
        advantage: { from: "tokens.advantages" },
        ratio_x_advantage: { compute: "mul", inputs: ["ratio", "advantage"] },
    },
};

describe("evaluate", () => {
    it("resolves a 'from' binding", () => {
        const cache = new Map();
        expect(evaluate("log_prob_current", ctx, algoFixture, cache)).toBe(-0.5);
    });
    it("resolves a 'compute' binding (exp)", () => {
        const cache = new Map();
        expect(evaluate("prob_current", ctx, algoFixture, cache)).toBeCloseTo(
            Math.exp(-0.5),
        );
    });
    it("propagates null when an input is null", () => {
        const cache = new Map();
        // prob_old reads tokens.old_log_probs which doesn't exist → null → ratio = null → ratio_x_advantage = null
        expect(evaluate("ratio", ctx, algoFixture, cache)).toBeNull();
        expect(
            evaluate("ratio_x_advantage", ctx, algoFixture, cache),
        ).toBeNull();
    });
    it("returns null for unknown binding id", () => {
        const cache = new Map();
        expect(evaluate("nonexistent", ctx, algoFixture, cache)).toBeNull();
    });
    it("uses cache (compute fn called once)", () => {
        const cache = new Map();
        evaluate("prob_current", ctx, algoFixture, cache);
        // mutate underlying ctx — cache must hold the prior value
        const before = cache.get("prob_current");
        expect(before).toBeCloseTo(Math.exp(-0.5));
    });
});

import { formatValue, evaluateAllSlots, slotKey } from "./bindings";

describe("formatValue", () => {
    it("decimal formats", () => {
        expect(formatValue(0.123456, "decimal:2")).toBe("0.12");
        expect(formatValue(0.123456, "decimal:3")).toBe("0.123");
        expect(formatValue(0.123456, "decimal:4")).toBe("0.1235");
    });
    it("sigfig:3", () => {
        expect(formatValue(0.0012345, "sigfig:3")).toBe("0.00123");
        expect(formatValue(123.456, "sigfig:3")).toBe("123");
    });
    it("string", () => {
        expect(formatValue("hello", "string")).toBe("hello");
        expect(formatValue(" answer", "string")).toBe(" answer");
    });
    it("default format (no spec) → decimal:3", () => {
        expect(formatValue(0.123456, undefined)).toBe("0.123");
    });
    it("null → null", () => {
        expect(formatValue(null, "decimal:3")).toBeNull();
    });
});

describe("evaluateAllSlots", () => {
    const algo: AlgorithmDef = {
        id: "test",
        name: "test",
        title: "test",
        defaultVisibleCards: [],
        bindings: {
            token_string: { from: "tokens.strings" },
            advantage: { from: "tokens.advantages" },
        },
        cards: [
            {
                id: "token-level",
                title: "T",
                position: { x: 0, y: 0 },
                header: { binding: "token_string", format: "string" },
                sections: [
                    {
                        id: "how",
                        label: "How",
                        katex: "Adv",
                        header: { binding: "advantage", format: "decimal:2" },
                    },
                ],
            },
        ],
    };

    it("evaluates card.header and section.header", () => {
        const slots = evaluateAllSlots(algo, ctx, new Set(["token-level"]));
        expect(slots.get(slotKey("token-level", null, "card-header", null)))
            .toBe(" answer");
        expect(slots.get(slotKey("token-level", "how", "section-header", null)))
            .toBe("0.30");
    });

    it("skips cards not in visibleCards", () => {
        const slots = evaluateAllSlots(algo, ctx, new Set());
        expect(slots.size).toBe(0);
    });
});

describe("readPath wildcard [*]", () => {
    const ctxGroup: BindingContext = {
        ...ctx,
        prompt: {
            prompt: "Q?",
            responses: [
                { id: "r0", reward: 0.8 },
                { id: "r1", reward: 0.4 },
                { id: "r2", reward: 1.0 },
            ],
        } as any,
    };
    it("collects field across array", () => {
        expect(readPath("prompt.responses[*].reward", ctxGroup)).toEqual([
            0.8, 0.4, 1.0,
        ]);
    });
    it("returns null when array path missing", () => {
        expect(readPath("prompt.nope[*].reward", ctxGroup)).toBeNull();
    });
    it("skips items missing the leaf", () => {
        const ctx2: BindingContext = {
            ...ctx,
            prompt: {
                prompt: "",
                responses: [
                    { id: "a", reward: 0.5 },
                    { id: "b" } as any,
                ],
            } as any,
        };
        expect(readPath("prompt.responses[*].reward", ctx2)).toEqual([0.5]);
    });
});

describe("array_mean / array_std", () => {
    it("array_mean", () => {
        expect(computeFns.array_mean([1, 2, 3])).toBeCloseTo(2);
        expect(computeFns.array_mean([0.8, 0.4, 1.0])).toBeCloseTo(0.7333, 3);
    });
    it("array_std (sample std, n-1 divisor)", () => {
        expect(computeFns.array_std([1, 1, 1])).toBeCloseTo(0);
        // [0, 2]: mean=1, sumSq=2, divisor=n-1=1 → sqrt(2)
        expect(computeFns.array_std([0, 2])).toBeCloseTo(Math.sqrt(2));
    });
    it("filters non-finite values", () => {
        expect(computeFns.array_mean([1, NaN, 3] as any)).toBeCloseTo(2);
    });
    it("returns NaN on empty / single-element", () => {
        expect(Number.isNaN(computeFns.array_mean([]) as number)).toBe(true);
        expect(Number.isNaN(computeFns.array_std([]) as number)).toBe(true);
        // Sample std needs n≥2.
        expect(Number.isNaN(computeFns.array_std([5]) as number)).toBe(true);
    });
});
