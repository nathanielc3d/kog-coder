import type { Message, Model } from "../src/agent.ts";
import type { Facilitator } from "../src/types.ts";
export const SELF = { name: "Kog Coder test", endpoint: "https://example.test/patch", agent_did: "did:pkh:eip155:8453:0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3", price: "0.25", network: "base", payTo: "0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3", repo: "https://github.com/nathanielc3d/kog-coder" };

/** A scripted model: answers in order, records what it was asked. Law checks get {"refuse": false} unless scripted. */
export function scripted(answers: string[], lawAnswer = '{"refuse": false}') {
  const calls: Message[][] = [];
  const model: Model = async (messages) => {
    calls.push(messages);
    if (messages[0].content.startsWith("You screen coding jobs")) return lawAnswer;
    const a = answers.shift();
    if (a === undefined) throw new Error("model: no more scripted answers");
    return a;
  };
  return { model, calls };
}

export const GOOD = `<<<FILE src/add.ts
export function add(a: number, b: number): number { return a + b; }
FILE>>>
<<<FILE src/add.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { add } from "./add.ts";
test("A1 add", () => assert.equal(add(2, 3), 5));
FILE>>>
NOTES: Added add with a test.`;

export function fakeFacilitator(opts: { valid?: boolean; settle?: boolean } = {}) {
  const log: string[] = [];
  const f: Facilitator = {
    async verify() { log.push("verify"); return opts.valid === false ? { isValid: false, invalidReason: "insufficient_funds" } : { isValid: true, payer: "0x1111111111111111111111111111111111111111" }; },
    async settle() { log.push("settle"); return opts.settle === false ? { success: false, transaction: "", network: "base", errorReason: "settle_failed" } : { success: true, transaction: "0xabc", network: "base", payer: "0x1111111111111111111111111111111111111111" }; },
  } as Facilitator;
  return { f, log };
}

export const PAYMENT = Buffer.from(JSON.stringify({ x402Version: 1, scheme: "exact", network: "base", payload: { signature: "0x00", authorization: {} } })).toString("base64");
