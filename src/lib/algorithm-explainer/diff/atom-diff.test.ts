import { describe, it, expect } from "vitest";
import { atomDiff } from "./atom-diff";

describe("atomDiff", () => {
    it("returns identical mode when sources equal", () => {
        const r = atomDiff("\\alpha + \\beta", "\\alpha + \\beta");
        expect(r.mode).toBe("identical");
        if (r.mode === "identical") {
            expect(r.katex).toBe("\\alpha + \\beta");
        }
    });

    it("wraps removed and added atoms with \\htmlClass", () => {
        const r = atomDiff("1 - \\epsilon", "1 - \\epsilon_{low}");
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            expect(r.baseKatex).toContain("\\htmlClass{diff-del}{\\epsilon}");
            expect(r.compareKatex).toContain(
                "\\htmlClass{diff-add}{\\epsilon_{low}}",
            );
            expect(r.baseKatex).not.toContain("\\htmlClass{diff-del}{1}");
            expect(r.compareKatex).not.toContain("\\htmlClass{diff-add}{1}");
        }
    });

    it("wraps full prefix-only addition", () => {
        const r = atomDiff("a", "a + b");
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            expect(r.compareKatex).toContain("\\htmlClass{diff-add}{+}");
            expect(r.compareKatex).toContain("\\htmlClass{diff-add}{b}");
        }
    });

    it("preserves spaces between atoms", () => {
        const r = atomDiff("a b", "a c");
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            expect(r.baseKatex.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(2);
        }
    });

    it("recurses into \\frac args (only differing arg gets wrapped)", () => {
        const r = atomDiff("\\frac{1}{N}", "\\frac{1}{B}");
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            // Outer \frac{1}{...} is preserved
            expect(r.baseKatex).toContain("\\frac{1}");
            expect(r.compareKatex).toContain("\\frac{1}");
            // Only N and B are wrapped
            expect(r.baseKatex).toContain("\\htmlClass{diff-del}{N}");
            expect(r.compareKatex).toContain("\\htmlClass{diff-add}{B}");
            // \frac itself must not be wrapped
            expect(r.baseKatex).not.toMatch(/\\htmlClass\{diff-del\}\{\\frac/);
        }
    });

    it("recurses into \\sum scripts", () => {
        const r = atomDiff("\\sum_{i=1}^{N}", "\\sum_{i=1}^{B}");
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            expect(r.baseKatex).toContain("\\sum");
            expect(r.baseKatex).toContain("\\htmlClass{diff-del}{N}");
            expect(r.compareKatex).toContain("\\htmlClass{diff-add}{B}");
        }
    });

    it("recurses into \\left ... \\right inner content", () => {
        const r = atomDiff(
            "\\left( a \\cdot b \\right)",
            "\\left( a \\cdot c \\right)",
        );
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            // Outer \left(...\right) preserved
            expect(r.baseKatex).toContain("\\left(");
            expect(r.baseKatex).toContain("\\right)");
            // Only b vs c are wrapped
            expect(r.baseKatex).toContain("\\htmlClass{diff-del}{b}");
            expect(r.compareKatex).toContain("\\htmlClass{diff-add}{c}");
        }
    });

    it("does row-level diff inside \\begin/\\end (extra row only)", () => {
        const r = atomDiff(
            "\\begin{aligned} a \\\\ b \\end{aligned}",
            "\\begin{aligned} a \\end{aligned}",
        );
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            // Outer \begin/\end preserved
            expect(r.baseKatex).toContain("\\begin{aligned}");
            expect(r.baseKatex).toContain("\\end{aligned}");
            // Only the extra 'b' row is wrapped
            expect(r.baseKatex).toContain("\\htmlClass{diff-del}{b}");
            // No wrapping on the compare side (both keep only the 'a' row)
            expect(r.compareKatex).not.toContain("diff-add");
            expect(r.compareKatex).not.toContain("diff-del");
        }
    });

    it("wraps cell content separately, preserving & alignment", () => {
        const r = atomDiff(
            "\\begin{aligned} & |o| = X \\end{aligned}",
            "\\begin{aligned} & L = Y \\end{aligned}",
        );
        expect(r.mode).toBe("diff");
        if (r.mode === "diff") {
            // & preserved, only cell content wrapped
            expect(r.baseKatex).toContain("&");
            expect(r.compareKatex).toContain("&");
            // & itself is never wrapped
            expect(r.baseKatex).not.toContain("\\htmlClass{diff-del}{&}");
            expect(r.compareKatex).not.toContain("\\htmlClass{diff-add}{&}");
        }
    });
});
