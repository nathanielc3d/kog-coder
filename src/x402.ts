// x402 version 1 gate for one paid route (exact scheme, USDC). Adapted from our MIT x402-lax-starter.
import { httpFacilitator } from "./facilitator.ts";
import { USDC, USDC_DOMAIN, decodeB64Json, encodeB64Json, toAtomic } from "./rules.ts";
import type { Facilitator, Network, PaymentRequirements } from "./types.ts";

export interface GateConfig { price: string; payTo: string; network: Network; description: string; facilitator?: Facilitator }
export type Settlement = { success: true; transaction: string; network: string; payer?: string };
export type GateResult = { paid: true; settlement: Settlement } | { paid: false; response: Response };
/** verified: the payment is valid but not taken yet; call settle() only once the work is done. */
export type Verified = { verified: true; settle: () => Promise<GateResult> } | { verified: false; response: Response };

export const EXPOSE = "X-PAYMENT-RESPONSE, PAYMENT-RESPONSE, PAYMENT-REQUIRED";
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-expose-headers": EXPOSE, ...headers } });
}

export function requirements(cfg: GateConfig, resource: string): PaymentRequirements {
  const d = USDC_DOMAIN[cfg.network];
  return { scheme: "exact", network: cfg.network, maxAmountRequired: toAtomic(cfg.price), resource, description: cfg.description, mimeType: "application/json", payTo: cfg.payTo, maxTimeoutSeconds: 300, asset: USDC[cfg.network], extra: { name: d.name, version: d.version } };
}

export async function gate(cfg: GateConfig, request: Request, resource: string): Promise<GateResult> {
  const v = await verifyPayment(cfg, request, resource);
  return v.verified ? v.settle() : { paid: false, response: v.response };
}

export async function verifyPayment(cfg: GateConfig, request: Request, resource: string): Promise<Verified> {
  const req = requirements(cfg, resource);
  const deny = (error: string, extra: Record<string, string> = {}): { verified: false; paid: false; response: Response } => {
    const v2 = { x402Version: 2, error, resource: { url: resource, description: req.description, mimeType: req.mimeType }, accepts: [{ scheme: "exact", network: `eip155:${USDC_DOMAIN[cfg.network].chainId}`, amount: req.maxAmountRequired, asset: req.asset, payTo: req.payTo, maxTimeoutSeconds: req.maxTimeoutSeconds, extra: req.extra }] };
    return { verified: false, paid: false, response: json({ x402Version: 1, error, accepts: [req] }, 402, { "PAYMENT-REQUIRED": encodeB64Json(v2), ...extra }) };
  };
  const header = request.headers.get("X-PAYMENT") || request.headers.get("PAYMENT-SIGNATURE");
  if (!header) return deny("X-PAYMENT header is required");
  let payload: Record<string, unknown>;
  try { payload = decodeB64Json(header) as Record<string, unknown>; if (!payload || typeof payload !== "object") throw new Error(); }
  catch { return deny("X-PAYMENT is not base64 encoded JSON"); }
  const accepted = (payload.accepted as Record<string, unknown> | undefined) ?? payload;
  if (accepted.scheme !== undefined && accepted.scheme !== "exact") return deny("unsupported scheme, expected exact");
  if (accepted.network !== undefined && ![cfg.network, `eip155:${USDC_DOMAIN[cfg.network].chainId}`].includes(String(accepted.network))) return deny(`wrong network, expected ${cfg.network}`);
  const f = cfg.facilitator ?? httpFacilitator();
  const v = await f.verify(payload, req).catch((e) => ({ isValid: false, invalidReason: String(e), payer: undefined }));
  if (!v.isValid) return deny(v.invalidReason || "payment did not verify");
  return { verified: true, settle: async (): Promise<GateResult> => {
  const s = await f.settle(payload, req).catch((e) => ({ success: false, transaction: "", network: cfg.network, errorReason: String(e), payer: undefined }));
  if (!s.success) return deny(s.errorReason || "settlement failed", { "X-PAYMENT-RESPONSE": encodeB64Json({ success: false, transaction: s.transaction || "", network: s.network || cfg.network, errorReason: s.errorReason || "settlement failed" }) });
  return { paid: true, settlement: { success: true, transaction: s.transaction, network: s.network || cfg.network, payer: s.payer || v.payer } };
  } };
}
