// Runs test/*.test.ts and every qualifier/Qn/*.test.ts that exists, with tsx.
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const files = readdirSync("test").filter((f) => f.endsWith(".test.ts")).map((f) => `test/${f}`);
if (existsSync("qualifier")) for (const q of readdirSync("qualifier").sort()) if (existsSync(`qualifier/${q}`) && !q.includes(".")) for (const f of readdirSync(`qualifier/${q}`)) if (f.endsWith(".test.ts")) files.push(`qualifier/${q}/${f}`);
const r = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
