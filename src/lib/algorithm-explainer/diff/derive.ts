import type {
    AlgorithmDef,
    CardDef,
    CardId,
    Edge,
    SectionDef,
    TermId,
} from "../schema";
import { wordDiff } from "./word-diff";
import { atomDiff } from "./atom-diff";
import type {
    CardDescriptor,
    DiffEdge,
    DiffKind,
    SectionDescriptor,
} from "./types";

export function deriveDiff(
    base: AlgorithmDef,
    compare: AlgorithmDef | null,
    visible: Set<CardId>,
): { cards: CardDescriptor[]; edges: DiffEdge[] } {
    const baseMap = new Map(base.cards.map((c) => [c.id, c]));
    const compareMap = new Map(compare ? compare.cards.map((c) => [c.id, c]) : []);

    const cards: CardDescriptor[] = [];
    for (const id of visible) {
        const b = baseMap.get(id);
        const c = compareMap.get(id);
        if (!b && !c) continue;
        cards.push(buildCardDescriptor(id, b, c, compare !== null));
    }

    const edges = buildEdges(base, compare, visible);
    return { cards, edges };
}

function buildCardDescriptor(
    id: CardId,
    base: CardDef | undefined,
    compare: CardDef | undefined,
    diffActive: boolean,
): CardDescriptor {
    const kind: DiffKind = !diffActive
        ? "shared"
        : base && compare
          ? "shared"
          : base
            ? "base-only"
            : "compare-only";
    const src = base ?? compare!;
    // Diff inactive: pass base content through (or compare if base is absent).
    const effective = base ?? compare!;
    const title = diffActive
        ? wordDiff(base?.title ?? "", compare?.title ?? "")
        : asSharedWords(effective.title);
    const description = diffActive
        ? base?.description || compare?.description
            ? wordDiff(base?.description ?? "", compare?.description ?? "")
            : undefined
        : effective.description
          ? asSharedWords(effective.description)
          : undefined;
    const sections = diffActive
        ? buildSections(base?.sections ?? [], compare?.sections ?? [])
        : effective.sections.map(asSharedSection);
    const tooltipTerms = new Set<TermId>();
    for (const c of [base, compare]) {
        if (!c?.terms) continue;
        for (const [termId, spawn] of Object.entries(c.terms)) {
            if (spawn.tooltip) tooltipTerms.add(termId);
        }
    }
    return {
        id,
        kind,
        position: src.position,
        title,
        description,
        sections,
        sourceCardIds: { base: base?.id, compare: compare?.id },
        header: base?.header ?? compare?.header,
        tooltipTerms,
    };
}

function asSharedWords(s: string): { text: string; kind: "shared"; bold?: boolean }[] {
    if (!s) return [];
    // Split out **...** markdown bold so the bold flag is preserved as metadata.
    const parts = s.split(/\*\*(.+?)\*\*/g);
    return parts
        .map((t, i) => ({ text: t, kind: "shared" as const, bold: i % 2 === 1 }))
        .filter((p) => p.text.length > 0);
}

function asSharedSection(s: SectionDef): SectionDescriptor {
    return {
        id: s.id,
        label: s.label ? asSharedWords(s.label) : undefined,
        formula: { mode: "identical", katex: s.katex },
        opensCardId: s.opensCardId,
        header: s.header,
        termValues: s.termValues,
        compare: s.compare,
    };
}

function buildSections(
    base: SectionDef[],
    compare: SectionDef[],
): SectionDescriptor[] {
    const compareById = new Map<string, SectionDef>();
    const compareUnclaimed: SectionDef[] = [];
    for (const s of compare) {
        if (s.id) compareById.set(s.id, s);
        else compareUnclaimed.push(s);
    }
    const out: SectionDescriptor[] = [];
    let unclaimedCursor = 0;
    for (const b of base) {
        let c: SectionDef | undefined;
        if (b.id && compareById.has(b.id)) {
            c = compareById.get(b.id);
            compareById.delete(b.id);
        } else if (!b.id && unclaimedCursor < compareUnclaimed.length) {
            c = compareUnclaimed[unclaimedCursor++];
        }
        out.push(toSectionDescriptor(b, c));
    }
    for (const s of compareById.values()) out.push(toSectionDescriptor(undefined, s));
    while (unclaimedCursor < compareUnclaimed.length) {
        out.push(toSectionDescriptor(undefined, compareUnclaimed[unclaimedCursor++]));
    }
    return out;
}

function toSectionDescriptor(
    base: SectionDef | undefined,
    compare: SectionDef | undefined,
): SectionDescriptor {
    const id = base?.id ?? compare?.id;
    const label =
        base?.label || compare?.label
            ? wordDiff(base?.label ?? "", compare?.label ?? "")
            : undefined;
    const formula = atomDiff(base?.katex ?? "", compare?.katex ?? "");
    const opensCardId = base?.opensCardId ?? compare?.opensCardId;
    return {
        id,
        label,
        formula,
        opensCardId,
        header: base?.header ?? compare?.header,
        termValues: base?.termValues ?? compare?.termValues,
        compare: base?.compare ?? compare?.compare,
    };
}

function buildEdges(
    base: AlgorithmDef,
    compare: AlgorithmDef | null,
    visible: Set<CardId>,
): DiffEdge[] {
    const baseEdges = collectEdges(base, visible);
    if (!compare) {
        // Diff inactive: mark all edges as shared (neutral color).
        return baseEdges.map((e) => ({ ...e, kind: "shared" }));
    }
    const compareEdges = collectEdges(compare, visible);
    const keyOf = (e: Edge) =>
        `${e.fromCard}::${e.fromTermId}->${e.toCard}::${e.toSectionId ?? ""}`;
    const baseSet = new Set(baseEdges.map(keyOf));
    const compareSet = new Set(compareEdges.map(keyOf));
    const map = new Map<string, DiffEdge>();
    for (const e of baseEdges) {
        const k = keyOf(e);
        const kind: DiffKind = compareSet.has(k) ? "shared" : "base-only";
        map.set(k, { ...e, kind });
    }
    for (const e of compareEdges) {
        const k = keyOf(e);
        if (map.has(k)) continue;
        const kind: DiffKind = baseSet.has(k) ? "shared" : "compare-only";
        map.set(k, { ...e, kind });
    }
    return Array.from(map.values());
}

function collectEdges(def: AlgorithmDef, visible: Set<CardId>): Edge[] {
    const edges: Edge[] = [];
    for (const c of def.cards) {
        if (!visible.has(c.id) || !c.terms) continue;
        for (const [termId, link] of Object.entries(c.terms)) {
            if (!link.toCardId || !visible.has(link.toCardId)) continue;
            edges.push({
                fromCard: c.id,
                fromTermId: termId,
                toCard: link.toCardId,
                toSectionId: link.toSectionId,
            });
        }
    }
    return edges;
}
