// The solver: Five Laws screen, one model call for the files, house rule checks with one repair round,
// then a unified diff. The model is injected (Workers AI in production, a fake in tests).
import { screenJob, LAWS, type Law } from "./laws.ts";
import { parseAnswer, houseRuleProblems, isTestPath } from "./parse.ts";
import { patchFromFiles } from "./diff.ts";
import { systemPrompt, userPrompt, LAW_CHECK, type Self } from "./prompt.ts";

export interface Message { role: "system" | "user" | "assistant"; content: string }
export type Model = (messages: Message[], opts?: { maxTokens?: number }) => Promise<string>;

export interface PatchRequest { spec_md: string; files?: Record<string, string> }
export type PatchResult = { patch: string; tests: string[]; notes: string } | { refused: true; reason: string };

/** Hyphen look alikes (U+2010 to U+2012) become a plain hyphen; U+2212 is left alone, it can be meaningful. */
export const plainHyphens = (s: string) => s.replace(/[\u2010-\u2012]/g, "-").replace(/ [\u2013\u2014] /g, " - ");

export class BadRequest extends Error {}

export function checkRequest(body: unknown): PatchRequest {
  const b = body as PatchRequest;
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new BadRequest("body must be a JSON object {spec_md, files?}");
  if (typeof b.spec_md !== "string" || b.spec_md.trim().length < 10) throw new BadRequest("spec_md must be a string of at least 10 characters");
  if (b.spec_md.length > 40000) throw new BadRequest("spec_md is longer than 40000 characters");
  if (b.files !== undefined) {
    if (!b.files || typeof b.files !== "object" || Array.isArray(b.files)) throw new BadRequest("files must be an object {path: content}");
    const entries = Object.entries(b.files);
    if (entries.length > 40) throw new BadRequest("at most 40 files");
    let size = 0;
    for (const [p, c] of entries) {
      if (typeof c !== "string") throw new BadRequest(`files["${p}"] must be a string`);
      if (p.startsWith("/") || p.includes("..")) throw new BadRequest(`file path ${p} must be relative, without ..`);
      size += c.length;
    }
    if (size > 120000) throw new BadRequest("files are larger than 120000 characters in total");
  }
  return { spec_md: b.spec_md, files: b.files ?? {} };
}

async function lawCheck(model: Model, spec: string): Promise<{ law: Law; reason: string } | null> {
  const ans = await model([{ role: "system", content: LAW_CHECK }, { role: "user", content: spec.slice(0, 12000) }], { maxTokens: 400 });
  const m = /\{[\s\S]*\}/.exec(ans);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (j.refuse === true) {
      const law = (LAWS as string[]).includes(j.law) ? (j.law as Law) : "Harm Shield";
      return { law, reason: String(j.reason || "the job would cause harm").slice(0, 300) };
    }
  } catch { /* not JSON: no refusal */ }
  return null;
}

export async function solve(req: PatchRequest, model: Model, self: Self): Promise<PatchResult> {
  const files = req.files ?? {};
  const ruled = screenJob(req.spec_md);
  if (ruled) return { refused: true, reason: ruled.reason };
  const judged = await lawCheck(model, req.spec_md);
  if (judged) return { refused: true, reason: `Refused under the ${judged.law}: ${judged.reason}` };

  const messages: Message[] = [{ role: "system", content: systemPrompt(self) }, { role: "user", content: userPrompt(req.spec_md, files) }];
  let answer = await model(messages, { maxTokens: 12000 });
  let parsed = parseAnswer(answer);
  if (parsed.refused) return { refused: true, reason: parsed.refused.reason };
  let problems = houseRuleProblems(parsed.files, req.spec_md, files);
  if (problems.length) {
    // one repair round: the model sees its answer and the problems, and answers again in full
    messages.push({ role: "assistant", content: answer }, { role: "user", content: `Your answer breaks these checks:\n- ${problems.join("\n- ")}\nAnswer again with every file in full, same format.` });
    answer = await model(messages, { maxTokens: 12000 });
    const again = parseAnswer(answer);
    if (Object.keys(again.files).length) { parsed = again; problems = houseRuleProblems(parsed.files, req.spec_md, files); }
  }
  // review round: the model checks every expected value in the tests against the spec and the code,
  // since a Worker cannot run the tests itself
  if (Object.keys(parsed.files).length) {
    const shown = Object.entries(parsed.files).map(([p, c]) => `<<<FILE ${p}\n${c}\nFILE>>>`).join("\n");
    const review = await model([
      { role: "system", content: systemPrompt(self) },
      { role: "user", content: `${userPrompt(req.spec_md, files)}\n\nA first answer:\n${shown}\n\nReview it as a strict reviewer who will run the tests. For every assertion, work out the expected value by hand from the spec, digit by digit, and check the code produces it. Check imports resolve (only Node built ins and the given files), that every test would pass on this code, and that the tests would fail if any constant, comparison, branch or check in the code were changed. If everything is right, answer only: OK. Otherwise answer with the corrected files in full in the same format, then NOTES: what you fixed.` },
    ], { maxTokens: 12000 });
    if (!/^\s*OK\s*\.?\s*$/i.test(review)) {
      const fixed = parseAnswer(review);
      if (Object.keys(fixed.files).length) {
        const merged = { ...parsed.files, ...fixed.files };
        const p2 = houseRuleProblems(merged, req.spec_md, files);
        if (p2.length <= problems.length) { parsed = { files: merged, notes: [parsed.notes, fixed.notes && `Review: ${fixed.notes}`].filter(Boolean).join(" ") }; problems = p2; }
      }
    }
  }
  // never ship changes to given files the spec says to keep unchanged
  const out: Record<string, string> = {};
  for (const [p, c] of Object.entries(parsed.files)) if (!(p in files && /unchanged/i.test(req.spec_md))) out[p] = plainHyphens(c);
  const patch = patchFromFiles(files, out);
  const tests = Object.keys(out).filter(isTestPath).sort();
  const notes = plainHyphens([parsed.notes || "Done.", problems.length ? `Open checks: ${problems.join("; ")}.` : ""].filter(Boolean).join(" ")).replace(/[\u2013\u2014]/g, ",");
  return { patch, tests, notes };
}
