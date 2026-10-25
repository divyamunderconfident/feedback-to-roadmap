"use client";

// A small page to check bring-your-own-key calls work. The key is kept only in this browser's localStorage.
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadKey as load, PROVIDERS, saveKey as save } from "@/lib/keys";
import { chat, MODELS, PROXIED, type Provider, type Route } from "@/lib/llm";

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
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm [&_label]:text-sm">
      <h1 className="text-xl font-semibold">Your API key</h1>
      <p className="text-sm text-slate-600">
        Naming themes needs a free key from{" "}
        <a className="text-teal-700 underline" href="https://aistudio.google.com/apikey">
          Google AI Studio (Gemini)
        </a>{" "}
        or{" "}
        <a className="text-teal-700 underline" href="https://console.groq.com/keys">
          Groq
        </a>
        . Your key is saved only in this browser (localStorage) and sent only to the provider. Groq calls can go
        through this site&apos;s /api/proxy, which forwards the key without logging or storing it.
      </p>

      <p className="flex flex-wrap gap-3">
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
            className="w-72"
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

      <p className="flex flex-wrap gap-3">
        <button
          className="rounded-lg border-0 bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          onClick={test}
          disabled={!key || busy}
        >
          Test
        </button>
        <button onClick={forget}>Forget my key</button>
        <Link href="/" className="self-center text-sm text-teal-700 underline">
          Back to Feedback to Roadmap
        </Link>
      </p>

      {status && (
        <p role="status" className="text-sm text-slate-700">
          {status}
        </p>
      )}
      </div>
    </main>
  );
}
