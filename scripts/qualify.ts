// Runs the five qualifier tasks against the live endpoint (operator route, same solver as the paid route),
// saves qualifier/Qn/transcript.json (request and answer verbatim) and applies each patch with git apply.
// Usage: OPERATOR_TOKEN=... tsx scripts/qualify.ts [Q1 Q2 ...]   (the token is read from the environment only)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ENDPOINT = process.env.KOG_CODER_URL || "https://kog-coder.moneymachine.workers.dev";
const token = process.env.OPERATOR_TOKEN;
if (!token) throw new Error("set OPERATOR_TOKEN in the environment");

const HEAD = (n: string) => `Task ${n} of the Kognai coding agent qualifier. Conventions: TypeScript (ES modules, Node 20), tests with node:test run by tsx, all files under qualifier/${n}/, tests in qualifier/${n}/*.test.ts named after the task (${n}).\n\n`;
const tasks: Record<string, { spec: string; files?: Record<string, string> }> = JSON.parse(readFileSync("scripts/tasks.json", "utf8"));

const pick = process.argv.slice(2);
for (const [n, t] of Object.entries(tasks)) {
  if (pick.length && !pick.includes(n)) continue;
  const request = { spec_md: HEAD(n) + t.spec, ...(t.files ? { files: t.files } : {}) };
  const started = new Date();
  const res = await fetch(`${ENDPOINT}/operator/patch`, { method: "POST", headers: { "content-type": "application/json", "x-operator-token": token }, body: JSON.stringify(request) });
  const answer = await res.json();
  const dir = `qualifier/${n}`;
  mkdirSync(dir, { recursive: true });
  const transcript = { task: n, endpoint: `${ENDPOINT}/patch`, called: `${ENDPOINT}/operator/patch`, note: "operator route: same solver as POST /patch, without the x402 payment", at: started.toISOString(), seconds: Math.round((Date.now() - started.getTime()) / 1000), status: res.status, request, answer };
  writeFileSync(`${dir}/transcript.json`, JSON.stringify(transcript, null, 2) + "\n");
  console.log(n, res.status, answer.refused ? "refused" : `tests=${JSON.stringify(answer.tests)}`, (answer.notes || answer.error || "").slice(0, 300));
  if (answer.patch) {
    writeFileSync(`/tmp/${n}.patch`, answer.patch);
    try { execFileSync("git", ["apply", "--whitespace=nowarn", `/tmp/${n}.patch`], { stdio: "inherit" }); console.log(n, "patch applied"); }
    catch { console.log(n, "git apply failed"); }
  }
}
