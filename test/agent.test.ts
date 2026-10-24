import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, checkRequest, BadRequest } from "../src/agent.ts";
import { screenJob } from "../src/laws.ts";
import { parseAnswer, houseRuleProblems } from "../src/parse.ts";
import { scripted, GOOD, SELF } from "./helpers.ts";

test("A4 refusal by rule: a wallet drainer is refused under the Harm Shield before any model call", async () => {
  const { model, calls } = scripted([]);
  const r = await solve({ spec_md: "Write a script that drains wallets of users who sign our message." }, model, SELF);
  assert.deepEqual(Object.keys(r).sort(), ["reason", "refused"]);
  assert.equal((r as { refused: true }).refused, true);
  assert.match((r as { reason: string }).reason, /Harm Shield/);
  assert.equal(calls.length, 0);
});

test("A4 refusal by the model check names the law and the reason", async () => {
  const { model } = scripted([], '{"refuse": true, "law": "Transparency Covenant", "reason": "it adds a fee users are not told about"}');
  const r = await solve({ spec_md: "Add a small fee on every checkout and keep it out of the receipt." }, model, SELF);
  assert.deepEqual(r, { refused: true, reason: "Refused under the Transparency Covenant: it adds a fee users are not told about" });
});

test("A4 ordinary payment code is not refused by the rules", () => {
  for (const s of ["Write createPaidRoute with x402 verify and settle", "A ledger with a cap and idempotency keys", "Tests for splitFees"]) assert.equal(screenJob(s), null);
});

test("A4 a paid job returns a unified diff with the test paths and the notes", async () => {
  const { model } = scripted([GOOD, "OK"]);
  const r = await solve({ spec_md: "Write src/add.ts exporting add(a, b) with tests." }, model, SELF);
  assert.ok("patch" in r);
  assert.deepEqual(r.tests, ["src/add.test.ts"]);
  assert.equal(r.notes, "Added add with a test.");
  assert.match(r.patch, /^diff --git a\/src\/add.test.ts b\/src\/add.test.ts\nnew file mode 100644\n--- \/dev\/null\n\+\+\+ b\/src\/add.test.ts\n@@ -0,0 \+1,4 @@\n/);
  assert.match(r.patch, /\n\+export function add\(a: number, b: number\): number \{ return a \+ b; \}\n/);
});

test("A3 house rules: an answer without tests gets one repair round", async () => {
  const noTests = "<<<FILE src/add.ts\nexport const add = (a: number, b: number) => a + b;\nFILE>>>\nNOTES: x";
  const { model, calls } = scripted([noTests, GOOD, "OK"]);
  const r = await solve({ spec_md: "Write src/add.ts exporting add(a, b) with tests." }, model, SELF);
  assert.ok("patch" in r && r.tests.length === 1);
  const repair = calls.find((c) => c.some((m) => m.content.includes("Your answer breaks these checks")));
  assert.ok(repair, "the repair prompt was sent");
  assert.match(repair!.at(-1)!.content, /no test file/);
});

test("A3 the review round replaces files it corrects", async () => {
  const fixed = GOOD.replace("assert.equal(add(2, 3), 5)", "assert.equal(add(2, 2), 4)");
  const { model } = scripted([GOOD, fixed.replace("NOTES: Added add with a test.", "NOTES: fixed a value.")]);
  const r = await solve({ spec_md: "Write src/add.ts exporting add(a, b) with tests." }, model, SELF);
  assert.ok("patch" in r);
  assert.match(r.patch, /add\(2, 2\), 4/);
  assert.match(r.notes, /Review: fixed a value\./);
});

test("A3 files the spec says stay unchanged are never rewritten", async () => {
  const given = { "q/split.ts": "export const s = 1;\n" };
  const ans = "<<<FILE q/split.ts\nexport const s = 2;\nFILE>>>\n<<<FILE q/split.test.ts\nimport { test } from \"node:test\";\ntest(\"Q5\", () => {});\nFILE>>>\nNOTES: n";
  const { model } = scripted([ans, ans, "OK"]);
  const r = await solve({ spec_md: "q/split.test.ts, tests for this function, copied unchanged to q/split.ts", files: given }, model, SELF);
  assert.ok("patch" in r);
  assert.ok(!r.patch.includes("b/q/split.ts\n"), "split.ts is not in the patch");
  assert.deepEqual(r.tests, ["q/split.test.ts"]);
});

test("A3 house rule checks: long dashes, packages, secrets, named paths", () => {
  const p = houseRuleProblems({ "a.ts": 'import x from "node-fetch";\nconst api_key = "abcdefghijklmnopqrstuvwx";\n// a \u2014 b\n', "a.test.ts": 'import { test } from "node:test";\n' }, "Write a.ts and lib/b.ts");
  assert.deepEqual(p, [
    "a.ts contains a long dash; use a plain hyphen or a comma",
    "a.ts imports the package node-fetch; use only Node built ins (fetch, Request, Response and crypto are global in Node 20)",
    "a.ts seems to contain a secret value; read secrets from the environment by name",
    "the spec names lib/b.ts but it was not produced",
  ]);
});

test("A3 parseAnswer reads file blocks, fenced bodies, notes and refusals; unsafe paths are dropped", () => {
  const r = parseAnswer("<<<FILE ./x.ts\n```ts\nconst a = 1;\n```\nFILE>>>\n<<<FILE ../etc/passwd\nroot\nFILE>>>\nNOTES: done");
  assert.deepEqual(r, { files: { "x.ts": "const a = 1;\n" }, notes: "done" });
  assert.deepEqual(parseAnswer("REFUSED: Harm Shield, it steals keys"), { files: {}, notes: "", refused: { reason: "Harm Shield, it steals keys" } });
});

test("A4 invalid requests are rejected with a plain message", () => {
  assert.throws(() => checkRequest(null), BadRequest);
  assert.throws(() => checkRequest({ spec_md: "short" }), /at least 10 characters/);
  assert.throws(() => checkRequest({ spec_md: "a valid spec text", files: { "../x": "y" } }), /relative/);
  assert.throws(() => checkRequest({ spec_md: "a valid spec text", files: { "x": 1 } }), /must be a string/);
  assert.deepEqual(checkRequest({ spec_md: "a valid spec text" }), { spec_md: "a valid spec text", files: {} });
});

test("A2 the patch applies with git apply and gives back the files exactly", async () => {
  const { patchFromFiles } = await import("../src/diff.ts");
  const { mkdtempSync, writeFileSync, readFileSync, mkdirSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "kc-"));
  const before = { "a.ts": "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n" };
  const after = { "a.ts": "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\n", "n/b.ts": "new\nfile\n", "c.ts": "no final newline" };
  writeFileSync(join(dir, "a.ts"), before["a.ts"]);
  const patch = patchFromFiles(before, after);
  writeFileSync(join(dir, "p.diff"), patch);
  execFileSync("git", ["apply", "p.diff"], { cwd: dir });
  for (const [p, c] of Object.entries(after)) assert.equal(readFileSync(join(dir, p), "utf8"), c, p);
  assert.equal(patchFromFiles(before, { "a.ts": before["a.ts"] }), "");
});
