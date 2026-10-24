// Hand check of the match threshold (dev only): a sample of matching sentences from the largest actionable themes,
// spread evenly over similarity bands, for a person to mark on or off topic. Pure functions, so they can be tested;
// the dev-only route reads eval/runs/demo_export.json and writes eval/labels/theme_check.csv.
import Papa from "papaparse";
import { random } from "./cluster";

export const THEME_COUNT = 20; // slider setting the themes come from
export const THEMES = 5;
export const PER_BAND = 5;
export const BANDS: [label: string, low: number, high: number][] = [
  ["0.30-0.35", 0.3, 0.35],
  ["0.35-0.40", 0.35, 0.4],
  ["0.40-0.45", 0.4, 0.45],
  ["0.45+", 0.45, Infinity],
];

type ExportTheme = { name: string; problem: string; actionable: boolean; members: number[]; sims: number[] };
export type Export = {
  sentences: { row: number; review: string | null; text: string }[];
  counts: Record<string, ExportTheme[]>;
};

export type CheckItem = {
  id: string;
  theme: string;
  problem: string;
  sentence: number;
  row: number;
  review: string | null;
  text: string;
  similarity: number;
  band: string;
};

// What the labelling page may see: never the similarity or the band, so they cannot sway the answer.
export type PublicItem = Pick<CheckItem, "id" | "theme" | "problem" | "text">;
export const toPublic = ({ id, theme, problem, text }: CheckItem): PublicItem => ({ id, theme, problem, text });

function shuffle<T>(items: T[], rand: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The THEMES actionable themes with the most sentences in the lowest band or above, PER_BAND sentences drawn at
// random from each band (all of them if a band has fewer), then shuffled so the order gives nothing away.
// The same export and seed always give the same sample.
export function buildSample(exp: Export, seed = 1): CheckItem[] {
  const rand = random(seed);
  const low = BANDS[0][1];
  const themes = (exp.counts[THEME_COUNT] ?? [])
    .filter((t) => t.actionable)
    .map((t) => ({ t, matching: t.sims.filter((s) => s >= low).length }))
    .sort((a, b) => b.matching - a.matching || a.t.name.localeCompare(b.t.name))
    .slice(0, THEMES)
    .map(({ t }) => t);
  const items = themes.flatMap((t) =>
    BANDS.flatMap(([band, lo, hi]) => {
      const inBand = t.members.flatMap((s, i) => (t.sims[i] >= lo && t.sims[i] < hi ? [{ s, sim: t.sims[i] }] : []));
      return shuffle(inBand, rand)
        .slice(0, PER_BAND)
        .map(({ s, sim }) => ({
          id: String(s), // a sentence belongs to one theme at a given slider setting, so its index is unique here
          theme: t.name,
          problem: t.problem,
          sentence: s,
          row: exp.sentences[s].row,
          review: exp.sentences[s].review,
          text: exp.sentences[s].text,
          similarity: sim,
          band,
        }));
    }),
  );
  return shuffle(items, rand);
}

const COLUMNS = ["item_id", "theme", "problem", "band", "similarity", "row", "review_id", "sentence", "on_topic"];

// The answered items, in sample order, as CSV.
export function toCsv(items: CheckItem[], answers: Record<string, boolean>) {
  const rows = items
    .filter((it) => it.id in answers)
    .map((it) => [it.id, it.theme, it.problem, it.band, it.similarity.toFixed(4), it.row + 1, it.review ?? "", it.text, answers[it.id] ? "yes" : "no"]);
  return Papa.unparse({ fields: COLUMNS, data: rows }, { newline: "\n" }) + "\n";
}

// Answers saved so far, by item ID.
export function readAnswers(csv: string): Record<string, boolean> {
  const { data } = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return Object.fromEntries(data.filter((r) => r.on_topic === "yes" || r.on_topic === "no").map((r) => [r.item_id, r.on_topic === "yes"]));
}
