import { tokenizeLatex } from "./latex-tokenize";
import type { FormulaDescriptor } from "./types";

/**
 * LCS diff between two LaTeX sources at the atom level. Matched atoms pass through;
 * unmatched atoms are wrapped in \htmlClass{diff-del|diff-add}.
 *
 * Compound atoms (\frac{a}{b}, \left( ... \right), \sum_{}^{} etc.) with matching outer
 * structure recurse into their inner content for finer-grained highlighting.
 *
 * \begin/\end environment blocks only diff at the outer level (no recursion) because
 * the env-specific tokens inside (\\, &) can't be wrapped without breaking KaTeX.
 */
export function atomDiff(base: string, compare: string): FormulaDescriptor {
    if (base === compare) {
        return { mode: "identical", katex: base };
    }
    const a = tokenizeLatex(base);
    const b = tokenizeLatex(compare);
    if (a.length === b.length && a.every((x, i) => x === b[i])) {
        return { mode: "identical", katex: base };
    }
    const ops = compressOps(buildOps(a, b));
    const baseParts: string[] = [];
    const compareParts: string[] = [];
    for (const op of ops) {
        switch (op.type) {
            case "match":
                baseParts.push(op.value);
                compareParts.push(op.value);
                break;
            case "delete":
                baseParts.push(
                    isSpacingAtom(op.value)
                        ? op.value
                        : wrap(op.value, "diff-del"),
                );
                break;
            case "insert":
                compareParts.push(
                    isSpacingAtom(op.value)
                        ? op.value
                        : wrap(op.value, "diff-add"),
                );
                break;
            case "modify": {
                const pair = diffPair(op.from, op.to);
                baseParts.push(pair.base);
                compareParts.push(pair.compare);
                break;
            }
        }
    }
    return {
        mode: "diff",
        baseKatex: baseParts.join(" "),
        compareKatex: compareParts.join(" "),
    };
}

type Op =
    | { type: "match"; value: string }
    | { type: "delete"; value: string }
    | { type: "insert"; value: string }
    | { type: "modify"; from: string; to: string };

function buildOps(a: string[], b: string[]): Op[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
        new Array(n + 1).fill(0),
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const ops: Op[] = [];
    let i = m,
        j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            ops.push({ type: "match", value: a[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            ops.push({ type: "insert", value: b[j - 1] });
            j--;
        } else {
            ops.push({ type: "delete", value: a[i - 1] });
            i--;
        }
    }
    return ops.reverse();
}

/** Pair adjacent delete+insert runs into 1:1 modify ops; leftover ops pass through. */
function compressOps(ops: Op[]): Op[] {
    const out: Op[] = [];
    let i = 0;
    while (i < ops.length) {
        if (ops[i].type !== "delete" && ops[i].type !== "insert") {
            out.push(ops[i]);
            i++;
            continue;
        }
        const dels: string[] = [];
        const adds: string[] = [];
        while (
            i < ops.length &&
            (ops[i].type === "delete" || ops[i].type === "insert")
        ) {
            const op = ops[i];
            if (op.type === "delete") dels.push(op.value);
            else if (op.type === "insert") adds.push(op.value);
            i++;
        }
        const pairs = Math.min(dels.length, adds.length);
        for (let k = 0; k < pairs; k++) {
            out.push({ type: "modify", from: dels[k], to: adds[k] });
        }
        for (let k = pairs; k < dels.length; k++) {
            out.push({ type: "delete", value: dels[k] });
        }
        for (let k = pairs; k < adds.length; k++) {
            out.push({ type: "insert", value: adds[k] });
        }
    }
    return out;
}

function wrap(atom: string, cls: string): string {
    return `\\htmlClass{${cls}}{${atom}}`;
}

/**
 * Spacing-only commands render as empty colored boxes when wrapped, so we preserve
 * them as-is and exclude from diff highlighting.
 */
const SPACING_ATOMS: ReadonlySet<string> = new Set([
    "\\,",
    "\\!",
    "\\:",
    "\\;",
    "\\ ",
    "\\quad",
    "\\qquad",
    "\\thinspace",
    "\\enspace",
    "\\medspace",
    "\\negthinspace",
    "\\negmedspace",
    "\\negthickspace",
    "~",
]);
function isSpacingAtom(atom: string): boolean {
    return SPACING_ATOMS.has(atom.trim());
}

interface ParsedCommand {
    kind: "command";
    name: string;
    args: string[];
    subscript?: string;
    superscript?: string;
}
interface ParsedLeftRight {
    kind: "left-right";
    openDelim: string;
    inner: string;
    closeDelim: string;
}
interface ParsedBeginEnd {
    kind: "begin-end";
    envName: string;
    inner: string;
}
type ParsedAtom = ParsedCommand | ParsedLeftRight | ParsedBeginEnd | null;

/**
 * Parse an atom string into its structural form. Returns null if unrecognized.
 */
function parseAtom(atom: string): ParsedAtom {
    const t = atom.trim();
    if (!t.startsWith("\\")) return null;

    // \begin{env}...\end{env}
    const beginMatch = /^\\begin\{([^}]+)\}/.exec(t);
    if (beginMatch) {
        const envName = beginMatch[1];
        const endTag = `\\end{${envName}}`;
        if (t.endsWith(endTag)) {
            const inner = t.slice(beginMatch[0].length, t.length - endTag.length);
            return { kind: "begin-end", envName, inner };
        }
    }

    // \left<delim>...\right<delim>
    if (t.startsWith("\\left")) {
        const afterLeft = t.slice("\\left".length).replace(/^\s+/, "");
        const openDelim = readDelimiter(afterLeft);
        if (openDelim) {
            // find matching \right (top-level, ignoring nested \left/\right)
            const innerStart = "\\left".length + (t.length - "\\left".length - afterLeft.length) + openDelim.length;
            const right = findMatchingRight(t, innerStart);
            if (right) {
                const inner = t.slice(innerStart, right.rightStart).trim();
                return {
                    kind: "left-right",
                    openDelim,
                    inner,
                    closeDelim: right.closeDelim,
                };
            }
        }
    }

    // \command{arg}{arg}..._{sub}^{sup}
    const cmdMatch = /^\\([a-zA-Z]+)/.exec(t);
    if (cmdMatch) {
        const name = cmdMatch[1];
        let i = cmdMatch[0].length;
        const args: string[] = [];
        while (i < t.length) {
            while (i < t.length && /\s/.test(t[i])) i++;
            if (i < t.length && t[i] === "{") {
                const end = findGroupEnd(t, i);
                args.push(t.slice(i + 1, end - 1));
                i = end;
            } else {
                break;
            }
        }
        let subscript: string | undefined;
        let superscript: string | undefined;
        while (i < t.length) {
            while (i < t.length && /\s/.test(t[i])) i++;
            if (i >= t.length) break;
            if (t[i] === "_" || t[i] === "^") {
                const isSub = t[i] === "_";
                i++;
                while (i < t.length && /\s/.test(t[i])) i++;
                if (i >= t.length) break;
                let body: string;
                if (t[i] === "{") {
                    const end = findGroupEnd(t, i);
                    body = t.slice(i + 1, end - 1);
                    i = end;
                } else if (t[i] === "\\") {
                    let j = i + 1;
                    if (j < t.length && /[a-zA-Z]/.test(t[j])) {
                        while (j < t.length && /[a-zA-Z]/.test(t[j])) j++;
                    } else if (j < t.length) {
                        j++;
                    }
                    body = t.slice(i, j);
                    i = j;
                } else {
                    body = t[i];
                    i++;
                }
                if (isSub) subscript = body;
                else superscript = body;
            } else {
                break;
            }
        }
        if (i !== t.length) return null; // leftover content → recognition failed
        return { kind: "command", name, args, subscript, superscript };
    }

    return null;
}

function readDelimiter(s: string): string | null {
    if (!s.length) return null;
    if (s[0] === "\\") {
        // control sequence delimiter: \{, \}, \langle, \rangle, etc.
        let j = 1;
        if (j < s.length && /[a-zA-Z]/.test(s[j])) {
            while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        } else if (j < s.length) {
            j++;
        }
        return s.slice(0, j);
    }
    return s[0];
}

function findGroupEnd(s: string, start: number): number {
    // s[start] === '{'. Returns index just after matching '}'.
    let i = start + 1;
    let depth = 1;
    while (i < s.length && depth > 0) {
        if (s[i] === "\\") {
            i += 2;
            continue;
        }
        if (s[i] === "{") depth++;
        else if (s[i] === "}") depth--;
        i++;
    }
    return i;
}

function findMatchingRight(
    s: string,
    from: number,
): { rightStart: number; closeDelim: string } | null {
    let i = from;
    let depth = 1;
    while (i < s.length) {
        if (s[i] === "\\") {
            // Compare possible prefixes.
            if (s.startsWith("\\left", i)) {
                depth++;
                i += "\\left".length;
                // skip delim
                const after = s.slice(i).replace(/^\s+/, "");
                const delim = readDelimiter(after);
                if (delim) {
                    i = i + (s.length - i - after.length) + delim.length;
                }
                continue;
            }
            if (s.startsWith("\\right", i)) {
                depth--;
                if (depth === 0) {
                    const rightStart = i;
                    let j = i + "\\right".length;
                    while (j < s.length && /\s/.test(s[j])) j++;
                    const after = s.slice(j);
                    const delim = readDelimiter(after);
                    if (!delim) return null;
                    return { rightStart, closeDelim: delim };
                }
                i += "\\right".length;
                const after = s.slice(i).replace(/^\s+/, "");
                const delim = readDelimiter(after);
                if (delim) {
                    i = i + (s.length - i - after.length) + delim.length;
                }
                continue;
            }
            i += 2;
            continue;
        }
        i++;
    }
    return null;
}

/**
 * Diff a paired atom: recurse when the outer structure matches; otherwise wholesale wrap.
 * \begin/\end environments do not recurse — wrapping inner \\, & would break KaTeX.
 */
function diffPair(a: string, b: string): { base: string; compare: string } {
    if (a === b) return { base: a, compare: b };
    const pa = parseAtom(a);
    const pb = parseAtom(b);

    if (pa && pb && pa.kind === pb.kind) {
        if (
            pa.kind === "command" &&
            pb.kind === "command" &&
            pa.name === pb.name &&
            pa.args.length === pb.args.length &&
            !!pa.subscript === !!pb.subscript &&
            !!pa.superscript === !!pb.superscript
        ) {
            const argDiffs = pa.args.map((arg, idx) =>
                diffInner(arg, pb.args[idx]),
            );
            const subDiff =
                pa.subscript !== undefined && pb.subscript !== undefined
                    ? diffInner(pa.subscript, pb.subscript)
                    : null;
            const supDiff =
                pa.superscript !== undefined && pb.superscript !== undefined
                    ? diffInner(pa.superscript, pb.superscript)
                    : null;
            const baseArgs = argDiffs.map((d) => `{${d.base}}`).join("");
            const compareArgs = argDiffs.map((d) => `{${d.compare}}`).join("");
            const baseScripts =
                (subDiff ? `_{${subDiff.base}}` : "") +
                (supDiff ? `^{${supDiff.base}}` : "");
            const compareScripts =
                (subDiff ? `_{${subDiff.compare}}` : "") +
                (supDiff ? `^{${supDiff.compare}}` : "");
            return {
                base: `\\${pa.name}${baseArgs}${baseScripts}`,
                compare: `\\${pb.name}${compareArgs}${compareScripts}`,
            };
        }
        if (
            pa.kind === "left-right" &&
            pb.kind === "left-right" &&
            pa.openDelim === pb.openDelim &&
            pa.closeDelim === pb.closeDelim
        ) {
            const inner = diffInner(pa.inner, pb.inner);
            return {
                base: `\\left${pa.openDelim} ${inner.base} \\right${pa.closeDelim}`,
                compare: `\\left${pb.openDelim} ${inner.compare} \\right${pb.closeDelim}`,
            };
        }
        if (
            pa.kind === "begin-end" &&
            pb.kind === "begin-end" &&
            pa.envName === pb.envName
        ) {
            // aligned/array-style: row-level LCS; differing rows get cell-wise wrap
            // (& and \\ are never wrapped).
            const inner = diffEnvInner(pa.inner, pb.inner);
            return {
                base: `\\begin{${pa.envName}} ${inner.base} \\end{${pa.envName}}`,
                compare: `\\begin{${pb.envName}} ${inner.compare} \\end{${pb.envName}}`,
            };
        }
    }

    return { base: wrap(a, "diff-del"), compare: wrap(b, "diff-add") };
}

function diffInner(a: string, b: string): { base: string; compare: string } {
    const desc = atomDiff(a, b);
    if (desc.mode === "identical") return { base: desc.katex, compare: desc.katex };
    return { base: desc.baseKatex, compare: desc.compareKatex };
}

/**
 * LCS rows (split by `\\`) of aligned/array-style env inner content. Identical rows pass
 * through; differing rows get cell-wise (`&`-split) wrap. `&` and `\\` are env tokens
 * and are never wrapped.
 */
function diffEnvInner(a: string, b: string): { base: string; compare: string } {
    const aRows = splitRows(a);
    const bRows = splitRows(b);
    const aKeys = aRows.map((r) => r.trim());
    const bKeys = bRows.map((r) => r.trim());
    const m = aKeys.length;
    const n = bKeys.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
        new Array(n + 1).fill(0),
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (aKeys[i - 1] === bKeys[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const baseRows: string[] = [];
    const compareRows: string[] = [];
    let i = m,
        j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && aKeys[i - 1] === bKeys[j - 1]) {
            baseRows.push(aRows[i - 1]);
            compareRows.push(bRows[j - 1]);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            compareRows.push(wrapRowCells(bRows[j - 1], "diff-add"));
            j--;
        } else {
            baseRows.push(wrapRowCells(aRows[i - 1], "diff-del"));
            i--;
        }
    }
    baseRows.reverse();
    compareRows.reverse();
    return {
        base: baseRows.join(" \\\\ "),
        compare: compareRows.join(" \\\\ "),
    };
}

function splitRows(s: string): string[] {
    // Split on `\\`. `\\` inside a `{}` group is protected (rarely occurs in current
    // content but safe).
    const rows: string[] = [];
    let start = 0;
    let depth = 0;
    let k = 0;
    while (k < s.length) {
        if (s[k] === "{") {
            depth++;
            k++;
            continue;
        }
        if (s[k] === "}") {
            depth--;
            k++;
            continue;
        }
        if (s[k] === "\\" && s[k + 1] === "\\" && depth === 0) {
            rows.push(s.slice(start, k));
            start = k + 2;
            k += 2;
            continue;
        }
        if (s[k] === "\\") {
            // skip escaped char or control sequence start
            k += 2;
            continue;
        }
        k++;
    }
    rows.push(s.slice(start));
    return rows;
}

function wrapRowCells(row: string, cls: string): string {
    const cells = splitCells(row);
    return cells
        .map((cell) => {
            const trimmed = cell.trim();
            if (!trimmed) return cell;
            return ` \\htmlClass{${cls}}{${trimmed}} `;
        })
        .join("&");
}

function splitCells(row: string): string[] {
    const cells: string[] = [];
    let start = 0;
    let depth = 0;
    let k = 0;
    while (k < row.length) {
        if (row[k] === "\\") {
            k += 2;
            continue;
        }
        if (row[k] === "{") {
            depth++;
            k++;
            continue;
        }
        if (row[k] === "}") {
            depth--;
            k++;
            continue;
        }
        if (row[k] === "&" && depth === 0) {
            cells.push(row.slice(start, k));
            start = k + 1;
        }
        k++;
    }
    cells.push(row.slice(start));
    return cells;
}
