"use client";

import { useState } from "react";
import { MAX_ROWS, parseCsv, type ParsedCsv } from "@/lib/csv";
import { checkColumn, guessMapping, type Field, type Mapping } from "@/lib/mapping";

const OPTIONAL = ["rating", "date", "segment"] as const;
const FIELDS: Field[] = ["text", ...OPTIONAL];
const label = (field: Field) => field[0].toUpperCase() + field.slice(1);

export default function Home() {
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Mapping>({ text: "", rating: "", date: "", segment: "" });
  const [error, setError] = useState("");

  function load(text: string) {
    try {
      const parsed = parseCsv(text);
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
              <select value={mapping.text} onChange={(e) => setMapping({ ...mapping, text: e.target.value })}>
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
                <select value={mapping[field]} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}>
                  <option value="">(none)</option>
                  {csv.columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {status(field)}
              </label>
            ))}
          </fieldset>

          {/* No step after mapping exists yet (R2); for now the button only shows whether the text column is ready. */}
          <div>
            <button disabled={!checks.text?.ok}>Continue</button>
            {checks.rating && !checks.rating.ok && <p>Rating will be ignored.</p>}
          </div>

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
