export type CardId = string;
export type TermId = string;
export type BindingId = string;

export interface AlgorithmDef {
    id: string;
    name: string;
    title: string;
    defaultVisibleCards: CardId[];
    bindings?: Record<BindingId, BindingDef>;
    cards: CardDef[];
}

export type BindingDef =
    | { from: string }
    | { compute: ComputeKind; inputs: BindingId[] };

export type ComputeKind =
    | "exp"
    | "log"
    | "neg"
    | "neg_mul"
    | "add"
    | "sub"
    | "mul"
    | "div"
    | "clip_mul"
    | "min"
    | "max"
    | "min_winner"
    | "array_mean"
    | "array_std";

export interface CardDef {
    id: CardId;
    title: string;
    position: { x: number; y: number };
    size?: { w: number; h?: number };
    sections: SectionDef[];
    terms?: Record<TermId, TermSpawn>;
    description?: string;
    header?: ValueSlot;
}

export interface SectionDef {
    id?: string;
    label?: string;
    katex: string;
    opensCardId?: CardId;
    header?: ValueSlot;
    termValues?: Record<TermId, ValueSlot>;
    compare?: CompareSpec;
}

export interface TermSpawn {
    toCardId?: CardId;
    toSectionId?: string;
    tooltip?: string;
}

export interface ValueSlot {
    binding: BindingId;
    position?: "above" | "below" | "inline" | "replace";
    format?: "decimal:2" | "decimal:3" | "decimal:4" | "sigfig:3" | "string";
    style?: "default" | "heatmap";
}

export interface CompareSpec {
    binding: BindingId;
    candidates: Record<string, TermId>;
    marker: "check";
}

export interface Edge {
    fromCard: CardId;
    fromTermId: TermId;
    toCard: CardId;
    toSectionId?: string;
}
