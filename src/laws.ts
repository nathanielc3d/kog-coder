// Five Laws screen, pure rules. A job that would break a law is refused before any model call, with the law named.
// The model makes a second, finer check (see agent.ts); these rules catch the plain cases cheaply and for certain.

export type Law = "Solidarity Oath" | "Renewal Mandate" | "Treasury Equilibrium" | "Harm Shield" | "Transparency Covenant";
export interface Refusal { refused: true; reason: string; law: Law }

interface Rule { law: Law; why: string; re: RegExp }

const RULES: Rule[] = [
  { law: "Harm Shield", why: "it asks for code that takes funds or keys from people who did not consent (a drainer, a seed or key stealer)", re: /\b(drain(er|s|ing)?\b.{0,40}\b(wallet|funds|tokens|users?)|(wallet|funds)\b.{0,30}\bdrain|steal(s|ing)?\b.{0,40}\b(seed|private keys?|mnemonic|funds|wallets?|credentials|passwords?|cookies|tokens)|(exfiltrat|harvest)\w*\b.{0,40}\b(seed|private keys?|mnemonic|credentials|passwords?|cookies))/i },
  { law: "Harm Shield", why: "it asks for malware (a keylogger, ransomware, a backdoor or a botnet)", re: /\b(keylogger|ransomware|backdoor|botnet|rootkit|cryptojack\w*|credential stuff\w*)\b/i },
  { law: "Harm Shield", why: "it asks for phishing or impersonation of a real service to deceive people", re: /\b(phishing|fake (login|sign.?in) page|clone of .{0,30}login|impersonat\w+ .{0,30}(bank|exchange|wallet|support))\b/i },
  { law: "Harm Shield", why: "it asks to attack systems or people (denial of service, doxxing, stalking)", re: /\b(ddos|denial of service attack|dox(x)?(ing)?|stalk(er|ing)?ware)\b/i },
  { law: "Harm Shield", why: "it asks for a rug pull, wash trading or market manipulation that harms buyers", re: /\b(rug ?pull|wash trad\w+|pump and dump|honeypot token|spoof(ing)? orders?)\b/i },
  { law: "Transparency Covenant", why: "it asks to hide spending, payments or actions from the people concerned (hidden fees, secret transfers, logs wiped)", re: /\b(hidden (fee|charge|transfer|payment)s?|secretly (send|transfer|charge|log|collect)\w*|without (the user|users|them) (knowing|noticing)|(delete|wipe|erase|disable) (the |all )?(audit )?logs?\b.{0,40}(hide|cover|so no one))/i },
  { law: "Transparency Covenant", why: "it asks to bypass or fake a payment or a mandate cap", re: /\b(bypass|skip|fake|forge)\w*\b.{0,30}\b(payment|x402|mandate|spending cap|paywall|signature verification)\b/i },
  { law: "Solidarity Oath", why: "it asks to sabotage or deceive another agent or citizen for one agent's gain", re: /\b(sabotage|poison)\w*\b.{0,40}\b(agent|citizen|peer|swarm|competitor|reviewer)s?\b/i },
  { law: "Treasury Equilibrium", why: "it asks to run up costs or debt with no cap (unbounded spending loops)", re: /\b(spend|pay|borrow)\w*\b.{0,30}\b(without (any )?(limit|cap)|unlimited(ly)?|no cap)\b/i },
];

/** Returns a refusal when a plain rule matches, else null. */
export function screenJob(spec: string): Refusal | null {
  const text = String(spec ?? "");
  for (const r of RULES) if (r.re.test(text)) return { refused: true, law: r.law, reason: `Refused under the ${r.law}: ${r.why}.` };
  return null;
}

export const LAWS: Law[] = ["Solidarity Oath", "Renewal Mandate", "Treasury Equilibrium", "Harm Shield", "Transparency Covenant"];
