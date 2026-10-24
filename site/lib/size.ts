// Theme sizes, computed in code and never by the model.

export const MIN_DATED_REVIEWS = 20; // fewer dated reviews say nothing reliable about a trend
export const TOP_SEGMENTS = 3;

// Per-row values from the mapped columns, indexed by CSV row. A column is undefined when it is not mapped
// (or, for rating, when it failed its check); a cell is null when it is empty or unreadable.
export type Columns = {
  hasText: boolean[];
  rating?: (number | null)[];
  date?: (number | null)[];
  segment?: string[];
};

export type Size = {
  sentences: number;
  reviews: number;
  share: number; // of all reviews with text
  avgRating: number | null; // null: no rating column, or no rated review in the theme
  segments: [string, number][]; // reviews per segment, most first
  trend: { before: number; after: number } | null; // the theme's share of reviews before / from the median date
};

export function sizeTheme(rows: number[], sentences: number, cols: Columns): Size {
  const unique = [...new Set(rows)];
  const total = cols.hasText.filter(Boolean).length;

  const ratings = cols.rating ? unique.map((r) => cols.rating![r]).filter((x): x is number => x !== null) : [];
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const segCounts = new Map<string, number>();
  for (const r of unique) {
    const seg = cols.segment?.[r];
    if (seg) segCounts.set(seg, (segCounts.get(seg) ?? 0) + 1);
  }
  const segments = [...segCounts].sort((a, b) => b[1] - a[1]).slice(0, TOP_SEGMENTS);

  return {
    sentences,
    reviews: unique.length,
    share: total ? unique.length / total : 0,
    avgRating,
    segments,
    trend: trend(unique, cols),
  };
}

// Splits all dated reviews with text at the median date, then compares the theme's share of reviews in each half.
function trend(themeRows: number[], cols: Columns) {
  if (!cols.date) return null;
  const date = cols.date;
  const dated = cols.hasText.flatMap((has, r) => (has && date[r] !== null ? [r] : []));
  if (dated.length < MIN_DATED_REVIEWS) return null;
  const sorted = dated.map((r) => date[r]!).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const inTheme = new Set(themeRows);
  const half = (after: boolean) => {
    const rows = dated.filter((r) => date[r]! >= median === after);
    return rows.length ? rows.filter((r) => inTheme.has(r)).length / rows.length : 0;
  };
  return { before: half(false), after: half(true) };
}
