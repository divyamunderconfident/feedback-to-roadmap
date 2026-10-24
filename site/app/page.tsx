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
import { sizeTheme, type Columns, type Size } from "@/lib/size";
import { reviewId, rowOf, verifyClaims } from "@/lib/verify";

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

// One line of size numbers, all computed in code.
function sizeLine(s: Size, cols: Columns) {
  const trend = !cols.date
    ? "no dates"
    : !s.trend
      ? "too few dated reviews"
      : `${pct(s.trend.before)} of reviews before the median date, ${pct(s.trend.after)} after`;
  return [
    `${s.reviews.toLocaleString()} reviews (${pct(s.share)} of reviews)`,
    `${s.sentences.toLocaleString()} sentences`,
    s.avgRating === null ? "no ratings" : `average rating ${s.avgRating.toFixed(1)}`,
    cols.segment ? `top segments: ${s.segments.map(([seg, n]) => `${seg} ${n}`).join(", ")}` : "no segments",
    `trend: ${trend}`,
  ].join(" · ");
}

const OPTIONAL = ["rating", "date", "segment"] as const;
const FIELDS: Field[] = ["text", ...OPTIONAL];
const label = (field: Field) => field[0].toUpperCase() + field.slice(1);

export default function Home() {
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
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

  function load(text: string) {
    try {
      const parsed = parseCsv(text);
      reset();
      setCsv(parsed);
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
    load(await res.text());
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

  const shown = orderThemes(
    themes.map((t) => ({
      ...t,
      actionable: names.get(t.key)?.actionable,
      failed: nameErrors.has(t.key) && !names.has(t.key),
    })),
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
    checks[f] && <small role={checks[f].ok ? undefined : "alert"}> {checks[f].message}</small>;

  return (
    <main>
      <h1>Feedback to Roadmap</h1>

      <p>
        <label>
          Upload a CSV:{" "}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) load(await file.text());
            }}
          />
        </label>{" "}
        or <button onClick={loadDemo}>Load demo data</button>
      </p>

      {error && <p role="alert">{error}</p>}

      {csv && (
        <>
          {csv.capped && (
            <p role="alert">
              This file has more than {MAX_ROWS.toLocaleString()} rows. Only the first{" "}
              {MAX_ROWS.toLocaleString()} are used.
            </p>
          )}
          <p>{csv.rows.length.toLocaleString()} rows loaded.</p>

          <fieldset>
            <legend>Columns</legend>
            <label>
              Text (required):{" "}
              <select value={mapping.text} onChange={(e) => remap({ ...mapping, text: e.target.value })}>
                {csv.columns.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {status("text")}
            </label>
            {OPTIONAL.map((field) => (
              <label key={field}>
                {" "}
                {label(field)} (optional):{" "}
                <select value={mapping[field]} onChange={(e) => remap({ ...mapping, [field]: e.target.value })}>
                  <option value="">(none)</option>
                  {csv.columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {status(field)}
              </label>
            ))}
          </fieldset>

          <div>
            <button disabled={!checks.text?.ok || progress !== null} onClick={findThemes}>
              Continue
            </button>
            {checks.rating && !checks.rating.ok && <p>Rating will be ignored.</p>}
          </div>

          {progress && (
            <p>
              <label>
                {PHASES[progress.phase](progress)}
                <br />
                <progress value={progress.done} max={progress.total} />
              </label>
            </p>
          )}

          {result && (
            <section>
              <h2>{shownCount} themes</h2>
              <p>
                {result.sentences.length.toLocaleString()} sentences of {MIN_WORDS} or more words.{" "}
                {result.centered
                  ? "App names and each app's average meaning were removed first, so themes group by problem rather than by app."
                  : "No segment column is mapped, so themes may partly group by app or product."}
              </p>
              <p>
                Sentences are split into {FINE_GROUPS} small groups, the closest groups are merged step by step
                (avoiding very large groups), and the slider sets where to stop.
              </p>
              {counts.length > 1 && (
                <p>
                  <label>
                    Fewer themes ↔ More themes{" "}
                    <input
                      type="range"
                      min={counts[0]}
                      max={counts.at(-1)}
                      value={shownCount}
                      onChange={(e) => setThemeCount(Number(e.target.value))}
                    />
                  </label>{" "}
                  <output>{shownCount}</output>
                </p>
              )}
              <p>
                {Object.keys(keys).length === 0 ? (
                  <>
                    To name themes, save a Gemini or Groq key on the <a href="/key-test">key page</a>.{" "}
                  </>
                ) : (
                  Object.keys(keys).length > 1 && (
                    <label>
                      Model:{" "}
                      <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
                        {PROVIDERS.filter((p) => keys[p]).map((p) => (
                          <option key={p} value={p}>
                            {p} ({MODELS[p]})
                          </option>
                        ))}
                      </select>{" "}
                    </label>
                  )
                )}
                <button disabled={!provider || naming !== null} onClick={nameCurrent}>
                  Name themes
                </button>{" "}
                {process.env.NODE_ENV === "development" && (
                  <button disabled={naming !== null} onClick={exportEval}>
                    Export evaluation data
                  </button>
                )}{" "}
                {naming && `Naming theme ${Math.min(naming.done + 1, naming.total)} of ${naming.total}…`}
                {namingNote && <span role="alert">{namingNote}</span>}
              </p>
              {matches.size > 0 && (
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
              <p>One review can raise several problems, so shares add up to more than 100%.</p>
              <ol>
                {shown.map((t, i) => {
                  const named = names.get(t.key);
                  const { shown: claims, hidden } = named
                    ? verifyClaims(named.claims, (row) => csv.rows[row]?.[mapping.text])
                    : { shown: [], hidden: 0 };
                  return (
                    <li key={t.key}>
                      <strong>{named?.name ?? (t.failed ? "Unnamed theme (naming failed)" : `Theme ${i + 1}`)}</strong>
                      {named && !named.actionable && " (not actionable: praise or filler)"}
                      {named && <p>{named.problem}</p>}
                      <p>
                        <small>
                          {sizeLine(t.size, cols)}
                          {t.loose > 0 && ` · loosely related: ${t.loose.toLocaleString()} sentences`}
                        </small>
                      </p>
                      {claims.length > 0 && (
                        <ul>
                          {claims.map((c, j) => (
                            <li key={j}>
                              {c.claim}{" "}
                              {c.evidence.map((e, k) => (
                                <small key={k}>
                                  “{shorten(e.quote)}” (row {rowOf(e.review) + 1}){" "}
                                </small>
                              ))}
                            </li>
                          ))}
                        </ul>
                      )}
                      {hidden > 0 && (
                        <p>
                          <small>
                            {hidden} claim{hidden === 1 ? "" : "s"} hidden: a quote was not found word for word in the
                            review it cites.
                          </small>
                        </p>
                      )}
                      {nameErrors.has(t.key) && !named && (
                        <p>
                          <small>Could not name this theme: {nameErrors.get(t.key)}</small>
                        </p>
                      )}
                      <ul>
                        {t.examples.map((i) => {
                          const e = result.sentences[i];
                          return (
                            <li key={i}>
                              “{shorten(e.text)}” <small>({[e.app, `row ${e.row + 1}`].filter(Boolean).join(", ")})</small>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <table>
            <caption>First 20 rows</caption>
            <thead>
              <tr>
                {mapped.map((f) => (
                  <th key={f}>
                    {label(f)}
                    <br />
                    <small>{mapping[f]}</small>
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
        </>
      )}
    </main>
  );
}
