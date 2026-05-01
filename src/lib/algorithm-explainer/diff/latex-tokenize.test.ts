import { describe, it, expect } from "vitest";
import { tokenizeLatex } from "./latex-tokenize";

describe("tokenizeLatex", () => {
    it("splits simple control sequences and chars", () => {
        expect(tokenizeLatex("1 + \\alpha")).toEqual(["1", "+", "\\alpha"]);
    });

    it("absorbs script into base atom", () => {
        expect(tokenizeLatex("\\epsilon_{low}")).toEqual(["\\epsilon_{low}"]);
    });

    it("absorbs both subscript and superscript", () => {
        expect(tokenizeLatex("x_i^2")).toEqual(["x_i^2"]);
    });

    it("absorbs argument groups for control sequences", () => {
        expect(tokenizeLatex("\\frac{1}{N}")).toEqual(["\\frac{1}{N}"]);
        expect(tokenizeLatex("\\hat{A}_{i,t}")).toEqual(["\\hat{A}_{i,t}"]);
    });

    it("treats standalone groups as separate atoms", () => {
        expect(tokenizeLatex("{x} + {y}")).toEqual(["{x}", "+", "{y}"]);
    });

    it("handles \\sum with scripts but no arg groups", () => {
        expect(tokenizeLatex("\\sum_{i=1}^N x")).toEqual([
            "\\sum_{i=1}^N",
            "x",
        ]);
    });

    it("handles single-symbol commands like \\!", () => {
        expect(tokenizeLatex("\\!")).toEqual(["\\!"]);
    });

    it("handles nested \\htmlClass", () => {
        const src = "\\htmlClass{term term--ratio}{\\text{Ratio}}";
        expect(tokenizeLatex(src)).toEqual([src]);
    });

    it("treats \\begin{aligned}...\\end{aligned} as a single opaque atom", () => {
        const src = "\\begin{aligned} & a \\\\ & b \\end{aligned}";
        expect(tokenizeLatex(src)).toEqual([src]);
    });

    it("does not break content after a \\begin/\\end block", () => {
        const src = "\\begin{aligned} a \\end{aligned} + 1";
        expect(tokenizeLatex(src)).toEqual([
            "\\begin{aligned} a \\end{aligned}",
            "+",
            "1",
        ]);
    });

    it("treats \\left ... \\right as a single opaque atom", () => {
        const src = "\\left( a + b \\right)";
        expect(tokenizeLatex(src)).toEqual([src]);
    });

    it("handles \\left\\{ ... \\right.", () => {
        const src = "\\left\\{ x \\right.";
        expect(tokenizeLatex(src)).toEqual([src]);
    });

    it("does not break content after a \\left/\\right block", () => {
        const src = "\\left( a \\right) + 1";
        expect(tokenizeLatex(src)).toEqual(["\\left( a \\right)", "+", "1"]);
    });
});
