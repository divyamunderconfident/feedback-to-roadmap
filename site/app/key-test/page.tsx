"use client";

// A small page to check bring-your-own-key calls work. The key is kept only in this browser's localStorage.
import { useEffect, useState } from "react";
import { chat, MODELS, PROXIED, type Provider, type Route } from "@/lib/llm";

const PROVIDERS: Provider[] = ["gemini", "groq"];
const storageKey = (p: Provider) => `f2r.key.${p}`;

// localStorage can be missing or blocked (private windows, blocked site data); the page must still work.
const load = (p: Provider) => {
  try {
    return localStorage.getItem(storageKey(p)) ?? "";
  } catch {
    return "";
  }
};
const save = (p: Provider, key: string) => {
  try {
    if (key) localStorage.setItem(storageKey(p), key);
    else localStorage.removeItem(storageKey(p));
  } catch {}
};

export default function KeyTest() {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [key, setKey] = useState("");
  const [route, setRoute] = useState<Route | "auto">("auto");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // Read after mount: localStorage does not exist during server rendering.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setKey(load(provider)), [provider]);

  async function test() {
    setBusy(true);
    setStatus("Calling…");
    try {
      const { text, route: used } = await chat(provider, key, [{ role: "user", content: "Reply with OK" }], {
        route: route === "auto" ? undefined : route,
      });
      setStatus(`Worked (${used}, ${MODELS[provider]}). Reply: ${text}`);
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function forget() {
    PROVIDERS.forEach((p) => save(p, ""));
    setKey("");
    setStatus("Your keys were removed from this browser.");
  }

  return (
    <main>
      <h1>Test your API key</h1>
      <p>
        Your key is saved only in this browser (localStorage) and sent only to the provider. Groq calls can go through
        this site&apos;s /api/proxy, which forwards the key without logging or storing it.
      </p>

      <p>
        <label>
          Provider:{" "}
          <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {PROVIDERS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>{" "}
        {PROXIED.includes(provider) && (
          <label>
            Route:{" "}
            <select value={route} onChange={(e) => setRoute(e.target.value as Route | "auto")}>
              <option value="auto">auto (direct, proxy if blocked)</option>
              <option value="direct">direct</option>
              <option value="proxy">proxy</option>
            </select>
          </label>
        )}
      </p>

      <p>
        <label>
          API key:{" "}
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              save(provider, e.target.value);
            }}
          />
        </label>
      </p>

      <p>
        <button onClick={test} disabled={!key || busy}>
          Test
        </button>{" "}
        <button onClick={forget}>Forget my key</button>
      </p>

      {status && <p role="status">{status}</p>}
    </main>
  );
}
