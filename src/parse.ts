// Reads the model answer: files in <<<FILE path ... FILE>>> blocks, then optional NOTES: text.

export interface Parsed { files: Record<string, string>; notes: string; refused?: { reason: string } }

const SAFE_PATH = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9_.\-/]+$/;

export function parseAnswer(text: string): Parsed {
  const t = String(text ?? "");
  const ref = /^\s*REFUSED:\s*(.+)$/im.exec(t);
  const files: Record<string, string> = {};
  const re = /<<<FILE[ \t]+([^\n]+?)[ \t]*\n([\s\S]*?)\n?FILE>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const path = m[1].trim().replace(/^\.\//, "");
    if (!SAFE_PATH.test(path)) continue;
    let body = m[2];
    // tolerate a fenced block inside the file block
    const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/.exec(body.trim() + "\n");
    if (fence) body = fence[1];
    files[path] = body.endsWith("\n") ? body : body + "\n";
  }
  const notes = (/NOTES:\s*([\s\S]*)$/i.exec(t.replace(/<<<FILE[\s\S]*?FILE>>>/g, ""))?.[1] ?? "").trim();
  if (ref && !Object.keys(files).length) return { files, notes, refused: { reason: ref[1].trim() } };
  return { files, notes };
}

export const isTestPath = (p: string) => /(\.test|\.spec)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)tests?\//.test(p);

const NODE_BUILTINS = new Set(["assert", "buffer", "child_process", "crypto", "events", "fs", "http", "https", "os", "path", "stream", "url", "util", "zlib", "test", "timers", "worker_threads", "string_decoder", "querystring", "readline", "net", "dns", "perf_hooks", "async_hooks"]);

/** House rule checks on what will be shipped. Returns plain problems, empty when fine. */
export function houseRuleProblems(files: Record<string, string>, spec: string, given: Record<string, string> = {}): string[] {
  const out: string[] = [];
  const paths = Object.keys(files);
  if (!paths.length) out.push("no file was produced");
  const codePaths = paths.filter((p) => /\.[cm]?[jt]sx?$/.test(p));
  if (codePaths.length && !codePaths.some(isTestPath)) out.push("no test file: every change ships with tests (name them after the acceptance items)");
  for (const p of Object.keys(given)) if (p in files && files[p] !== given[p] && /unchanged/i.test(spec)) out.push(`${p} was given and must stay unchanged`);
  for (const p of paths) {
    if (/[\u2013\u2014]/.test(files[p])) out.push(`${p} contains a long dash; use a plain hyphen or a comma`);
    for (const m of files[p].matchAll(/\bfrom\s+["']([^"'.\/][^"']*)["']|\bimport\(\s*["']([^"'.\/][^"']*)["']\s*\)|\brequire\(\s*["']([^"'.\/][^"']*)["']\s*\)/g)) {
      const spec = m[1] || m[2] || m[3];
      if (!spec.startsWith("node:") && !NODE_BUILTINS.has(spec.split("/")[0])) out.push(`${p} imports the package ${spec}; use only Node built ins (fetch, Request, Response and crypto are global in Node 20)`);
    }
    if (/(api[_-]?key|secret|private[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i.test(files[p])) out.push(`${p} seems to contain a secret value; read secrets from the environment by name`);
  }
  // paths named in the spec must be produced
  const named = [...new Set([...spec.matchAll(/\b((?:[\w.-]+\/)+[\w.-]+\.(?:ts|js|json|md))\b/g)].map((m) => m[1]))];
  for (const n of named) if (!(n in files) && !(n in given)) out.push(`the spec names ${n} but it was not produced`);
  return out;
}
