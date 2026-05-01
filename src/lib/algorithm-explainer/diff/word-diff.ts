import type { WordSeg } from "./types";

/**
 * Word-level LCS. A token is a run of whitespace or a run of non-whitespace.
 * Whitespace tokens participate in LCS matching just like regular tokens.
 */
export function wordDiff(base: string, compare: string): WordSeg[] {
    // Strip **...** markdown bold markers before diffing — in diff mode we lose bold,
    // and we don't want raw markers to leak into the rendered output.
    const a = tokenize(stripBold(base));
    const b = tokenize(stripBold(compare));
    const dp = lcsTable(a, b);
    return walkDiff(a, b, dp);
}

function stripBold(s: string): string {
    return s.replace(/\*\*/g, "");
}

function tokenize(s: string): string[] {
    if (!s) return [];
    return s.match(/\s+|\S+/g) ?? [];
}

function lcsTable(a: string[], b: string[]): number[][] {
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
    return dp;
}

function walkDiff(a: string[], b: string[], dp: number[][]): WordSeg[] {
    const out: WordSeg[] = [];
    let i = a.length;
    let j = b.length;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            out.push({ text: a[i - 1], kind: "shared" });
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            out.push({ text: a[i - 1], kind: "del" });
            i--;
        } else {
            out.push({ text: b[j - 1], kind: "add" });
            j--;
        }
    }
    while (i > 0) {
        out.push({ text: a[i - 1], kind: "del" });
        i--;
    }
    while (j > 0) {
        out.push({ text: b[j - 1], kind: "add" });
        j--;
    }
    return out.reverse();
}
