// Mutation check for Q5: runs qualifier/Q5/split.test.ts against planted bugs in a temp copy of split.ts.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const orig = readFileSync("qualifier/Q5/split.ts", "utf8");
const muts = [
  ["total < 0n", "total < -1n"], ["total < 0n", "total <= 0n"], ["!shares.length || ", ""], ["!Number.isInteger(s) || ", ""], ["s < 0", "s < -1"], ["s < 0", "s <= 0"],
  ["!== 100", "> 100"], ["!== 100", "< 100"], ["(total * BigInt(s)) / 100n", "(total * BigInt(s)) / 101n"], ["(total * BigInt(s)) / 100n", "(total / 100n) * BigInt(s)"],
  ["out[0] +=", "out[out.length - 1] +="], ["out[0] += total - out.reduce((a, b) => a + b, 0n);", ""], ["total - out", "total + 1n - out"], ["(a, b) => a + b, 0)", "(a, b) => a + b, 1)"],
  ["throw new Error('negative total')", "return []"], ["throw new Error('bad shares')", "return []"], ["throw new Error('shares must sum to 100')", "return []"],
];
const dir = mkdtempSync(join(tmpdir(), "q5-"));
copyFileSync("qualifier/Q5/split.test.ts", join(dir, "split.test.ts"));
let caught = 0;
for (const [a, b] of muts) {
  if (!orig.includes(a)) { console.log("SKIP", a); continue; }
  writeFileSync(join(dir, "split.ts"), orig.replace(a, b));
  let failed = false;
  try { execFileSync(process.execPath, ["--import", "tsx", "--test", join(dir, "split.test.ts")], { stdio: "pipe", cwd: process.cwd() }); } catch { failed = true; }
  console.log(failed ? "caught  " : "SURVIVED", `${a} -> ${b}`); if (failed) caught++;
}
writeFileSync(join(dir, "split.ts"), orig);
let ok = true; try { execFileSync(process.execPath, ["--import", "tsx", "--test", join(dir, "split.test.ts")], { stdio: "pipe" }); } catch { ok = false; }
console.log(`original passes: ${ok}; caught ${caught}/${muts.length}`);
