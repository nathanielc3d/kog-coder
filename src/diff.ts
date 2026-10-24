// Unified diff from file contents (LCS on lines, 3 lines of context). Pure, no dependencies.

const splitLines = (s: string): string[] => {
  if (s === "") return [];
  const lines = s.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop(); // the final newline ends the last line, it is not a line
  return lines;
};

interface Op { t: " " | "-" | "+"; line: string }

function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: " ", line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: "-", line: a[i++] });
    else ops.push({ t: "+", line: b[j++] });
  }
  while (i < n) ops.push({ t: "-", line: a[i++] });
  while (j < m) ops.push({ t: "+", line: b[j++] });
  return ops;
}

/** git style unified diff of one file; "" when nothing changed. `before` null means a new file. */
export function fileDiff(path: string, before: string | null, after: string, context = 3): string {
  if (before === after) return "";
  const a = before == null ? [] : splitLines(before), b = splitLines(after);
  const ops = lcsOps(a, b);
  const header = [`diff --git a/${path} b/${path}`];
  if (before == null) header.push("new file mode 100644", "--- /dev/null"); else header.push(`--- a/${path}`);
  header.push(`+++ b/${path}`);
  // group into hunks
  const hunks: string[] = [];
  let k = 0;
  const posA: number[] = [], posB: number[] = [];
  let ia = 0, ib = 0;
  for (const op of ops) { posA.push(ia); posB.push(ib); if (op.t !== "+") ia++; if (op.t !== "-") ib++; }
  while (k < ops.length) {
    while (k < ops.length && ops[k].t === " ") k++;
    if (k >= ops.length) break;
    let start = Math.max(0, k - context), end = k;
    // extend while changes are within 2*context of each other
    while (end < ops.length) {
      if (ops[end].t !== " ") { end++; continue; }
      let run = end; while (run < ops.length && ops[run].t === " ") run++;
      if (run >= ops.length || run - end > 2 * context) { end = Math.min(ops.length, end + context); break; }
      end = run;
    }
    const slice = ops.slice(start, end);
    const aLen = slice.filter((o) => o.t !== "+").length, bLen = slice.filter((o) => o.t !== "-").length;
    const aStart = aLen ? posA[start] + 1 : posA[start], bStart = bLen ? posB[start] + 1 : posB[start];
    hunks.push(`@@ -${aStart},${aLen} +${bStart},${bLen} @@`);
    for (const o of slice) hunks.push(o.t + o.line);
    k = end;
  }
  const noEol = after !== "" && !after.endsWith("\n") ? ["\\ No newline at end of file"] : [];
  return [...header, ...hunks, ...noEol].join("\n") + "\n";
}

/** Patch for every file in `after` compared with `before` (missing in before = new file). */
export function patchFromFiles(before: Record<string, string>, after: Record<string, string>): string {
  return Object.keys(after).sort().map((p) => fileDiff(p, p in before ? before[p] : null, after[p])).join("");
}
