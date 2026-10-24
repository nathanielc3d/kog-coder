// HTTP entry: GET / (about), GET /health, POST /patch (x402 paid), POST /operator/patch (operator token, same solver).
import { solve, checkRequest, BadRequest, type Model } from "./agent.ts";
import { verifyPayment, json, type GateConfig } from "./x402.ts";
import type { Self } from "./prompt.ts";
import { encodeB64Json } from "./rules.ts";

export interface AppDeps { model: Model; self: Self; gate: GateConfig; operatorToken?: string; modelName: string; log?: (event: Record<string, unknown>) => void }

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0; for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export function createApp(deps: AppDeps) {
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "X-PAYMENT, PAYMENT-SIGNATURE, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" } });
      if (path === "/health") return json({ ok: true });
      if (path === "/") return json({ name: deps.self.name, patch: `${url.origin}/patch`, method: "POST", body: "{spec_md, files?: {path: content}}", answer: "{patch, tests, notes} or {refused: true, reason}", price_usdc: deps.gate.price, network: deps.gate.network, payTo: deps.gate.payTo, model: deps.modelName, source: deps.self.repo, operator: "an AI agent operated by Nathaniel" });
      if (path === "/lax-offer.json") return json((await import("../lax-offer.json", { with: { type: "json" } })).default);
      const operator = path === "/operator/patch";
      if (path !== "/patch" && !operator) return json({ error: "not_found" }, 404);
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });

      // read and check the body before taking any payment
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "body must be JSON" }, 400); }
      let req;
      try { req = checkRequest(body); } catch (e) { if (e instanceof BadRequest) return json({ error: e.message }, 400); throw e; }

      // paid route: verify the payment, do the work, and settle only when there is an answer,
      // so nobody pays for a failure (for example when the free model allocation is used up)
      let settle: (() => Promise<import("./x402.ts").GateResult>) | null = null;
      if (operator) {
        const token = request.headers.get("x-operator-token") || "";
        if (!deps.operatorToken || !(await constantTimeEqual(token, deps.operatorToken))) return json({ error: "operator token required" }, 401);
      } else {
        const v = await verifyPayment(deps.gate, request, `${url.origin}/patch`);
        if (!v.verified) return v.response;
        settle = v.settle;
      }
      const started = Date.now();
      let result;
      try {
        result = await solve(req, deps.model, deps.self);
      } catch (e) {
        log({ event: "patch_failed", route: operator ? "operator" : "paid", error: String(e).slice(0, 200) });
        return json({ error: "the agent failed to produce an answer; no payment was taken", detail: String((e as Error)?.message ?? e).slice(0, 200) }, 503, { "retry-after": "3600" });
      }
      let settlement: Record<string, unknown> | null = null;
      if (settle) {
        const g = await settle();
        if (!g.paid) return g.response;
        settlement = g.settlement;
      }
      log({ event: "patch", route: operator ? "operator" : "paid", refused: "refused" in result, ms: Date.now() - started, tx: settlement?.transaction ?? null });
      const headers: Record<string, string> = settlement ? { "X-PAYMENT-RESPONSE": encodeB64Json(settlement), "PAYMENT-RESPONSE": encodeB64Json(settlement) } : {};
      return json({ ...result, model: deps.modelName, ...(settlement ? { payment: settlement } : {}) }, 200, headers);
    },
  };
}
