import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "./llm";
import { nameThemes, namingPrompt, orderThemes, parseNaming, type Naming } from "./name";

const naming = (name: string) => ({
  name,
  problem: `${name} problem`,
  actionable: true,
  claims: [{ claim: "Users say sync is slow", evidence: [{ review: "r1", quote: "sync is slow" }] }],
});

// A fake model client: replies in order and records every call. It never reaches a real model.
function fakeAsk(...replies: (string | Error)[]) {
  return vi.fn(async () => {
    const r = replies.shift();
    if (r === undefined) throw new Error("fake model ran out of replies");
    if (r instanceof Error) throw r;
    return r;
  });
}

const theme = (key: string) => ({ key, samples: [{ id: "r1", text: "Sync is slow." }] });

describe("namingPrompt", () => {
  it("sends each sample with its review ID and nothing else from the file", () => {
    const [system, user] = namingPrompt([
      { id: "r3", text: "Login fails." },
      { id: "r9", text: "Too pricey." },
    ]);
    expect(system.role).toBe("system");
    expect(user.content).toBe("r3: Login fails.\nr9: Too pricey.");
  });
});

describe("parseNaming", () => {
  it("accepts a well-formed reply, also inside a code fence, and keeps at most 3 claims", () => {
    const four = { ...naming("Sync"), claims: Array(4).fill(naming("x").claims[0]) };
    expect(parseNaming(JSON.stringify(naming("Sync")))).toEqual(naming("Sync"));
    expect(parseNaming("```json\n" + JSON.stringify(naming("Sync")) + "\n```").name).toBe("Sync");
    expect(parseNaming(JSON.stringify(four)).claims).toHaveLength(3);
  });

  it("rejects replies that are not the expected shape", () => {
    const bad = [
      "not json",
      JSON.stringify({ ...naming("x"), name: "" }),
      JSON.stringify({ ...naming("x"), actionable: "yes" }),
      JSON.stringify({ ...naming("x"), claims: "none" }),
      JSON.stringify({ ...naming("x"), claims: [{ claim: "c" }] }),
      JSON.stringify({ ...naming("x"), claims: [{ claim: "c", evidence: [{ quote: "q" }] }] }),
    ];
    for (const b of bad) expect(() => parseNaming(b)).toThrow();
  });
});

describe("nameThemes", () => {
  it("names uncached themes and skips cached ones, so going back to a setting makes no call", async () => {
    const cache = new Map<string, Naming>();
    const ask = fakeAsk(JSON.stringify(naming("A")), JSON.stringify(naming("B")));
    await nameThemes([theme("a"), theme("b")], cache, ask);
    expect([...cache.keys()]).toEqual(["a", "b"]);

    await nameThemes([theme("a"), theme("b")], cache, ask); // e.g. the slider moved away and back
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("stops at a used-up quota (429) and keeps the names already fetched", async () => {
    const cache = new Map<string, Naming>();
    const ask = fakeAsk(JSON.stringify(naming("A")), new ProviderError("gemini returned 429", 429));
    const { stopped } = await nameThemes([theme("a"), theme("b"), theme("c")], cache, ask);
    expect(stopped).toMatch(/quota/);
    expect([...cache.keys()]).toEqual(["a"]);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("stops at other provider errors such as a bad key", async () => {
    const ask = fakeAsk(new ProviderError("groq returned 401: Invalid API Key", 401));
    const { stopped } = await nameThemes([theme("a"), theme("b")], new Map(), ask);
    expect(stopped).toMatch(/401/);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("asks again once after a malformed reply", async () => {
    const cache = new Map<string, Naming>();
    const ask = fakeAsk("{oops", JSON.stringify(naming("A")));
    const { failed } = await nameThemes([theme("a")], cache, ask);
    expect(failed.size).toBe(0);
    expect(cache.get("a")?.name).toBe("A");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("fails only that theme after two malformed replies, keeping the start of the reply", async () => {
    const cache = new Map<string, Naming>();
    const ask = fakeAsk("{oops", '{"title": "Sync"}', JSON.stringify(naming("B")));
    const { failed, stopped } = await nameThemes([theme("a"), theme("b")], cache, ask);
    expect(stopped).toBeNull();
    expect(failed.get("a")).toMatch(/missing a name.*The reply began: "\{\\"title\\": \\"Sync\\"\}"/);
    expect([...cache.keys()]).toEqual(["b"]);
  });

  it("reports progress", async () => {
    const progress: [number, number][] = [];
    await nameThemes([theme("a")], new Map(), fakeAsk(JSON.stringify(naming("A"))), (d, t) => progress.push([d, t]));
    expect(progress).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });
});

describe("orderThemes", () => {
  it("sorts by share; failed names after real problems; non-actionable themes last", () => {
    const themes = [
      { id: "praise", share: 0.5, actionable: false },
      { id: "failed", share: 0.6, failed: true },
      { id: "small", share: 0.1, actionable: true },
      { id: "not named yet", share: 0.3 },
      { id: "big", share: 0.4, actionable: true },
    ];
    expect(orderThemes(themes).map((t) => t.id)).toEqual(["big", "not named yet", "small", "failed", "praise"]);
  });
});
