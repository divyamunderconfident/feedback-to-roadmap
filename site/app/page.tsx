"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FINE_GROUPS } from "@/lib/cluster";
import { MIN_WORDS, type Sentence } from "@/lib/sentences";
import { MAX_ROWS, parseCsv, type ParsedCsv } from "@/lib/csv";
import type { WorkerMessage, WorkerRequest } from "@/lib/embed.worker";
import { MATCH_THRESHOLD, onePerReview, percentile, splitMatches, type ThemeMatch } from "@/lib/match";
import { loadKey, PROVIDERS } from "@/lib/keys";
import { chat, MODELS, type Provider } from "@/lib/llm";
import { checkColumn, guessMapping, parseDate, parseRating, type Field, type Mapping } from "@/lib/mapping";
import { nameThemes, orderThemes, type Naming } from "@/lib/name";
import { sizeTheme, type Columns } from "@/lib/size";
import { reviewId, verifyClaims } from "@/lib/verify";
import { demoViews, type DemoData, type ThemeView } from "@/lib/view";
import { buttonClass, ThemeResults } from "./components/ThemeResults";

type Progress = Extract<WorkerMessage, { type: "progress" }>;
type Result = Extract<WorkerMessage, { type: "done" }>;

const PHASES = {
  download: () => "Downloading the model (once; your browser keeps it)",
  embed: (p: Progress) => `Embedding sentences: ${p.done.toLocaleString()} of ${p.total.toLocaleString()}`,
  cluster: () => "Grouping into themes",
};
// A starting point for the slider. 20 rather than 12: on the demo, 20 themes agreed better with the AWARE labels (RESULTS.md).
const DEFAULT_THEMES = 20;
const SHOWN_EXAMPLES = 3;
const shorten = (s: string) => (s.length > 200 ? s.slice(0, 200) + "…" : s);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// A theme's cache key for names and matches: the same theme at any slider setting has the same fine groups.
const themeKey = (provider: Provider | "", groups: number[]) =>
  `${provider}:${provider && MODELS[provider]}:${groups.join(",")}`;
const EVAL_COUNTS = [12, 20]; // theme counts saved by the dev-only evaluation export

const PERCENTILES = [0.1, 0.25, 0.5, 0.75, 0.9];
const spread = (values: number[]) => PERCENTILES.map((p) => percentile(values, p).toFixed(2)).join(" / ");

// For choosing the match threshold: how similar each theme's sentences are to its problem statement, compared with
// sentences from other themes, and what a trial threshold would do. The trial value does not change the sizes above.
function ThresholdCheck(props: {
  themes: { key: string }[];
  matches: Map<string, ThemeMatch>;
  outside: number[];
  names: Map<string, Naming>;
  sentences: Sentence[];
  cols: Columns;
  trial: number;
  setTrial: (t: number) => void;
}) {
  const { themes, matches, outside, names, sentences, cols, trial } = props;
  const [picked, setPicked] = useState(themes[0]?.key ?? "");
  const rows = (ss: number[]) => ss.map((s) => sentences[s].row);
  const pick = matches.get(picked) ?? matches.get(themes[0]?.key ?? "");
  const ranked = pick ? pick.members.map((s, i) => ({ s, sim: pick.sims[i] })).sort((a, b) => a.sim - b.sim) : [];
  const above = ranked.filter((r) => r.sim >= trial).slice(0, 5);
  const below = ranked.filter((r) => r.sim < trial).slice(-5).reverse();
  const line = (r: { s: number; sim: number }) => (
    <li key={r.s}>
      {r.sim.toFixed(2)} “{shorten(sentences[r.s].text)}” <small>(row {sentences[r.s].row + 1})</small>
    </li>
  );
  return (
    <details>
      <summary>Threshold check: how close each theme&apos;s sentences are to its problem statement</summary>
      <p>
        Cosine similarity, shown as 10th / 25th / 50th / 75th / 90th percentile. Baseline, sentences from other
        themes: {outside.length ? spread(outside) : "none yet"}.
      </p>
      <p>
        <label>
          Try a threshold:{" "}
          <input type="number" step={0.01} min={-1} max={1} value={trial} onChange={(e) => props.setTrial(Number(e.target.value))} />
        </label>
      </p>
      <table>
        <thead>
          <tr>
            <th>Theme</th>
            <th>Sentences</th>
            <th>Similarity spread</th>
            <th>Share of reviews: all sentences → matching only</th>
          </tr>
        </thead>
        <tbody>
          {themes.map((t) => {
            const m = matches.get(t.key)!;
            const { matching } = splitMatches(m, trial);
            return (
              <tr key={t.key}>
                <td>{names.get(t.key)?.name}</td>
                <td>
                  {matching.length.toLocaleString()} of {m.members.length.toLocaleString()}
                </td>
                <td>{spread(m.sims)}</td>
                <td>
                  {pct(sizeTheme(rows(m.members), m.members.length, cols).share)} →{" "}
                  {pct(sizeTheme(rows(matching), matching.length, cols).share)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        <label>
          Sentences either side of the threshold for:{" "}
          <select value={picked} onChange={(e) => setPicked(e.target.value)}>
            {themes.map((t) => (
              <option key={t.key} value={t.key}>
                {names.get(t.key)?.name}
              </option>
            ))}
          </select>
        </label>
      </p>
      <p>Just above (would match):</p>
      <ul>{above.map(line)}</ul>
      <p>Just below (would be loosely related):</p>
      <ul>{below.map(line)}</ul>
    </details>
  );
}

const OPTIONAL = ["rating", "date", "segment"] as const;
const FIELDS: Field[] = ["text", ...OPTIONAL];
const label = (field: Field) => field[0].toUpperCase() + field.slice(1);

export default function Home() {
  // The site opens on the precomputed demo; visitors can switch to their own CSV and key.
  const [mode, setMode] = useState<"demo" | "own">("demo");
  const [demo, setDemo] = useState<DemoData | null>(null);
  const [demoCount, setDemoCount] = useState(DEFAULT_THEMES);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({ text: "", rating: "", date: "", segment: "" });
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [themeCount, setThemeCount] = useState(DEFAULT_THEMES);
  const worker = useRef<Worker | null>(null);
  const [keys, setKeys] = useState<Partial<Record<Provider, string>>>({});
  const [provider, setProvider] = useState<Provider | "">("");
  const [naming, setNaming] = useState<{ done: number; total: number } | null>(null);
  const [namingNote, setNamingNote] = useState("");
  // Names per theme, kept while the file and mapping stay the same, so moving the slider back never calls again.
  const [names, setNames] = useState(new Map<string, Naming>());
  const [nameErrors, setNameErrors] = useState(new Map<string, string>());
  // Per named theme: its sentences nearest the centre first, and each one's similarity to the problem statement.
  const [matches, setMatches] = useState(new Map<string, ThemeMatch>());
  const [outside, setOutside] = useState<number[]>([]); // similarities to sentences from other themes, as a baseline
  const [trial, setTrial] = useState(0.3); // threshold tried in the check panel; not used for sizes

  // Saved keys live in localStorage, which does not exist during server rendering. Re-read them when another
  // tab (the key page) changes them, so saving a key does not mean reloading and re-running the themes.
  useEffect(() => {
    const read = () => {
      const saved = Object.fromEntries(PROVIDERS.map((p) => [p, loadKey(p)]).filter(([, k]) => k));
      setKeys(saved);
      setProvider((p) => (p && saved[p] ? p : (PROVIDERS.find((q) => saved[q]) ?? "")));
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  useEffect(() => {
    fetch("/demo.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then(setDemo)
      .catch((e) => setError(`Could not load the demo (${e.message}).`));
  }, []);

  // Any new file or mapping makes earlier themes out of date, so stop a running job and clear them.
  function reset() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setResult(null);
    setThemeCount(DEFAULT_THEMES);
    setNames(new Map());
    setNameErrors(new Map());
    setNamingNote("");
    setMatches(new Map());
    setOutside([]);
  }

  function remap(next: Mapping) {
    reset();
    setMapping(next);
  }

  function findThemes() {
    if (!csv) return;
    reset();
    // The segment column is used as the "app" for per-app centering.
    const reviews = csv.rows.map((r, row) => ({
      row,
      text: r[mapping.text] ?? "",
      app: mapping.segment ? (r[mapping.segment] ?? "") : "",
    }));
    // The worker stays alive after grouping: it keeps the sentence vectors for matching problem statements later.
    const w = new Worker(new URL("../lib/embed.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.type === "progress") return setProgress(data);
      setProgress(null);
      if (data.type === "done") setResult(data);
      else if (data.type === "matched") {
        setMatches((prev) => new Map([...prev, ...data.results.map((r) => [r.key, r] as const)]));
        setOutside((prev) => [...prev, ...data.outside]);
      } else setError(`Working on the themes failed: ${data.message}`);
    };
    w.postMessage({ type: "run", reviews } satisfies WorkerRequest);
  }

  function load(text: string, name: string) {
    try {
      const parsed = parseCsv(text);
      reset();
      setCsv(parsed);
      setFileName(name);
      setMapping(guessMapping(parsed.columns));
      setError("");
    } catch (e) {
      setCsv(null);
      setError((e as Error).message);
    }
  }

  async function loadDemo() {
    const res = await fetch("/demo_reviews.csv");
    if (!res.ok) return setError(`Could not load the demo data (${res.status}).`);
    load(await res.text(), "demo_reviews.csv");
  }

  const mapped = FIELDS.filter((f) => mapping[f]);
  const checks = Object.fromEntries(
    mapped.map((f) => [f, checkColumn(f, csv?.rows.map((r) => r[mapping[f]] ?? "") ?? [])]),
  );
  const counts = result ? Object.keys(result.themesByCount).map(Number) : [];
  const shownCount = Math.min(Math.max(themeCount, counts[0] ?? 0), counts.at(-1) ?? 0);

  // Per-row values from the mapped columns. A rating column that failed its check is ignored.
  const cols = useMemo<Columns>(() => {
    const rows = csv?.rows ?? [];
    const values = (f: Field) => rows.map((r) => r[mapping[f]] ?? "");
    return {
      hasText: values("text").map((t) => t.trim() !== ""),
      rating: mapping.rating && checks.rating?.ok ? values("rating").map(parseRating) : undefined,
      date: mapping.date ? values("date").map(parseDate) : undefined,
      segment: mapping.segment ? values("segment") : undefined,
    };
  }, [csv, mapping, checks.rating?.ok]);

  // Themes at the current slider setting, with sizes computed from their member sentences. Once a theme is named
  // and a match threshold is set, only the sentences that match its problem statement count.
  const themes = useMemo(() => {
    if (!result) return [];
    const rowOf = (s: number) => result.sentences[s].row;
    return result.themesByCount[shownCount].map((t) => {
      const key = themeKey(provider, t.groups);
      const match = matches.get(key);
      const all = match?.members ?? result.fineLabels.flatMap((l, s) => (t.groups.includes(l) ? [s] : []));
      const { matching, loose } =
        match && MATCH_THRESHOLD !== null ? splitMatches(match, MATCH_THRESHOLD) : { matching: all, loose: [] };
      const size = sizeTheme(matching.map(rowOf), matching.length, cols);
      const examples = match ? onePerReview(matching, rowOf, SHOWN_EXAMPLES) : t.examples.slice(0, SHOWN_EXAMPLES);
      return { ...t, key, size, share: size.share, loose: loose.length, examples };
    });
  }, [result, shownCount, cols, provider, matches]);

  const views: ThemeView[] = orderThemes(
    themes.map((t) => {
      const named = names.get(t.key);
      const { shown: claims, hidden } = named
        ? verifyClaims(named.claims, (row) => csv?.rows[row]?.[mapping.text])
        : { shown: [], hidden: 0 };
      return {
        key: t.key,
        name: named?.name ?? null,
        problem: named?.problem ?? null,
        actionable: named?.actionable,
        failed: nameErrors.has(t.key) && !named,
        failReason: nameErrors.get(t.key),
        size: t.size,
        share: t.share,
        loose: t.loose,
        examples: t.examples.map((i) => {
          const s = result!.sentences[i];
          return { text: s.text, row: s.row, segment: s.app || undefined };
        }),
        claims,
        hidden,
      };
    }),
  );

  async function nameCurrent() {
    if (!result || !provider) return;
    const key = keys[provider]!;
    const cache = new Map(names);
    setNamingNote("");
    const { failed, stopped } = await nameThemes(
      themes.map((t) => ({
        key: t.key,
        samples: t.examples.map((i) => ({ id: reviewId(result.sentences[i].row), text: result.sentences[i].text })),
      })),
      cache,
      async (messages) => (await chat(provider, key, messages, { json: true })).text,
      (done, total) => {
        setNaming({ done, total });
        setNames(new Map(cache)); // show each name as soon as it arrives
      },
    );
    setNames(new Map(cache));
    setNameErrors((prev) => new Map([...prev, ...failed]));
    setNaming(null);
    setNamingNote(stopped ?? (failed.size ? `${failed.size} theme(s) could not be named; see below.` : ""));
    // Compare each newly named theme's problem statement with its sentences (in the worker, which has the vectors).
    const toMatch = themes.filter((t) => cache.has(t.key) && !matches.has(t.key));
    if (toMatch.length)
      worker.current?.postMessage({
        type: "match",
        themes: toMatch.map((t) => ({ key: t.key, problem: cache.get(t.key)!.problem, groups: t.groups })),
      } satisfies WorkerRequest);
  }
  // Development only: saves this run's own outputs for eval/match_eval.py, which compares them with the AWARE labels
  // offline. Every theme at each count in EVAL_COUNTS must be named and matched first.
  async function exportEval() {
    if (!result || !csv) return;
    const counts: Record<number, unknown[]> = {};
    for (const n of EVAL_COUNTS) {
      const missing = (result.themesByCount[n] ?? []).filter((t) => !matches.has(themeKey(provider, t.groups)));
      if (!result.themesByCount[n] || missing.length)
        return setNamingNote(`Export needs every theme named at ${n} themes (${missing.length} missing).`);
      counts[n] = result.themesByCount[n].map((t) => {
        const key = themeKey(provider, t.groups);
        const { name, problem, actionable } = names.get(key)!;
        return { name, problem, actionable, ...matches.get(key)! };
      });
    }
    const body = JSON.stringify({
      model: provider && MODELS[provider],
      sentences: result.sentences.map((s) => ({ row: s.row, review: csv.rows[s.row].id ?? null, text: s.text })),
      counts,
    });
    const res = await fetch("/api/eval-export", { method: "POST", headers: { "content-type": "application/json" }, body });
    setNamingNote(res.ok ? `Saved evaluation data (${body.length.toLocaleString()} characters).` : `Export failed: ${res.status}`);
  }

  const status = (f: Field) =>
    checks[f] && (
      <span role={checks[f].ok ? undefined : "alert"} className={`text-xs ${checks[f].ok ? "text-slate-500" : "text-amber-700"}`}>
        {checks[f].message}
      </span>
    );

  const demoCounts = demo ? Object.keys(demo.counts).map(Number) : [];

  if (mode === "demo") {
    const demoThemes = demo ? demoViews(demo, demoCount) : [];
    const own = () => {
      setMode("own");
      window.scrollTo({ top: 0 });
    };
    return (
      <main className="mx-auto max-w-6xl space-y-16 px-5 pt-12 pb-16 sm:pt-20">
        <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="hero-in">
            <p className="font-mono text-xs font-medium tracking-wide text-teal-700 uppercase">
              Customer feedback → ranked problems
            </p>
            <h1 className="mt-4 text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-slate-900 sm:text-5xl">
              Find the problems your users keep raising, with a receipt for every claim.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-slate-600">
              Drop in reviews, tickets or survey answers. Feedback to Roadmap groups them into themes in your browser,
              sizes each one in code, and only shows claims whose quotes check out word for word.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#results" className={primaryClass}>
                Explore the demo
              </a>
              <button className={buttonClass} onClick={own}>
                Analyze your own CSV
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-500">Free. Runs with your own Gemini or Groq key. No sign-up.</p>
          </div>
          <Receipt top={demoThemes[0]} count={demoCount} reviews={demo?.hasText.length} />
        </section>

        <section id="results" className="scroll-mt-6 space-y-5">
          <div className="reveal flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50/80 p-5">
            <div>
              <p role="status" className="font-semibold text-teal-900">
                Demo: {demo ? demo.hasText.length.toLocaleString() : "3,542"} real App Store reviews
              </p>
              <p className="mt-1 text-sm text-teal-800">
                12 apps from the AWARE dataset, grouped in the browser and named in advance by{" "}
                {demo?.model ?? "Gemini"}. No key needed.
              </p>
            </div>
            <button className={primaryClass} onClick={own}>
              Analyze your own CSV
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-amber-700">
              {error}
            </p>
          )}
          {demo ? (
            <ThemeResults
              views={demoThemes}
              cols={{ rating: true, date: false, segment: true }}
              count={demoCount}
              counts={demoCounts}
              onCount={setDemoCount}
              source="demo, 3,542 App Store reviews from the AWARE dataset"
            />
          ) : (
            !error && <p className="text-sm text-slate-500">Loading the demo…</p>
          )}
        </section>

        <HowItWorks />

        <section className="reveal rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">Run it on your own feedback</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600 text-pretty">
            Up to 5,000 rows. Your file stays in your browser; only sample sentences go to the model, with your own free
            key.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className={primaryClass} onClick={own}>
              Analyze your own CSV
            </button>
            <a href="/key-test" className={buttonClass}>
              Get a free key
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:py-14">
      <section className="hero-in space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Analyze your own feedback</h1>
          <button className={buttonClass} onClick={() => setMode("demo")}>
            Back to the demo
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Your file stays in this browser. Grouping runs here; only sample sentences are sent to the model, with your
          own key.
        </p>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">1. Upload a CSV</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              className="text-sm text-slate-600"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) load(await file.text(), file.name);
              }}
            />
            <span className="text-slate-500">or</span>
            <button className={buttonClass} onClick={loadDemo}>
              Use the demo CSV
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-amber-700">{error}</p>}
          {csv?.capped && (
            <p role="alert" className="text-sm text-amber-700">
              This file has more than {MAX_ROWS.toLocaleString()} rows. Only the first {MAX_ROWS.toLocaleString()} are
              used.
            </p>
          )}
          {csv && (
            <p className="text-sm text-slate-600">
              {fileName}: {csv.rows.length.toLocaleString()} rows loaded.
            </p>
          )}
        </div>

        {csv && (
          <>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900">2. Pick the columns</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-700">Text (required)</span>
                  <select value={mapping.text} onChange={(e) => remap({ ...mapping, text: e.target.value })}>
                    {csv.columns.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  {status("text")}
                </label>
                {OPTIONAL.map((field) => (
                  <label key={field} className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-700">{label(field)} (optional)</span>
                    <select value={mapping[field]} onChange={(e) => remap({ ...mapping, [field]: e.target.value })}>
                      <option value="">(none)</option>
                      {csv.columns.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    {status(field)}
                  </label>
                ))}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">Preview the first 20 rows</summary>
                <table className="mt-2">
                  <thead>
                    <tr>
                      {mapped.map((f) => (
                        <th key={f}>
                          {label(f)} <span className="font-normal text-slate-500">({mapping[f]})</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csv.rows.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        {mapped.map((f) => (
                          <td key={f}>{row[mapping[f]]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900">3. Find themes</h2>
              <div className="flex flex-wrap items-center gap-3">
                <button className={primaryClass} disabled={!checks.text?.ok || progress !== null} onClick={findThemes}>
                  Find themes
                </button>
                {checks.rating && !checks.rating.ok && <span className="text-sm text-amber-700">Rating will be ignored.</span>}
              </div>
              {progress && (
                <label className="block max-w-md text-sm text-slate-600">
                  {PHASES[progress.phase](progress)}
                  <progress className="mt-1 block w-full accent-teal-700" value={progress.done} max={progress.total} />
                </label>
              )}
            </div>
          </>
        )}

        {result && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">4. Name the themes</h2>
            <p className="text-sm text-slate-600">
              {result.sentences.length.toLocaleString()} sentences of {MIN_WORDS} or more words, split into{" "}
              {FINE_GROUPS} small groups and merged step by step.{" "}
              {result.centered
                ? "App names and each app's average meaning were removed first, so themes group by problem."
                : "No segment column is mapped, so themes may partly group by product."}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {Object.keys(keys).length === 0 ? (
                <span className="text-slate-600">
                  To name themes, save a free Gemini or Groq key on the{" "}
                  <a href="/key-test" target="_blank" className="font-medium text-teal-700 underline">
                    key page
                  </a>
                  ; this page picks it up without reloading.
                </span>
              ) : (
                Object.keys(keys).length > 1 && (
                  <label className="flex items-center gap-2">
                    Model
                    <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
                      {PROVIDERS.filter((p) => keys[p]).map((p) => (
                        <option key={p} value={p}>
                          {p} ({MODELS[p]})
                        </option>
                      ))}
                    </select>
                  </label>
                )
              )}
              <button className={primaryClass} disabled={!provider || naming !== null} onClick={nameCurrent}>
                Name themes
              </button>
              {process.env.NODE_ENV === "development" && (
                <button className={buttonClass} disabled={naming !== null} onClick={exportEval}>
                  Export evaluation data (dev)
                </button>
              )}
              {naming && (
                <span className="text-slate-600">
                  Naming theme {Math.min(naming.done + 1, naming.total)} of {naming.total}…
                </span>
              )}
              {namingNote && (
                <span role="alert" className="text-amber-700">
                  {namingNote}
                </span>
              )}
            </div>
            {process.env.NODE_ENV === "development" && matches.size > 0 && (
              <ThresholdCheck
                themes={themes.filter((t) => matches.has(t.key))}
                matches={matches}
                outside={outside}
                names={names}
                sentences={result.sentences}
                cols={cols}
                trial={trial}
                setTrial={setTrial}
              />
            )}
          </div>
        )}
      </section>

      {result && (
        <ThemeResults
          views={views}
          cols={{ rating: !!cols.rating, date: !!cols.date, segment: !!cols.segment }}
          count={shownCount}
          counts={counts}
          onCount={setThemeCount}
          source={fileName}
        />
      )}
      <HowItWorks />
    </main>
  );
}

const primaryClass =
  "inline-flex items-center rounded-lg border-0 bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50";

// The hero's focal piece: the demo's headline result, read from the real demo data.
function Receipt({ top, count, reviews }: { top?: ThemeView; count: number; reviews?: number }) {
  const quote = top?.examples[0];
  return (
    <figure className="hero-in-late rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_-12px_rgb(15_118_110/0.25)] sm:p-7">
      <figcaption className="flex items-center justify-between font-mono text-xs text-slate-500">
        <span>Demo result</span>
        <span>{reviews ? reviews.toLocaleString() : "3,542"} App Store reviews</span>
      </figcaption>
      <p className="mt-5 text-4xl font-semibold tracking-tight text-slate-900">
        {count} <span className="text-slate-500">ranked problems</span>
      </p>
      <div className="mt-6 border-t border-dashed border-slate-200 pt-5">
        <p className="text-xs tracking-wide text-slate-500 uppercase">Top problem</p>
        <p className="mt-1 font-medium text-slate-900">{top?.name ?? "Loading the demo…"}</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div
              className="h-full rounded-full bg-teal-600 transition-[width] duration-700"
              style={{ width: `${Math.min(100, (top?.share ?? 0) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-sm font-semibold text-teal-700 tabular-nums">
            {top ? `${(top.share * 100).toFixed(1)}%` : "–"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">of reviews, counted in code</p>
      </div>
      {quote && (
        <blockquote className="mt-5 border-l-2 border-teal-600 pl-3 text-sm text-slate-600">
          “{quote.text}”
          <footer className="mt-1 font-mono text-xs text-slate-400">
            {[quote.segment, `row ${quote.row + 1}`].filter(Boolean).join(" · ")} · verbatim
          </footer>
        </blockquote>
      )}
    </figure>
  );
}

function HowItWorks() {
  const steps = [
    ["Upload", "Drop a CSV of reviews, tickets or survey answers and pick the text column, plus optional rating, date and segment."],
    ["Group", "Your browser splits the text into sentences, embeds them with a small model (all-MiniLM-L6-v2) and groups them into themes. The slider sets how many."],
    ["Name", "With your own free Gemini or Groq key, a model names each theme and writes a problem statement and up to 3 claims, each citing review rows."],
    ["Check", "Every quote is checked word for word against the review it cites; claims that fail are hidden and counted. Only sentences that match a theme's problem statement count towards its size."],
    ["Export", "Download the ranked themes as Markdown or CSV. Share, rating, segments and trend are computed in code, never by the model."],
  ];
  return (
    <section id="how-it-works" className="scroll-mt-6">
      <h2 className="reveal text-2xl font-semibold tracking-tight">How it works</h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map(([title, text], i) => (
          <li
            key={title}
            className="reveal rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <span className="font-mono text-xs text-teal-700">0{i + 1}</span>
            <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
            <p className="mt-2 text-slate-600">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
