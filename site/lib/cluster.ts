// Groups embedding vectors into themes. Pure functions, no browser or model code, so they can be tested.

export const MIN_THEMES = 6; // fewer is too coarse for a roadmap
export const MAX_THEMES = 20; // more is hard to read
export const SAMPLE_SIZE = 4000; // the theme count is chosen on a sample; trying every count on all rows is too slow
export const EXAMPLES_PER_THEME = 3;

export type Clustering = { labels: number[]; centroids: number[][] };
export type Theme = {
  sentences: number;
  reviews: number; // distinct reviews with at least one sentence in the theme
  apps: [string, number][]; // sentences per app, most first
  examples: number[]; // sentence indices, nearest the centre, each from a different review
};

function dist2(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

function nearest(v: number[], centroids: number[][]) {
  let best = 0;
  let bestD = Infinity;
  centroids.forEach((c, j) => {
    const d = dist2(v, c);
    if (d < bestD) [best, bestD] = [j, d];
  });
  return best;
}

// Small seeded random generator (mulberry32), so the same file always gives the same themes.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Subtracts each group's mean vector from its members, then scales each back to length 1. Sentences about the
// same app share a lot of meaning ("this app", the app's features); removing it lets themes form around problems.
export function centerBy(vectors: number[][], groups: string[]) {
  const sums = new Map<string, { sum: number[]; n: number }>();
  vectors.forEach((v, i) => {
    const g = sums.get(groups[i]) ?? { sum: new Array(v.length).fill(0), n: 0 };
    v.forEach((x, d) => (g.sum[d] += x));
    g.n++;
    sums.set(groups[i], g);
  });
  return vectors.map((v, i) => {
    const { sum, n } = sums.get(groups[i])!;
    const c = v.map((x, d) => x - sum[d] / n);
    const norm = Math.hypot(...c);
    return norm === 0 ? c : c.map((x) => x / norm); // a group of one centres to zero; leave it at zero
  });
}

// k-means with k-means++ seeding: each new starting centre is picked far from the ones already chosen.
export function kmeans(vectors: number[][], k: number, seed = 1, maxIter = 50): Clustering {
  const rand = random(seed);
  const centroids = [vectors[Math.floor(rand() * vectors.length)]];
  while (centroids.length < k) {
    const d = vectors.map((v) => dist2(v, centroids[nearest(v, centroids)]));
    let r = rand() * d.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < d.length - 1 && (r -= d[i]) > 0) i++;
    centroids.push(vectors[i]); // if all rows are identical, r is 0 and this repeats a row; k-means still terminates
  }

  let labels: number[] = [];
  for (let iter = 0; iter < maxIter; iter++) {
    const next = vectors.map((v) => nearest(v, centroids));
    if (next.every((l, i) => l === labels[i])) break;
    labels = next;
    for (let j = 0; j < k; j++) {
      const members = vectors.filter((_, i) => labels[i] === j);
      if (members.length === 0) continue; // keep an empty cluster's old centre
      centroids[j] = members[0].map((_, d) => members.reduce((s, m) => s + m[d], 0) / members.length);
    }
  }
  return { labels, centroids };
}

// Simplified silhouette: for each row, compare the distance to its own centre (a) with the distance
// to the nearest other centre (b). Score is the mean of (b - a) / max(a, b): near 1 means tight,
// well-separated themes; near 0 means themes overlap. Costs n × k, unlike the full silhouette's n².
export function silhouette(vectors: number[][], { labels, centroids }: Clustering) {
  let total = 0;
  vectors.forEach((v, i) => {
    const a = Math.sqrt(dist2(v, centroids[labels[i]]));
    const b = Math.min(...centroids.filter((_, j) => j !== labels[i]).map((c) => Math.sqrt(dist2(v, c))));
    const m = Math.max(a, b);
    total += m === 0 ? 0 : (b - a) / m;
  });
  return total / vectors.length;
}

// Same seed, same sample: a seeded shuffle of the indices, first `size` kept.
function sample(n: number, size: number, seed: number) {
  const idx = Array.from({ length: n }, (_, i) => i);
  if (n <= size) return idx;
  const rand = random(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, size);
}

// Tries every theme count from MIN_THEMES to MAX_THEMES on a sample and keeps the one whose themes separate best,
// then groups all vectors into that many themes. Small inputs try fewer counts: at most √(n/2) themes.
export function chooseK(vectors: number[][], seed = 1, onTry?: (k: number) => void, sampleSize = SAMPLE_SIZE) {
  const picked = sample(vectors.length, sampleSize, seed).map((i) => vectors[i]);
  const maxK = Math.min(MAX_THEMES, Math.floor(Math.sqrt(picked.length / 2)));
  const scores: Record<number, number> = {};
  if (maxK < 2) return { k: 1, scores, clustering: kmeans(vectors, 1, seed) };
  let best = { k: 0, score: -Infinity };
  for (let k = Math.min(MIN_THEMES, maxK); k <= maxK; k++) {
    onTry?.(k);
    scores[k] = silhouette(picked, kmeans(picked, k, seed));
    if (scores[k] > best.score) best = { k, score: scores[k] }; // ties keep the smaller k
  }
  return { k: best.k, scores, clustering: kmeans(vectors, best.k, seed) };
}

// Themes with the most reviews first. Examples are the sentences nearest the centre (the most typical ones),
// at most one per review.
export function summarize(
  vectors: number[][],
  { labels, centroids }: Clustering,
  reviews: number[],
  apps: string[],
): Theme[] {
  return centroids
    .map((c, j) => {
      const members = labels.flatMap((l, i) => (l === j ? [i] : []));
      const appCounts = new Map<string, number>();
      members.forEach((i) => appCounts.set(apps[i], (appCounts.get(apps[i]) ?? 0) + 1));
      const seen = new Set<number>();
      const examples = members
        .sort((x, y) => dist2(vectors[x], c) - dist2(vectors[y], c))
        .filter((i) => !seen.has(reviews[i]) && seen.add(reviews[i]))
        .slice(0, EXAMPLES_PER_THEME);
      return {
        sentences: members.length,
        reviews: new Set(members.map((i) => reviews[i])).size,
        apps: [...appCounts].sort((a, b) => b[1] - a[1]),
        examples,
      };
    })
    .filter((t) => t.sentences > 0)
    .sort((a, b) => b.reviews - a.reviews);
}
