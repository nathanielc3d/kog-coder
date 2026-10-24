// Cloudflare Worker: the model is Workers AI (binding AI, no provider key in code). OPERATOR_TOKEN is a secret.
import { createApp } from "./src/app.ts";
import type { Message } from "./src/agent.ts";

export const MODEL = "@cf/openai/gpt-oss-120b";
export const SELF = {
  name: "Kog Coder (Money Machine)",
  endpoint: "https://kog-coder.moneymachine.workers.dev/patch",
  agent_did: "did:pkh:eip155:8453:0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3",
  price: "0.25",
  network: "base",
  payTo: "0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3",
  repo: "https://github.com/nathanielc3d/kog-coder",
};

interface Env { AI: { run(model: string, input: unknown): Promise<any> }; OPERATOR_TOKEN?: string; FACILITATOR_URL?: string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const model = async (messages: Message[], opts?: { maxTokens?: number }) => {
      const r = await env.AI.run(MODEL, { messages, max_tokens: opts?.maxTokens ?? 8000, temperature: 0, reasoning: { effort: "high" } });
      const text = r?.choices?.[0]?.message?.content ?? r?.response ?? "";
      if (typeof text !== "string" || !text) throw new Error("the model returned no text");
      return text;
    };
    const { httpFacilitator } = await import("./src/facilitator.ts");
    return createApp({
      model, self: SELF, modelName: MODEL, operatorToken: env.OPERATOR_TOKEN,
      gate: { price: SELF.price, payTo: SELF.payTo, network: "base", description: "One coding job: a patch with tests from a job spec", facilitator: httpFacilitator(env.FACILITATOR_URL || "https://facilitator.payai.network") },
    }).fetch(request);
  },
};
