"use client";

import { useState } from "react";
import { MAX_ROWS, parseCsv, type ParsedCsv } from "@/lib/csv";

const OPTIONAL = ["rating", "date", "segment"] as const;
type Mapping = { text: string } & Record<(typeof OPTIONAL)[number], string>;

export default function Home() {
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Mapping>({ text: "", rating: "", date: "", segment: "" });
  const [error, setError] = useState("");

  function load(text: string) {
    try {
      const parsed = parseCsv(text);
      setCsv(parsed);
      setMapping({
        text: parsed.columns.includes("text") ? "text" : parsed.columns[0],
        rating: "",
        date: "",
        segment: "",
      });
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
            </label>
            {OPTIONAL.map((field) => (
              <label key={field}>
                {" "}
                {field[0].toUpperCase() + field.slice(1)} (optional):{" "}
                <select value={mapping[field]} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}>
                  <option value="">(none)</option>
                  {csv.columns.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>

          <table>
            <caption>First 20 rows</caption>
            <thead>
              <tr>
                {csv.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csv.rows.slice(0, 20).map((row, i) => (
                <tr key={i}>
                  {csv.columns.map((c) => (
                    <td key={c}>{row[c]}</td>
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
