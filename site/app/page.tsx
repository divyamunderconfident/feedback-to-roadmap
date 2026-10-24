"use client";

import { useRef, useState } from "react";
import { FINE_GROUPS } from "@/lib/cluster";
import { MIN_WORDS } from "@/lib/sentences";
import { MAX_ROWS, parseCsv, type ParsedCsv } from "@/lib/csv";
import type { WorkerMessage } from "@/lib/embed.worker";
import { checkColumn, guessMapping, type Field, type Mapping } from "@/lib/mapping";

type Progress = Extract<WorkerMessage, { type: "progress" }>;
type Result = Extract<WorkerMessage, { type: "done" }>;

const PHASES = {
  download: () => "Downloading the model (once; your browser keeps it)",
  embed: (p: Progress) => `Embedding sentences: ${p.done.toLocaleString()} of ${p.total.toLocaleString()}`,
  cluster: () => "Grouping into themes",
};
const DEFAULT_THEMES = 12; // a starting point for the slider, not a claim that 12 is right
const shorten = (s: string) => (s.length > 200 ? s.slice(0, 200) + "…" : s);

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

  // Any new file or mapping makes earlier themes out of date, so stop a running job and clear them.
  function reset() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setResult(null);
    setThemeCount(DEFAULT_THEMES);
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
    const w = new Worker(new URL("../lib/embed.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (data.type === "progress") return setProgress(data);
      w.terminate();
      worker.current = null;
      setProgress(null);
      if (data.type === "done") setResult(data);
      else setError(`Finding themes failed: ${data.message}`);
    };
    w.postMessage(reviews);
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
                {result.sentences.toLocaleString()} sentences of {MIN_WORDS} or more words.{" "}
                {result.centered
                  ? "App names and each app's average meaning were removed first, so themes group by problem rather than by app."
                  : "No segment column is mapped, so themes may partly group by app or product."}{" "}
                A review can raise several problems, so it can count towards several themes.
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
              <ol>
                {result.themesByCount[shownCount].map((t, i) => (
                  <li key={i}>
                    {t.sentences.toLocaleString()} sentences from {t.reviews.toLocaleString()} reviews
                    {result.centered && <> · apps: {t.apps.map(([app, n]) => `${app} ${n}`).join(", ")}</>}
                    <ul>
                      {t.examples.map((e) => (
                        <li key={`${e.row}:${e.text}`}>
                          “{shorten(e.text)}” <small>({[e.app, `row ${e.row + 1}`].filter(Boolean).join(", ")})</small>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
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
