import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const KEY = "test-key-456";
const BODY = JSON.stringify({ model: "m", messages: [{ role: "user", content: "hi" }] });
const request = (headers: Record<string, string>, body = BODY) =>
  new Request("http://localhost/api/proxy", { method: "POST", headers, body });

let upstream: ReturnType<typeof vi.fn>;
let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  // A fake upstream; tests never reach Groq.
  upstream = vi.fn(async () => new Response('{"choices":[]}', { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", upstream);
  logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
});

afterEach(() => {
  // The key must never be logged: no console call of any kind, in any test.
  logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/proxy", () => {
  it("forwards to Groq with the key as a Bearer token and returns the provider's reply", async () => {
    const res = await POST(request({ "x-provider": "groq", "x-provider-key": KEY, "content-type": "application/json" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"choices":[]}');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(init.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).toBe(BODY);
  });

  it("passes the provider's error status and body through", async () => {
    upstream.mockResolvedValueOnce(new Response('{"error":"Invalid API Key"}', { status: 401 }));
    const res = await POST(request({ "x-provider": "groq", "x-provider-key": KEY }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('{"error":"Invalid API Key"}');
  });

  it("refuses providers it does not serve, without calling out", async () => {
    for (const provider of ["gemini", "", "https://evil.example"]) {
      const res = await POST(request({ "x-provider": provider, "x-provider-key": KEY }));
      expect(res.status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses a request with no key", async () => {
    const res = await POST(request({ "x-provider": "groq" }));
    expect(res.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("refuses bodies over 1 MB", async () => {
    const res = await POST(request({ "x-provider": "groq", "x-provider-key": KEY }, "x".repeat(1_000_001)));
    expect(res.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns 502 when the provider cannot be reached, with no key in the reply", async () => {
    upstream.mockRejectedValueOnce(new TypeError(`connect failed for ${KEY}`));
    const res = await POST(request({ "x-provider": "groq", "x-provider-key": KEY }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(KEY);
  });
});
