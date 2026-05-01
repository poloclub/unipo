import { describe, it, expect } from "vitest";
import { wordDiff } from "./word-diff";

describe("wordDiff", () => {
    it("returns all-shared when strings are identical", () => {
        const segs = wordDiff("hello world", "hello world");
        expect(segs.every((s) => s.kind === "shared")).toBe(true);
        expect(segs.map((s) => s.text).join("")).toBe("hello world");
    });

    it("marks added words as add", () => {
        const segs = wordDiff("hello world", "hello brave new world");
        const adds = segs.filter((s) => s.kind === "add" && s.text.trim());
        expect(adds.map((s) => s.text)).toEqual(
            expect.arrayContaining(["brave", "new"]),
        );
    });

    it("handles full removal", () => {
        const segs = wordDiff("a b c", "");
        expect(segs.every((s) => s.kind === "del")).toBe(true);
    });

    it("handles full addition", () => {
        const segs = wordDiff("", "a b c");
        expect(segs.every((s) => s.kind === "add")).toBe(true);
    });

    it("preserves both sides on swap", () => {
        const segs = wordDiff("a b", "a c");
        expect(segs.some((s) => s.kind === "del" && s.text === "b")).toBe(true);
        expect(segs.some((s) => s.kind === "add" && s.text === "c")).toBe(true);
    });
});
