// Model calls from the browser with the visitor's own key. Both providers speak the OpenAI chat format.
// The key only ever travels in a request header, never in a URL, and is never sent to our server except
// through /api/proxy, which forwards it without logging or storing it.

export type Provider = "gemini" | "groq";
export type Route = "direct" | "proxy";
export type Message = { role: "system" | "user" | "assistant"; content: string };

// Providers retire models often; a 404 usually means one is gone.
export const MODELS: Record<Provider, string> = {
  gemini: "gemini-3.5-flash-lite", // https://ai.google.dev/gemini-api/docs/models
  groq: "openai/gpt-oss-20b", // https://console.groq.com/docs/models
};

export const ENDPOINTS: Record<Provider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
};

export const PROXY_URL = "/api/proxy";
export const PROXIED: Provider[] = ["groq"]; // providers /api/proxy will forward to

const redact = (text: string, key: string) => (key ? text.split(key).join("[REDACTED]") : text);

async function send(provider: Provider, key: string, body: string, route: Route, fetchFn: typeof fetch) {
  return route === "proxy"
    ? fetchFn(PROXY_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider": provider, "x-provider-key": key },
        body,
      })
    : fetchFn(ENDPOINTS[provider], {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body,
      });
}

// Calls the provider and returns the reply text and the route used. With no route given, calls directly and,
// for providers the proxy supports, falls back to the proxy if the browser call fails outright (e.g. CORS).
// An HTTP error such as 401 is the provider's answer, so it is reported, not retried through the proxy.
// An HTTP error from the provider; status 429 means the free-tier quota is used up.
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function chat(
  provider: Provider,
  key: string,
  messages: Message[],
  { route, json = false, fetchFn = fetch }: { route?: Route; json?: boolean; fetchFn?: typeof fetch } = {},
): Promise<{ text: string; route: Route }> {
  const body = JSON.stringify({
    model: MODELS[provider],
    messages,
    temperature: 0,
    ...(json && { response_format: { type: "json_object" } }),
  });
  let used: Route = route ?? "direct";
  let res: Response;
  try {
    res = await send(provider, key, body, used, fetchFn);
  } catch (e) {
    if (route || !PROXIED.includes(provider)) throw new Error(redact(`${provider}: ${(e as Error).message}`, key));
    used = "proxy";
    res = await send(provider, key, body, used, fetchFn);
  }
  if (!res.ok)
    throw new ProviderError(redact(`${provider} returned ${res.status}: ${(await res.text()).slice(0, 300)}`, key), res.status);
  const data = await res.json();
  return { text: data.choices[0].message.content, route: used };
}
