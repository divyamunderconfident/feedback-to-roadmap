// Groups embedding vectors into themes. Pure functions, no browser or model code, so they can be tested.

export const MIN_THEMES = 4; // fewer is too coarse for a roadmap
export const MAX_THEMES = 15; // more is hard to read
export const EXAMPLES_PER_THEME = 3;

export type Clustering = { labels: number[]; centroids: number[][] };
export type Theme = { size: number; share: number; examples: number[] }; // examples are row indices

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

// Tries every theme count from MIN_THEMES to MAX_THEMES and keeps the one whose themes separate best.
// Small files try fewer counts: at most √(n/2) themes, so each theme has a few rows on average.
export function chooseK(vectors: number[][], seed = 1, onTry?: (k: number) => void) {
  const maxK = Math.min(MAX_THEMES, Math.floor(Math.sqrt(vectors.length / 2)));
  if (maxK < 2) return { k: 1, scores: {} as Record<number, number>, clustering: kmeans(vectors, 1, seed) };
  let best = { k: 0, score: -Infinity, clustering: { labels: [], centroids: [] } as Clustering };
  const scores: Record<number, number> = {};
  for (let k = Math.min(MIN_THEMES, maxK); k <= maxK; k++) {
    onTry?.(k);
    const clustering = kmeans(vectors, k, seed);
    scores[k] = silhouette(vectors, clustering);
    if (scores[k] > best.score) best = { k, score: scores[k], clustering }; // ties keep the smaller k
  }
  return { k: best.k, scores, clustering: best.clustering };
}

// Themes largest first; examples are the rows nearest each theme's centre, i.e. the most typical ones.
export function summarize(vectors: number[][], { labels, centroids }: Clustering): Theme[] {
  return centroids
    .map((c, j) => {
      const members = labels.flatMap((l, i) => (l === j ? [i] : []));
      const examples = members
        .sort((x, y) => dist2(vectors[x], c) - dist2(vectors[y], c))
        .slice(0, EXAMPLES_PER_THEME);
      return { size: members.length, share: members.length / vectors.length, examples };
    })
    .filter((t) => t.size > 0)
    .sort((a, b) => b.size - a.size);
}
