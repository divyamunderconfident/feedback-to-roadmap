// Pass-through for model providers that block calls straight from the browser. The visitor's key arrives in the
// x-provider-key header and goes on to the provider as a Bearer token. It is never logged, stored or echoed back:
// this file has no console calls and no error message includes request headers.

// Only these upstream URLs are allowed, so the function cannot be used as an open relay.
const UPSTREAM: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
};
const MAX_BODY = 1_000_000; // characters; chat requests are far smaller

const fail = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const url = UPSTREAM[req.headers.get("x-provider") ?? ""];
  if (!url) return fail(400, `x-provider must be one of: ${Object.keys(UPSTREAM).join(", ")}.`);
  const key = req.headers.get("x-provider-key");
  if (!key) return fail(400, "Missing x-provider-key header.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return fail(413, "Request body too large.");
  const body = await req.text();
  if (body.length > MAX_BODY) return fail(413, "Request body too large.");

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body,
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return fail(502, "Could not reach the provider."); // the caught error is dropped on purpose: never log here
  }
}
