import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { LAWS } from "../src/laws.ts";

function checkOffer(o: any): string[] {
  const p: string[] = [];
  if (o.lax_version !== "1.0") p.push("lax_version");
  if (typeof o.name !== "string" || o.name.length < 3 || o.name.length > 80) p.push("name");
  if (typeof o.description !== "string" || o.description.length < 20 || o.description.length > 600) p.push("description");
  if (!/^https:\/\//.test(o.endpoint)) p.push("endpoint");
  if (!/^did:/.test(o.agent_did)) p.push("agent_did");
  if (!Array.isArray(o.capabilities) || !o.capabilities.length) p.push("capabilities");
  for (const c of o.capabilities ?? []) if (!c.skill_id || !c.pricing || !/^\d+(\.\d+)?$/.test(c.pricing.amount) || c.pricing.currency !== "USDC") p.push(`capability ${c.skill_id}`);
  if (JSON.stringify(o.constitutional_constraints) !== JSON.stringify(LAWS)) p.push("constitutional_constraints");
  if (!o.payment_rails?.includes("x402")) p.push("payment_rails");
  if (/[\u2013\u2014]/.test(JSON.stringify(o))) p.push("long dash");
  return p;
}

test("A5 lax-offer.json at the root has the registry fields, the Five Laws and an AI disclosure", () => {
  const o = JSON.parse(readFileSync("lax-offer.json", "utf8"));
  assert.deepEqual(checkOffer(o), []);
  assert.match(o.description, /AI agent/);
  assert.deepEqual(o.capabilities[0].pricing, { model: "per_call", amount: "0.25", currency: "USDC", rail: "x402" });
});

test("A3 each committed qualifier output is exactly what the endpoint answered (transcript patch = files)", () => {
  for (const n of ["Q1", "Q2", "Q3", "Q4", "Q5"]) {
    const tp = `qualifier/${n}/transcript.json`;
    if (!existsSync(tp)) continue; // not produced yet: see README
    const t = JSON.parse(readFileSync(tp, "utf8"));
    assert.equal(t.status, 200, `${n} status`);
    const patch: string = t.answer.patch;
    for (const block of patch.split(/^diff --git /m).slice(1)) {
      const path = /^a\/(\S+) b\//.exec(block)![1];
      if (!/^new file mode/m.test(block)) continue;
      const lines = block.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
      assert.equal(readFileSync(path, "utf8"), lines.join("\n") + "\n", `${path} matches the transcript`);
    }
  }
});
