import type { AlgorithmDef } from "./schema";
import reinforceJson from "./algorithms/reinforce.json";
import ppoJson from "./algorithms/ppo.json";
import grpoJson from "./algorithms/grpo.json";
import dapoJson from "./algorithms/dapo.json";
import drgrpoJson from "./algorithms/drgrpo.json";

export function validateAlgorithmDef(def: AlgorithmDef): void {
    const ids = new Set<string>();
    for (const c of def.cards) {
        if (ids.has(c.id)) {
            throw new Error(`duplicate card id: ${c.id}`);
        }
        ids.add(c.id);
    }
    for (const visible of def.defaultVisibleCards) {
        if (!ids.has(visible)) {
            throw new Error(
                `defaultVisibleCards references missing card: ${visible}`,
            );
        }
    }
    for (const c of def.cards) {
        if (!c.terms) continue;
        for (const [termId, link] of Object.entries(c.terms)) {
            if (link.toCardId && !ids.has(link.toCardId)) {
                throw new Error(
                    `terms.${c.id}.${termId}.toCardId references missing card: ${link.toCardId}`,
                );
            }
        }
        for (const s of c.sections) {
            if (s.opensCardId && !ids.has(s.opensCardId)) {
                throw new Error(
                    `sections of ${c.id}: opensCardId references missing card: ${s.opensCardId}`,
                );
            }
        }
    }

    // Validate the bindings graph.
    if (def.bindings) {
        const bIds = Object.keys(def.bindings);
        for (const bId of bIds) {
            const b = def.bindings[bId];
            if ("compute" in b) {
                for (const input of b.inputs) {
                    if (!def.bindings[input]) {
                        throw new Error(
                            `bindings.${bId}.inputs references missing binding: ${input}`,
                        );
                    }
                }
            }
        }
        // Cycle detection (DFS with white/gray/black coloring).
        const WHITE = 0,
            GRAY = 1,
            BLACK = 2;
        const color = new Map<string, number>();
        const dfs = (id: string): void => {
            const c = color.get(id) ?? WHITE;
            if (c === BLACK) return;
            if (c === GRAY) {
                throw new Error(`bindings cycle detected at: ${id}`);
            }
            color.set(id, GRAY);
            const def2 = def.bindings![id];
            if ("compute" in def2) {
                for (const i of def2.inputs) dfs(i);
            }
            color.set(id, BLACK);
        };
        for (const bId of bIds) dfs(bId);
    }

    // Verify each slot's referenced binding exists.
    const checkSlot = (path: string, b: string) => {
        if (!def.bindings?.[b]) {
            throw new Error(`${path} references missing binding: ${b}`);
        }
    };
    for (const c of def.cards) {
        if (c.header) checkSlot(`cards.${c.id}.header`, c.header.binding);
        for (const s of c.sections) {
            const sid = s.id ?? "_";
            if (s.header)
                checkSlot(`sections.${c.id}.${sid}.header`, s.header.binding);
            if (s.termValues) {
                for (const [termId, slot] of Object.entries(s.termValues)) {
                    checkSlot(
                        `sections.${c.id}.${sid}.termValues.${termId}`,
                        slot.binding,
                    );
                }
            }
            if (s.compare) {
                checkSlot(
                    `sections.${c.id}.${sid}.compare`,
                    s.compare.binding,
                );
                for (const [winner, termId] of Object.entries(
                    s.compare.candidates,
                )) {
                    if (!s.termValues?.[termId]) {
                        throw new Error(
                            `sections.${c.id}.${sid}.compare.candidates.${winner} references missing termValues entry: ${termId}`,
                        );
                    }
                }
            }
        }
    }
}

// TS infers a union when termValues keys vary per card/section and refuses to assign to
// Record<string, ValueSlot>. JSON is inherently unknown, so cast via unknown.
const REINFORCE = reinforceJson as unknown as AlgorithmDef;
const PPO = ppoJson as unknown as AlgorithmDef;
const GRPO = grpoJson as unknown as AlgorithmDef;
const DAPO = dapoJson as unknown as AlgorithmDef;
const DRGRPO = drgrpoJson as unknown as AlgorithmDef;
validateAlgorithmDef(REINFORCE);
validateAlgorithmDef(PPO);
validateAlgorithmDef(GRPO);
validateAlgorithmDef(DAPO);
validateAlgorithmDef(DRGRPO);

export const ALGORITHMS: Record<string, AlgorithmDef> = {
    reinforce: REINFORCE,
    ppo: PPO,
    grpo: GRPO,
    dapo: DAPO,
    drgrpo: DRGRPO,
};

/**
 * Warn (in dev only) about cross-algorithm termId/cardId convention conflicts.
 * Silent in production.
 */
function validateConvention(): void {
    if (import.meta.env?.PROD) return;

    const termToCard = new Map<string, { algo: string; cardId: string }>();
    for (const [algoKey, def] of Object.entries(ALGORITHMS)) {
        for (const card of def.cards) {
            if (!card.terms) continue;
            for (const [termId, link] of Object.entries(card.terms)) {
                if (!link.toCardId) continue;
                const existing = termToCard.get(termId);
                if (!existing) {
                    termToCard.set(termId, {
                        algo: algoKey,
                        cardId: link.toCardId,
                    });
                } else if (existing.cardId !== link.toCardId) {
                    console.warn(
                        `[algorithm-explainer] termId convention conflict: '${termId}' ` +
                            `points to '${existing.cardId}' in ${existing.algo} but ` +
                            `'${link.toCardId}' in ${algoKey}.`,
                    );
                }
            }
        }
    }
}

validateConvention();

export function getAlgorithmDef(id: string): AlgorithmDef | null {
    return ALGORITHMS[id] ?? null;
}
