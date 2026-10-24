// Which of a theme's sentences match its problem statement. Pure functions on flat vector arrays, so they can be
// tested with fake embeddings; the worker supplies the real ones.

// The minimum cosine similarity between a sentence and its theme's problem statement for the sentence to count.
// 0.30 is about the 90th percentile of problem statements compared with sentences from other themes on the demo
// (baseline 10/25/50/75/90th: 0.01/0.06/0.13/0.21/0.31), so a matching sentence is closer than ~90% of unrelated ones.
// It filters clearly unrelated sentences well but is not precise: near 0.45, about 3 in 5 sampled sentences matched.
// null would count every member.
export const MATCH_THRESHOLD: number | null = 0.3;

export type ThemeMatch = { members: number[]; sims: number[] }; // members ordered nearest the centre first; sims aligned

// Vectors are stored flat: vector i is flat[i*dim .. (i+1)*dim).
export function similarities(flat: Float32Array, dim: number, members: number[], target: number[]) {
  return members.map((m) => {
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += flat[m * dim + d] * target[d];
    return dot; // the vectors and target have length 1, so the dot product is the cosine similarity
  });
}

// Members sorted by distance to their mean (the theme centre), nearest first.
export function byCentre(flat: Float32Array, dim: number, members: number[]) {
  const centre = new Array(dim).fill(0);
  for (const m of members) for (let d = 0; d < dim; d++) centre[d] += flat[m * dim + d] / members.length;
  const dist = (m: number) => {
    let s = 0;
    for (let d = 0; d < dim; d++) s += (flat[m * dim + d] - centre[d]) ** 2;
    return s;
  };
  const ds = new Map(members.map((m) => [m, dist(m)]));
  return [...members].sort((a, b) => ds.get(a)! - ds.get(b)!);
}

export function splitMatches({ members, sims }: ThemeMatch, threshold: number) {
  const matching: number[] = [];
  const loose: number[] = [];
  members.forEach((m, i) => (sims[i] >= threshold ? matching : loose).push(m));
  return { matching, loose };
}

// The first n sentences in the given order that come from different reviews.
export function onePerReview(ordered: number[], reviewOf: (sentence: number) => number, n: number) {
  const seen = new Set<number>();
  return ordered.filter((s) => !seen.has(reviewOf(s)) && seen.add(reviewOf(s))).slice(0, n);
}

// Nearest-rank percentile, p from 0 to 1.
export function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}
