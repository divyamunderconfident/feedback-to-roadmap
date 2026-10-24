import { describe, expect, it, vi } from "vitest";
import { chat, ENDPOINTS, MODELS, PROXY_URL } from "./llm";

const KEY = "test-key-123";
const MSGS = [{ role: "user" as const, content: "Reply with OK" }];
const reply = (text: string, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status });

// A fake fetch that records calls; it never reaches a real model.
function fakeFetch(...responses: (Response | Error)[]) {
  return vi.fn(async () => {
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("chat", () => {
  it("calls Gemini directly with the key only in the Authorization header", async () => {
    const f = fakeFetch(reply("OK"));
    expect(await chat("gemini", KEY, MSGS, { fetchFn: f })).toEqual({ text: "OK", route: "direct" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(ENDPOINTS.gemini);
    expect(url).not.toContain(KEY);
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({ model: MODELS.gemini, messages: MSGS, temperature: 0 });
  });

  it("sends Groq through the proxy with the key in x-provider-key", async () => {
    const f = fakeFetch(reply("OK"));
    expect(await chat("groq", KEY, MSGS, { route: "proxy", fetchFn: f })).toEqual({ text: "OK", route: "proxy" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(PROXY_URL);
    expect(init.headers).toMatchObject({ "x-provider": "groq", "x-provider-key": KEY });
    expect(init.headers.authorization).toBeUndefined();
  });

  it("falls back to the proxy for Groq when the direct call fails outright", async () => {
    const f = fakeFetch(new TypeError("Failed to fetch"), reply("OK"));
    expect(await chat("groq", KEY, MSGS, { fetchFn: f })).toEqual({ text: "OK", route: "proxy" });
    expect(f.mock.calls.map((c) => c[0])).toEqual([ENDPOINTS.groq, PROXY_URL]);
  });

  it("does not fall back on an HTTP error, and keeps the key out of the message", async () => {
    const f = fakeFetch(new Response(`bad key ${KEY}`, { status: 401 }));
    await expect(chat("groq", KEY, MSGS, { fetchFn: f })).rejects.toThrow(/groq returned 401: bad key \[REDACTED\]/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports the HTTP status, so a used-up quota (429) can be told apart", async () => {
    const f = fakeFetch(new Response("rate limited", { status: 429 }));
    await expect(chat("gemini", KEY, MSGS, { fetchFn: f })).rejects.toMatchObject({ status: 429 });
  });

  it("asks for JSON only when told to", async () => {
    const f = fakeFetch(reply("{}"), reply("OK"));
    await chat("gemini", KEY, MSGS, { json: true, fetchFn: f });
    await chat("gemini", KEY, MSGS, { fetchFn: f });
    expect(JSON.parse(f.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(f.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  it("does not fall back for Gemini, which the proxy does not serve", async () => {
    const f = fakeFetch(new TypeError(`Failed to fetch ${KEY}`));
    await expect(chat("gemini", KEY, MSGS, { fetchFn: f })).rejects.toThrow("gemini: Failed to fetch [REDACTED]");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does not fall back when a route was chosen", async () => {
    const f = fakeFetch(new TypeError("Failed to fetch"));
    await expect(chat("groq", KEY, MSGS, { route: "direct", fetchFn: f })).rejects.toThrow("Failed to fetch");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
