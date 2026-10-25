// What a theme card shows, for both the precomputed demo and an uploaded file.
import { orderThemes } from "./name";
import { sizeTheme, type Columns, type Size } from "./size";
import type { Claim } from "./verify";

export type Quote = { text: string; row: number; segment?: string };
export type ThemeView = {
  key: string;
  name: string | null; // null until the theme is named
  problem: string | null;
  actionable?: boolean;
  failed?: boolean; // naming was tried and failed
  failReason?: string;
  size: Size;
  share: number;
  loose: number; // sentences in the theme that do not match its problem statement
  examples: Quote[]; // verbatim matching sentences nearest the theme centre, one per review
  claims: Claim[]; // only claims whose quotes passed the check
  hidden: number; // claims hidden because a quote was not found in the review it cites
};

// site/public/demo.json, built by eval/build_demo.py from a real run (no model calls when the demo is shown).
export type DemoTheme = {
  name: string;
  problem: string;
  actionable: boolean;
  rows: number[]; // review row of each matching sentence
  loose: number;
  examples: { row: number; text: string }[];
};
export type DemoData = {
  model: string;
  threshold: number;
  sentences: number;
  hasText: boolean[];
  ratings: (number | null)[];
  segments: string[];
  counts: Record<string, DemoTheme[]>;
};

export const demoColumns = (d: DemoData): Columns => ({ hasText: d.hasText, rating: d.ratings, segment: d.segments });

// Demo themes at one theme count, sized in code from their matching sentences and ranked like uploaded ones.
export function demoViews(d: DemoData, count: number): ThemeView[] {
  const cols = demoColumns(d);
  return orderThemes(
    (d.counts[count] ?? []).map((t, i) => {
      const size = sizeTheme(t.rows, t.rows.length, cols);
      return {
        key: `demo:${count}:${i}`,
        name: t.name,
        problem: t.problem,
        actionable: t.actionable,
        size,
        share: size.share,
        loose: t.loose,
        examples: t.examples.map((e) => ({ ...e, segment: d.segments[e.row] })),
        claims: [],
        hidden: 0,
      };
    }),
  );
}
