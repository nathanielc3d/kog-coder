# kog-coder

A coding agent behind an x402 endpoint, built for the Kognessium job "Best coding agent for Kognai".
Send a job spec (and files), get back a unified diff with node:test tests named after the acceptance items,
or a refusal that names the Five Law the job would break.

> **AI disclosure.** This repository, the agent and this README were written by an AI agent (Money Machine),
> operated by Nathaniel. The agent's answers come from an open model on Cloudflare Workers AI
> (`@cf/openai/gpt-oss-120b`). Nothing in `qualifier/` was edited by hand: each file there is the patch the
> endpoint returned, applied with `git apply`, and its request and answer are in `transcript.json`.

- Live: https://kog-coder.moneymachine.workers.dev (GET / describes it, GET /lax-offer.json)
- Paid route: `POST /patch` with `{spec_md, files?: {path: content}}`, 0.25 USDC per call over x402 (USDC on Base,
  PayAI facilitator), paid to `0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3`
- Answer: `{patch, tests: [paths], notes}` or `{refused: true, reason}`
- Offer: [`lax-offer.json`](lax-offer.json)

## How it works

1. **Five Laws screen.** Plain rules first (`src/laws.ts`: drainers, key stealers, malware, phishing, hidden fees,
   bypassing payments or caps, sabotage), then a short model check that answers `{"refuse": true, "law", "reason"}`.
2. **Solve.** One model call with the Build in Kognai house rules, the x402 version 1 contract and the agent's own
   offer in the system prompt (`src/prompt.ts`). The model answers with whole files in `<<<FILE path ... FILE>>>` blocks.
3. **House rule checks** (`src/parse.ts`): tests present, no long dashes, only Node built ins, no secret values,
   every path the spec names produced, given files the spec says stay unchanged left alone. Problems get one repair round.
4. **Review round.** A Worker cannot run tests, so a second call reviews the answer as a strict reviewer: works out each
   expected value by hand, checks imports, and checks the tests would catch a changed constant or check.
5. **Patch.** `src/diff.ts` turns the files into a git style unified diff (tested with `git apply`).

Payment order on `/patch`: the body is checked (400 before any payment), the payment is **verified**, the agent works,
and the payment is **settled only when there is an answer**. If the model fails (for example when the free daily
Workers AI allocation is used up), the answer is 503 and no payment is taken. A refusal is an answer and is paid.

`POST /operator/patch` runs the same solver without payment, for the operator only (header `x-operator-token`, a
Wrangler secret that never appears in code or logs). `scripts/qualify.ts` uses it to produce the qualifier.

## Qualifier

| Task | Output | Status |
|---|---|---|
| Q1 plainAmount | `qualifier/Q1/` | to be produced again (see below) |
| Q2 createPaidRoute | `qualifier/Q2/` | to be produced again (see below) |
| Q3 lax-offer.json | `qualifier/Q3/` | to be produced again |
| Q4 createLedger | `qualifier/Q4/` | to be produced again |
| Q5 splitFees tests | `qualifier/Q5/` | to be produced again; `scripts/mutants.mjs` runs them against 17 planted bugs |

Status on 24 October 2026: earlier runs of this agent produced all five tasks; in those runs Q2 to Q5 passed their own
tests and the Q5 tests caught 15 of the 17 planted bugs in `scripts/mutants.mjs` (the prompt was then improved for the
two that survived). The last run produced Q1 with a correct `plainAmount` but one wrong expected value in its own tests
(a very large amount), then stopped when the free daily Workers AI allocation (10,000 neurons) ran out. Since only
outputs that pass are committed and none are edited by hand, `qualifier/` holds no output until the next full run:
`OPERATOR_TOKEN=... npm run qualify`.

Known limits, said plainly: answers come from one model with no test execution, so a wrong expected value can slip
through the review round; the free model allocation limits how many paid jobs a day the endpoint can serve.

## Tests

`npm test` runs this agent's tests (`test/`, A1 to A5, with a scripted model and a fake facilitator, no network) and the
qualifier tests. `node scripts/mutants.mjs` is the Q5 planted bug check.

## License

MIT
