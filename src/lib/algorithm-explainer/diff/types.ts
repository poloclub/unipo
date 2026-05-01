import type { CardId, CompareSpec, TermId, ValueSlot } from "../schema";

export type DiffKind = "shared" | "base-only" | "compare-only";

export interface WordSeg {
    text: string;
    kind: "shared" | "add" | "del";
    bold?: boolean;
}

export type FormulaDescriptor =
    | { mode: "identical"; katex: string }
    | { mode: "diff"; baseKatex: string; compareKatex: string };

export interface SectionDescriptor {
    id?: string;
    label?: WordSeg[];
    formula?: FormulaDescriptor;
    opensCardId?: CardId;
    header?: ValueSlot;
    termValues?: Record<TermId, ValueSlot>;
    compare?: CompareSpec;
}

export interface CardDescriptor {
    id: CardId;
    kind: DiffKind;
    position: { x: number; y: number };
    title: WordSeg[];
    description?: WordSeg[];
    sections: SectionDescriptor[];
    sourceCardIds: { base?: CardId; compare?: CardId };
    header?: ValueSlot;
    /** Set of term ids with a defined tooltip; these terms always show the solid box. */
    tooltipTerms?: Set<TermId>;
}

export interface DiffEdge {
    fromCard: CardId;
    fromTermId: TermId;
    toCard: CardId;
    toSectionId?: string;
    kind: DiffKind;
}
