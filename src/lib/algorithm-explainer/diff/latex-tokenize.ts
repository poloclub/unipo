/**
 * LaTeX → atom sequence. An atom is a rendering unit:
 *  - A single control sequence (\\name or \\<single-symbol>) plus any immediately
 *    following {...} args, absorbed.
 *  - A single non-control char (digit, letter, operator).
 *  - A {...} group (depth-matched).
 *  - A base above with _{...}/^{...} scripts attached.
 *
 * Equality is normalized string equality.
 */
export function tokenizeLatex(src: string): string[] {
    const atoms: string[] = [];
    let i = 0;
    const n = src.length;

    while (i < n) {
        if (/\s/.test(src[i])) {
            i++;
            continue;
        }
        const atomStart = i;
        let isControlSeq = false;

        if (src[i] === "\\") {
            isControlSeq = true;
            i++;
            if (i < n && /[a-zA-Z]/.test(src[i])) {
                const nameStart = i;
                while (i < n && /[a-zA-Z]/.test(src[i])) i++;
                const name = src.slice(nameStart, i);
                if (name === "begin") {
                    // Absorb \begin{env}...\end{env} as a single atom.
                    let j = i;
                    while (j < n && /\s/.test(src[j])) j++;
                    if (j < n && src[j] === "{") {
                        const envStart = j + 1;
                        const envEnd = skipGroup(src, j) - 1;
                        const envName = src.slice(envStart, envEnd);
                        i = envEnd + 1;
                        let depth = 1;
                        while (i < n && depth > 0) {
                            const beginIdx = src.indexOf(
                                `\\begin{${envName}}`,
                                i,
                            );
                            const endIdx = src.indexOf(
                                `\\end{${envName}}`,
                                i,
                            );
                            if (endIdx < 0) {
                                i = n;
                                break;
                            }
                            if (beginIdx >= 0 && beginIdx < endIdx) {
                                depth++;
                                i = beginIdx + `\\begin{${envName}}`.length;
                            } else {
                                depth--;
                                i = endIdx + `\\end{${envName}}`.length;
                            }
                        }
                        atoms.push(src.slice(atomStart, i));
                        continue;
                    }
                }
                if (name === "left") {
                    // Absorb \left<delim>...\right<delim> as a single atom, counting nested
                    // \left/\right depth. First advance i past the delimiter (next token).
                    while (i < n && /\s/.test(src[i])) i++;
                    if (i < n) {
                        if (src[i] === "\\") {
                            i++;
                            if (i < n && /[a-zA-Z]/.test(src[i])) {
                                while (i < n && /[a-zA-Z]/.test(src[i])) i++;
                            } else if (i < n) {
                                i++;
                            }
                        } else {
                            i++;
                        }
                    }
                    let depth = 1;
                    while (i < n && depth > 0) {
                        const leftIdx = src.indexOf("\\left", i);
                        const rightIdx = src.indexOf("\\right", i);
                        if (rightIdx < 0) {
                            i = n;
                            break;
                        }
                        if (leftIdx >= 0 && leftIdx < rightIdx) {
                            depth++;
                            i = leftIdx + "\\left".length;
                        } else {
                            depth--;
                            i = rightIdx + "\\right".length;
                            // Absorb the delimiter following \right.
                            while (i < n && /\s/.test(src[i])) i++;
                            if (i < n) {
                                if (src[i] === "\\") {
                                    i++;
                                    if (i < n && /[a-zA-Z]/.test(src[i])) {
                                        while (i < n && /[a-zA-Z]/.test(src[i])) i++;
                                    } else if (i < n) {
                                        i++;
                                    }
                                } else {
                                    i++;
                                }
                            }
                        }
                    }
                    atoms.push(src.slice(atomStart, i));
                    continue;
                }
            } else if (i < n) {
                i++;
            }
        } else if (src[i] === "{") {
            i = skipGroup(src, i);
        } else {
            i++;
        }

        if (isControlSeq) {
            while (true) {
                let j = i;
                while (j < n && /\s/.test(src[j])) j++;
                if (j < n && src[j] === "{") {
                    i = skipGroup(src, j);
                } else {
                    break;
                }
            }
        }

        while (true) {
            let j = i;
            while (j < n && /\s/.test(src[j])) j++;
            if (j >= n || (src[j] !== "_" && src[j] !== "^")) break;
            i = j + 1;
            while (i < n && /\s/.test(src[i])) i++;
            if (i >= n) break;
            if (src[i] === "\\") {
                i++;
                if (i < n && /[a-zA-Z]/.test(src[i])) {
                    while (i < n && /[a-zA-Z]/.test(src[i])) i++;
                } else if (i < n) {
                    i++;
                }
            } else if (src[i] === "{") {
                i = skipGroup(src, i);
            } else {
                i++;
            }
        }

        atoms.push(src.slice(atomStart, i));
    }
    return atoms;
}

function skipGroup(src: string, start: number): number {
    let i = start + 1;
    let depth = 1;
    const n = src.length;
    while (i < n && depth > 0) {
        if (src[i] === "\\") {
            i += 2;
            continue;
        }
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        i++;
    }
    return i;
}
