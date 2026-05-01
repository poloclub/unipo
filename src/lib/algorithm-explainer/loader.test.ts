import { describe, it, expect, vi } from "vitest";
import { validateAlgorithmDef } from "./loader";
import type { AlgorithmDef } from "./schema";

const baseValid: AlgorithmDef = {
    id: "test",
    name: "Test",
    title: "Test Algorithm",
    defaultVisibleCards: ["a"],
    cards: [
        {
            id: "a",
            title: "Card A",
            position: { x: 0, y: 0 },
            sections: [{ katex: "x" }],
            terms: { foo: { toCardId: "b" } },
        },
        {
            id: "b",
            title: "Card B",
            position: { x: 0, y: 100 },
            sections: [{ katex: "y" }],
        },
    ],
};

describe("validateAlgorithmDef", () => {
    it("accepts valid def", () => {
        expect(() => validateAlgorithmDef(baseValid)).not.toThrow();
    });

    it("throws when defaultVisibleCards references missing card", () => {
        const bad = { ...baseValid, defaultVisibleCards: ["nope"] };
        expect(() => validateAlgorithmDef(bad)).toThrow(/defaultVisibleCards/);
    });

    it("throws when term toCardId references missing card", () => {
        const bad: AlgorithmDef = {
            ...baseValid,
            cards: [
                {
                    ...baseValid.cards[0],
                    terms: { foo: { toCardId: "ghost" } },
                },
                baseValid.cards[1],
            ],
        };
        expect(() => validateAlgorithmDef(bad)).toThrow(/toCardId/);
    });

    it("throws when card ids are duplicated", () => {
        const bad: AlgorithmDef = {
            ...baseValid,
            cards: [baseValid.cards[0], { ...baseValid.cards[1], id: "a" }],
        };
        expect(() => validateAlgorithmDef(bad)).toThrow(/duplicate/i);
    });
});

describe("cross-algorithm convention", () => {
    it("does not warn for current ALGORITHMS registry", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        // re-import: validateConvention runs at module side-effect.
        vi.resetModules();
        await import("./loader");
        const conventionWarns = warn.mock.calls.filter((call) =>
            String(call[0]).includes("termId convention conflict"),
        );
        expect(conventionWarns).toEqual([]);
        warn.mockRestore();
    });
});

describe("validateAlgorithmDef — bindings", () => {
    const base: AlgorithmDef = {
        id: "x",
        name: "x",
        title: "x",
        defaultVisibleCards: ["c1"],
        cards: [{ id: "c1", title: "C1", position: { x: 0, y: 0 }, sections: [] }],
    };

    it("throws when binding compute references missing input", () => {
        const def: AlgorithmDef = {
            ...base,
            bindings: {
                a: { compute: "exp", inputs: ["b"] }, // b is undefined
            },
        };
        expect(() => validateAlgorithmDef(def)).toThrow(/missing/i);
    });

    it("throws on direct cycle", () => {
        const def: AlgorithmDef = {
            ...base,
            bindings: {
                a: { compute: "exp", inputs: ["a"] },
            },
        };
        expect(() => validateAlgorithmDef(def)).toThrow(/cycle/i);
    });

    it("throws on indirect cycle", () => {
        const def: AlgorithmDef = {
            ...base,
            bindings: {
                a: { compute: "mul", inputs: ["b", "b"] },
                b: { compute: "exp", inputs: ["a"] },
            },
        };
        expect(() => validateAlgorithmDef(def)).toThrow(/cycle/i);
    });

    it("accepts valid binding graph", () => {
        const def: AlgorithmDef = {
            ...base,
            bindings: {
                a: { from: "tokens.log_probs" },
                b: { compute: "exp", inputs: ["a"] },
            },
        };
        expect(() => validateAlgorithmDef(def)).not.toThrow();
    });

    it("throws when slot references missing binding", () => {
        const def: AlgorithmDef = {
            id: "x",
            name: "x",
            title: "x",
            defaultVisibleCards: ["c1"],
            cards: [
                {
                    id: "c1",
                    title: "C1",
                    position: { x: 0, y: 0 },
                    header: { binding: "missing_one" },
                    sections: [],
                },
            ],
            bindings: {},
        };
        expect(() => validateAlgorithmDef(def)).toThrow(/missing_one/);
    });

    it("throws when compare candidate references missing termId", () => {
        const def: AlgorithmDef = {
            id: "x",
            name: "x",
            title: "x",
            defaultVisibleCards: ["c1"],
            cards: [
                {
                    id: "c1",
                    title: "C1",
                    position: { x: 0, y: 0 },
                    sections: [
                        {
                            id: "s",
                            katex: "x",
                            compare: {
                                binding: "winner",
                                candidates: { left: "term-a" }, // term-a not in termValues
                                marker: "check",
                            },
                        },
                    ],
                },
            ],
            bindings: { winner: { from: "tokens.advantages" } },
        };
        expect(() => validateAlgorithmDef(def)).toThrow(/term-a/);
    });
});
