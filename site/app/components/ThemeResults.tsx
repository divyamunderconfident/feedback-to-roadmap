"use client";

// Ranked theme cards and the theme-count slider, shared by the demo and uploaded files.
import type { ReactNode } from "react";
import { toCsv, toMarkdown } from "@/lib/report";
import { rowOf } from "@/lib/verify";
import type { ThemeView } from "@/lib/view";

export type ColumnFlags = { rating: boolean; date: boolean; segment: boolean };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const shorten = (s: string, n = 220) => (s.length > n ? s.slice(0, n) + "…" : s);

// Saves text as a file in the visitor's browser; nothing leaves the browser.
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export const buttonClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800 tabular-nums">{value}</dd>
    </div>
  );
}

function ThemeCard({ t, rank, cols }: { t: ThemeView; rank: number; cols: ColumnFlags }) {
  const s = t.size;
  const trend = !cols.date
    ? "no dates"
    : s.trend
      ? `${pct(s.trend.before)} → ${pct(s.trend.after)}`
      : "too few dated reviews";
  return (
    <li className="reveal rounded-2xl border border-blue-100 bg-white p-5 shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-6">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-semibold text-slate-600">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{t.name ?? (t.failed ? "Unnamed theme" : `Theme ${rank}`)}</h3>
            {t.actionable === false && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Not actionable</span>
            )}
          </div>
          {t.problem && <p className="mt-1 text-sm text-slate-600">{t.problem}</p>}
          {t.failed && <p className="mt-1 text-sm text-amber-700">Could not name this theme. {t.failReason}</p>}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-2xl font-semibold tracking-tight text-blue-600 tabular-nums">{pct(t.share)}</div>
          <div className="text-xs text-slate-500">of reviews</div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Stat label="Reviews" value={s.reviews.toLocaleString()} />
        <Stat label="Sentences" value={`${s.sentences.toLocaleString()} matching · ${t.loose.toLocaleString()} loosely related`} />
        <Stat label="Avg rating" value={s.avgRating === null ? "no ratings" : `${s.avgRating.toFixed(1)} / 5`} />
        <Stat label="Trend" value={trend} />
      </dl>
      {cols.segment && s.segments.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-slate-500">Top segments</span>
          {s.segments.map(([seg, n]) => (
            <span key={seg} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {seg} · {n}
            </span>
          ))}
        </div>
      )}

      {t.claims.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs uppercase tracking-wide text-slate-500">Claims, with verified quotes</h4>
          <ul className="mt-2 space-y-2">
            {t.claims.map((c, i) => (
              <li key={i} className="text-sm text-slate-800">
                {c.claim}
                {c.evidence.map((e, j) => (
                  <q key={j} className="mt-1 block border-l-2 border-blue-500 pl-3 text-slate-600">
                    {shorten(e.quote)} <span className="text-xs text-slate-400">row {rowOf(e.review) + 1}</span>
                  </q>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {t.hidden > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {t.hidden} claim{t.hidden === 1 ? "" : "s"} hidden: a quote was not found word for word in the review it cites.
        </p>
      )}

      {t.examples.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs uppercase tracking-wide text-slate-500">Example quotes, verbatim</h4>
          <ul className="mt-2 space-y-1.5">
            {t.examples.map((e) => (
              <li key={`${e.row}:${e.text}`} className="border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
                “{shorten(e.text)}”{" "}
                <span className="text-xs text-slate-400">{[e.segment, `row ${e.row + 1}`].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function ThemeResults(props: {
  views: ThemeView[];
  cols: ColumnFlags;
  count: number;
  counts: number[]; // theme counts the slider can show, ascending
  onCount: (n: number) => void;
  source: string; // named in the exported report
  actions?: ReactNode; // more buttons shown next to the slider
}) {
  const { views, cols, count, counts } = props;
  const index = Math.max(0, counts.indexOf(count));
  const meta = { source: props.source, count, dates: cols.date };
  return (
    <section className="space-y-4">
      <div className="sticky top-2 z-10 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
        {counts.length > 1 ? (
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-slate-700">
            <span>
              <span className="font-semibold text-slate-900">{count} themes</span>
              <span className="text-slate-500"> · Fewer themes ↔ More themes</span>
            </span>
            <input
              type="range"
              min={0}
              max={counts.length - 1}
              step={1}
              value={index}
              onChange={(e) => props.onCount(counts[Number(e.target.value)])}
              aria-valuetext={`${count} themes`}
              className="accent-blue-600"
            />
          </label>
        ) : (
          <span className="text-sm font-semibold text-slate-900">{count} themes</span>
        )}
        <div className="flex flex-wrap gap-2">
          {props.actions}
          <button className={buttonClass} onClick={() => download("themes.md", toMarkdown(views, meta), "text/markdown")}>
            Download Markdown
          </button>
          <button className={buttonClass} onClick={() => download("themes.csv", toCsv(views, meta), "text/csv")}>
            Download CSV
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Ranked by share of reviews; themes that are praise or filler sit at the bottom. One review can raise several
        problems, so shares add up to more than 100%. Every number is computed in code, never by the model.
      </p>
      <ol className="space-y-3">
        {views.map((t, i) => (
          <ThemeCard key={t.key} t={t} rank={i + 1} cols={cols} />
        ))}
      </ol>
    </section>
  );
}
