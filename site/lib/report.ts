// R7: the ranked themes as Markdown and CSV, exactly as the page shows them (same order, same numbers).
import Papa from "papaparse";
import { rowOf } from "./verify";
import type { ThemeView } from "./view";

export type ReportMeta = { source: string; count: number; dates: boolean };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const rating = (t: ThemeView) => (t.size.avgRating === null ? "" : t.size.avgRating.toFixed(1));
const segments = (t: ThemeView) => t.size.segments.map(([s, n]) => `${s} (${n})`).join(", ");
const trend = (t: ThemeView, m: ReportMeta) =>
  !m.dates ? "no dates" : t.size.trend ? `${pct(t.size.trend.before)} → ${pct(t.size.trend.after)}` : "too few dated reviews";
const title = (t: ThemeView, rank: number) => t.name ?? `Theme ${rank}`;
const claimLines = (t: ThemeView) =>
  t.claims.map((c) => `${c.claim} ${c.evidence.map((e) => `"${e.quote}" (row ${rowOf(e.review) + 1})`).join(" ")}`);
const exampleLines = (t: ThemeView) => t.examples.map((e) => `"${e.text}" (${[e.segment, `row ${e.row + 1}`].filter(Boolean).join(", ")})`);

export function toMarkdown(themes: ThemeView[], m: ReportMeta) {
  const out = [
    "# Feedback to Roadmap: ranked themes",
    "",
    `Source: ${m.source}. ${m.count} themes, ranked by share of reviews; themes that are praise or filler come last.`,
    "One review can raise several problems, so shares add up to more than 100%. Every number is computed in code;",
    "every quote was checked word for word against the review it cites.",
  ];
  themes.forEach((t, i) => {
    out.push("", `## ${i + 1}. ${title(t, i + 1)} (${pct(t.share)} of reviews)`, "");
    if (t.problem) out.push(t.problem, "");
    if (t.actionable === false) out.push("*Not actionable: praise or filler.*", "");
    out.push(
      `- Reviews: ${t.size.reviews.toLocaleString("en")}`,
      `- Sentences: ${t.size.sentences.toLocaleString("en")} matching, ${t.loose.toLocaleString("en")} loosely related`,
      `- Average rating: ${rating(t) || "no ratings"}`,
      `- Trend: ${trend(t, m)}`,
    );
    if (t.size.segments.length) out.push(`- Top segments: ${segments(t)}`);
    if (t.claims.length) out.push("", "Claims:", ...claimLines(t).map((l) => `- ${l}`));
    if (t.hidden) out.push("", `${t.hidden} claim(s) hidden: a quote was not found word for word in the review it cites.`);
    if (t.examples.length) out.push("", "Example quotes:", ...exampleLines(t).map((l) => `- ${l}`));
  });
  return out.join("\n") + "\n";
}

const COLUMNS = [
  "rank",
  "theme",
  "problem",
  "actionable",
  "share_of_reviews",
  "reviews",
  "matching_sentences",
  "loosely_related",
  "avg_rating",
  "top_segments",
  "trend",
  "claims",
  "hidden_claims",
  "example_quotes",
];

export function toCsv(themes: ThemeView[], m: ReportMeta) {
  const rows = themes.map((t, i) => [
    i + 1,
    title(t, i + 1),
    t.problem ?? "",
    t.actionable === undefined ? "" : t.actionable ? "yes" : "no",
    (t.share * 100).toFixed(1),
    t.size.reviews,
    t.size.sentences,
    t.loose,
    rating(t),
    segments(t),
    trend(t, m),
    claimLines(t).join(" | "),
    t.hidden,
    exampleLines(t).join(" | "),
  ]);
  return Papa.unparse({ fields: COLUMNS, data: rows }, { newline: "\n" }) + "\n";
}
