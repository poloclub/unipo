import { describe, it, expect } from "vitest";
import { fitToView } from "./layout";
import type { CardDef } from "./schema";

const cards = (boxes: Array<{ x: number; y: number; w: number; h: number }>): CardDef[] =>
    boxes.map((b, i) => ({
        id: String(i),
        title: "",
        position: { x: b.x, y: b.y },
        size: { w: b.w, h: b.h },
        sections: [],
    }));

describe("fitToView", () => {
    it("returns identity when single card fits viewport at scale 1", () => {
        const r = fitToView(
            cards([{ x: 0, y: 0, w: 200, h: 100 }]),
            { width: 800, height: 600 },
            { padding: 40, scaleExtent: [0.5, 2.5] },
        );
        // Card is much smaller than viewport, so scale clamps to max (2.5).
        expect(r.k).toBeCloseTo(2.5, 5);
    });

    it("clamps scale at min when content much larger than viewport", () => {
        const r = fitToView(
            cards([{ x: 0, y: 0, w: 4000, h: 3000 }]),
            { width: 400, height: 300 },
            { padding: 40, scaleExtent: [0.5, 2.5] },
        );
        expect(r.k).toBeCloseTo(0.5, 5);
    });

    it("centers content in viewport", () => {
        const r = fitToView(
            cards([{ x: 100, y: 100, w: 200, h: 200 }]),
            { width: 400, height: 400 },
            { padding: 0, scaleExtent: [0.1, 4] },
        );
        // 200x200 content fits 400x400 viewport at scale 2.
        expect(r.k).toBeCloseTo(2, 5);
        // Content top-left (100,100) must map to (0,0): translate by (-200,-200) then scale 2.
        // fitToView places (k*x + tx) at top-left 0 → tx = -k*minX, ty = -k*minY.
        expect(r.x).toBeCloseTo(-200, 5);
        expect(r.y).toBeCloseTo(-200, 5);
    });

    it("returns identity for empty cards", () => {
        const r = fitToView([], { width: 400, height: 300 }, { padding: 40, scaleExtent: [0.5, 2.5] });
        expect(r).toEqual({ x: 0, y: 0, k: 1 });
    });
});
