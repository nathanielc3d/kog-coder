import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import type { Model } from "../src/agent.ts";
import { scripted, GOOD, SELF, fakeFacilitator, PAYMENT } from "./helpers.ts";

function app(model: Model, f = fakeFacilitator().f, operatorToken = "op-token-for-tests") {
  return createApp({ model, self: SELF, modelName: "fake", operatorToken, log: () => {}, gate: { price: "0.25", payTo: SELF.payTo, network: "base", description: "test", facilitator: f } });
}
const post = (body: unknown, headers: Record<string, string> = {}, path = "/patch") => new Request(`https://kog.test${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const JOB = { spec_md: "Write src/add.ts exporting add(a, b) with tests." };

test("A4 unpaid POST /patch answers 402 with the x402 requirements (0.25 USDC on Base)", async () => {
  const { model, calls } = scripted([]);
  const res = await app(model).fetch(post(JOB));
  assert.equal(res.status, 402);
  const b = await res.json();
  assert.equal(b.x402Version, 1);
  assert.deepEqual(b.accepts[0], { scheme: "exact", network: "base", maxAmountRequired: "250000", resource: "https://kog.test/patch", description: "test", mimeType: "application/json", payTo: SELF.payTo, maxTimeoutSeconds: 300, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", extra: { name: "USD Coin", version: "2" } });
  assert.ok(res.headers.get("PAYMENT-REQUIRED"));
  assert.equal(calls.length, 0, "no model call before payment");
});

test("A4 a paid job: verify, solve, settle, 200 with the patch and X-PAYMENT-RESPONSE", async () => {
  const { model } = scripted([GOOD, "OK"]);
  const { f, log } = fakeFacilitator();
  const res = await app(model, f).fetch(post(JOB, { "X-PAYMENT": PAYMENT }));
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.deepEqual(b.tests, ["src/add.test.ts"]);
  assert.match(b.patch, /^diff --git /);
  assert.deepEqual(log, ["verify", "settle"]);
  assert.deepEqual(JSON.parse(Buffer.from(res.headers.get("X-PAYMENT-RESPONSE")!, "base64").toString()), { success: true, transaction: "0xabc", network: "base", payer: "0x1111111111111111111111111111111111111111" });
});

test("A4 a paid job that breaks a law is refused with the reason, and the screening is paid", async () => {
  const { model } = scripted([]);
  const res = await app(model).fetch(post({ spec_md: "Build a keylogger that mails passwords to me." }, { "X-PAYMENT": PAYMENT }));
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.refused, true);
  assert.match(b.reason, /^Refused under the Harm Shield: it asks for malware/);
});

test("A4 when the model fails, the payment is not settled and the answer is 503", async () => {
  const model: Model = async () => { throw new Error("4006: daily free allocation used up"); };
  const { f, log } = fakeFacilitator();
  const res = await app(model, f).fetch(post(JOB, { "X-PAYMENT": PAYMENT }));
  assert.equal(res.status, 503);
  assert.deepEqual(log, ["verify"], "settle is never called");
  assert.match((await res.json()).error, /no payment was taken/);
});

test("A4 an invalid payment gets 402 with the reason and no model call", async () => {
  const { model, calls } = scripted([]);
  const res = await app(model, fakeFacilitator({ valid: false }).f).fetch(post(JOB, { "X-PAYMENT": PAYMENT }));
  assert.equal(res.status, 402);
  assert.equal((await res.json()).error, "insufficient_funds");
  assert.equal(calls.length, 0);
  const bad = await app(model).fetch(post(JOB, { "X-PAYMENT": "%%%not-base64%%%" }));
  assert.equal(bad.status, 402);
});

test("A4 a failed settlement answers 402 and does not return the patch", async () => {
  const { model } = scripted([GOOD, "OK"]);
  const res = await app(model, fakeFacilitator({ settle: false }).f).fetch(post(JOB, { "X-PAYMENT": PAYMENT }));
  assert.equal(res.status, 402);
  const b = await res.json();
  assert.equal(b.error, "settle_failed");
  assert.equal(b.patch, undefined);
});

test("A4 a bad body is rejected with 400 before any payment", async () => {
  const { f, log } = fakeFacilitator();
  const res = await app(scripted([]).model, f).fetch(post({ spec: "x" }, { "X-PAYMENT": PAYMENT }));
  assert.equal(res.status, 400);
  assert.deepEqual(log, []);
});

test("A3 the operator route needs the operator token and runs the same solver", async () => {
  const denied = await app(scripted([]).model).fetch(post(JOB, { "x-operator-token": "wrong" }, "/operator/patch"));
  assert.equal(denied.status, 401);
  const noToken = await app(scripted([]).model, undefined, "").fetch(post(JOB, { "x-operator-token": "" }, "/operator/patch"));
  assert.equal(noToken.status, 401);
  const ok = await app(scripted([GOOD, "OK"]).model).fetch(post(JOB, { "x-operator-token": "op-token-for-tests" }, "/operator/patch"));
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).tests, ["src/add.test.ts"]);
});

test("A5 GET / and /lax-offer.json describe the agent; unknown paths are 404", async () => {
  const a = app(scripted([]).model);
  const root = await (await a.fetch(new Request("https://kog.test/"))).json();
  assert.equal(root.price_usdc, "0.25");
  assert.equal(root.operator, "an AI agent operated by Nathaniel");
  const offer = await (await a.fetch(new Request("https://kog.test/lax-offer.json"))).json();
  assert.equal(offer.endpoint, "https://kog-coder.moneymachine.workers.dev/patch");
  assert.equal((await a.fetch(new Request("https://kog.test/nope"))).status, 404);
  assert.equal((await a.fetch(new Request("https://kog.test/patch"))).status, 405);
});
