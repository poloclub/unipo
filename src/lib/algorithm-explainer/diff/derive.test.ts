import { describe, it, expect } from "vitest";
import { deriveDiff } from "./derive";
import type { AlgorithmDef } from "../schema";

const grpoLike: AlgorithmDef = {
    id: "g",
    name: "G",
    title: "G",
    defaultVisibleCards: ["a"],
    cards: [
        {
            id: "a",
            title: "Step",
            position: { x: 0, y: 0 },
            sections: [
                { id: "s1", label: "Aggregation", katex: "\\frac{1}{N}" },
            ],
        },
        {
            id: "b",
            title: "Ratio",
            position: { x: 100, y: 100 },
            sections: [{ id: "r", katex: "\\pi_\\theta" }],
        },
    ],
};

const ppoLike: AlgorithmDef = {
    id: "p",
    name: "P",
    title: "P",
    defaultVisibleCards: ["a"],
    cards: [
        {
            id: "a",
            title: "Step",
            position: { x: 0, y: 0 },
            sections: [
                { id: "s1", label: "Aggregation", katex: "\\frac{1}{B}" },
            ],
        },
        {
            id: "c",
            title: "Trust",
            position: { x: 200, y: 200 },
            sections: [{ id: "t", katex: "\\mathrm{TR}" }],
        },
    ],
};

describe("deriveDiff", () => {
    it("returns all-shared when compareDef is null", () => {
        const r = deriveDiff(grpoLike, null, new Set(["a"]));
        expect(r.cards).toHaveLength(1);
        expect(r.cards[0].kind).toBe("shared");
    });

    it("classifies cards as shared / base-only / compare-only", () => {
        const r = deriveDiff(grpoLike, ppoLike, new Set(["a", "b", "c"]));
        const map = new Map(r.cards.map((c) => [c.id, c.kind]));
        expect(map.get("a")).toBe("shared");
        expect(map.get("b")).toBe("base-only");
        expect(map.get("c")).toBe("compare-only");
    });

    it("emits diff formula for shared cards with different katex", () => {
        const r = deriveDiff(grpoLike, ppoLike, new Set(["a"]));
        const a = r.cards.find((c) => c.id === "a")!;
        const sec = a.sections[0];
        expect(sec.formula?.mode).toBe("diff");
    });

    it("emits identical formula when shared section matches", () => {
        const same = JSON.parse(JSON.stringify(grpoLike)) as AlgorithmDef;
        const r = deriveDiff(grpoLike, same, new Set(["a"]));
        const a = r.cards.find((c) => c.id === "a")!;
        expect(a.sections[0].formula?.mode).toBe("identical");
    });

    it("includes default visible cards from both algorithms (union)", () => {
        const baseOnly: AlgorithmDef = {
            ...grpoLike,
            defaultVisibleCards: ["a"],
        };
        const compareOnly: AlgorithmDef = {
            ...ppoLike,
            defaultVisibleCards: ["c"],
        };
        const visible = new Set([
            ...baseOnly.defaultVisibleCards,
            ...compareOnly.defaultVisibleCards,
        ]);
        const r = deriveDiff(baseOnly, compareOnly, visible);
        const ids = r.cards.map((c) => c.id).sort();
        expect(ids).toEqual(["a", "c"]);
    });
});
