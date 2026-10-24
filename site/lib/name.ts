// Theme names, problem statements and claims from the model. The model only sees sample sentences and review IDs;
// every number shown next to a theme is computed in code (size.ts), and every claim is checked (verify.ts).
import { ProviderError, type Message } from "./llm";
import type { Claim } from "./verify";

export const MAX_CLAIMS = 3;

export type Sample = { id: string; text: string };
export type Naming = { name: string; problem: string; actionable: boolean; claims: Claim[] };
export type Ask = (messages: Message[]) => Promise<string>; // sends messages, returns the reply text

const SYSTEM = `You name one theme found in customer feedback. You get sentences from that theme, each with the ID of the review it comes from.
Reply with JSON only, in this shape:
{"name": "a short theme name, at most 6 words",
 "problem": "one line stating the customer's problem",
 "actionable": true or false (false if the theme is praise, thanks or filler with no problem to act on),
 "claims": [up to ${MAX_CLAIMS} of {"claim": "one sentence about what customers say", "evidence": [{"review": "the review ID, e.g. r12", "quote": "words copied exactly from that review's sentence"}]}]}
Copy every quote character for character from the sentences given. Do not state numbers or percentages.`;

export function namingPrompt(samples: Sample[]): Message[] {
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: samples.map((s) => `${s.id}: ${s.text}`).join("\n") },
  ];
}

const isString = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

// The reply is untrusted: anything that is not the expected shape is rejected rather than shown.
export function parseNaming(text: string): Naming {
  const data = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); // some models wrap JSON in a fence
  if (!isString(data?.name) || !isString(data.problem) || typeof data.actionable !== "boolean" || !Array.isArray(data.claims))
    throw new Error("The reply is missing a name, problem, actionable flag or claims.");
  const claims = data.claims.slice(0, MAX_CLAIMS).map((c: unknown) => {
    const { claim, evidence } = (c ?? {}) as Record<string, unknown>;
    if (!isString(claim) || !Array.isArray(evidence)) throw new Error("A claim has no text or no evidence list.");
    return {
      claim,
      evidence: evidence.map((e) => {
        const { review, quote } = (e ?? {}) as Record<string, unknown>;
        if (!isString(review) || typeof quote !== "string") throw new Error("A piece of evidence has no review ID or quote.");
        return { review, quote };
      }),
    };
  });
  return { name: data.name.trim().slice(0, 80), problem: data.problem.trim(), actionable: data.actionable, claims };
}

// Names every theme not already in the cache, one call at a time. A provider error (bad key, used-up quota)
// stops the run, since later calls would fail the same way; names already fetched stay in the cache.
// A malformed reply is asked again once; if it is still malformed, only that theme fails, and the start of
// the reply is kept in the message so the cause can be seen.
export async function nameThemes(
  themes: { key: string; samples: Sample[] }[],
  cache: Map<string, Naming>,
  ask: Ask,
  onProgress?: (done: number, total: number) => void,
) {
  const todo = themes.filter((t) => !cache.has(t.key));
  const failed = new Map<string, string>();
  for (const [i, t] of todo.entries()) {
    onProgress?.(i, todo.length);
    const prompt = namingPrompt(t.samples);
    let reply = "";
    try {
      reply = await ask(prompt);
      let naming: Naming;
      try {
        naming = parseNaming(reply);
      } catch {
        reply = await ask(prompt);
        naming = parseNaming(reply);
      }
      cache.set(t.key, naming);
    } catch (e) {
      if (e instanceof ProviderError) {
        const why = e.status === 429 ? "The provider's free quota is used up for now; try again later." : e.message;
        return { failed, stopped: why };
      }
      failed.set(t.key, `${(e as Error).message} The reply began: ${JSON.stringify(reply.slice(0, 200))}`);
    }
  }
  onProgress?.(todo.length, todo.length);
  return { failed, stopped: null as string | null };
}

// Largest share first within three bands: themes that are actionable or not named yet; then themes whose naming
// failed (unknown, so they must not outrank real problems); then themes the model marked not actionable.
export function orderThemes<T extends { share: number; actionable?: boolean; failed?: boolean }>(themes: T[]): T[] {
  const band = (t: T) => (t.actionable === false ? 2 : t.failed ? 1 : 0);
  return [...themes].sort((a, b) => band(a) - band(b) || b.share - a.share);
}
