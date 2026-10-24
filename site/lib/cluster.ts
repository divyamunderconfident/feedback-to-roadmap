// Groups embedding vectors into themes. Pure functions, no browser or model code, so they can be tested.
// How: split vectors into FINE_GROUPS small groups, then merge the two most similar groups again and again.
// The merge order is a tree; cutting it at any number of themes is instant, so the page can offer a slider.

export const FINE_GROUPS = 40;
export const SAMPLE_SIZE = 4000; // fine groups are fitted on a sample, then every vector joins its nearest group
export const EXAMPLES_PER_THEME = 3;

export type Clustering = { labels: number[]; centroids: number[][] };
export type Merge = [into: number, from: number]; // fine-group ids; `from` joins `into`
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

// Mean vector of each label; a label with no members gets an empty array.
function means(vectors: number[][], labels: number[], k: number) {
  const sums = Array.from({ length: k }, () => new Array(vectors[0]?.length ?? 0).fill(0));
  const counts = new Array(k).fill(0);
  vectors.forEach((v, i) => {
    v.forEach((x, d) => (sums[labels[i]][d] += x));
    counts[labels[i]]++;
  });
  return sums.map((s, j) => (counts[j] ? s.map((x) => x / counts[j]) : []));
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
    means(vectors, labels, k).forEach((m, j) => {
      if (m.length) centroids[j] = m; // keep an empty cluster's old centre
    });
  }
  return { labels, centroids };
}

// FINE_GROUPS small groups (fewer for small inputs), fitted on a sample; then every vector joins its nearest
// group and each group's centre is recomputed from all its members.
export function fineGroups(vectors: number[][], seed = 1): Clustering {
  const picked = sample(vectors.length, SAMPLE_SIZE, seed).map((i) => vectors[i]);
  const { centroids } = kmeans(picked, Math.min(FINE_GROUPS, picked.length), seed);
  const labels = vectors.map((v) => nearest(v, centroids));
  return { labels, centroids: means(vectors, labels, centroids.length).map((m, j) => (m.length ? m : centroids[j])) };
}

// Agglomerative merging with Ward linkage: repeatedly merge the two groups whose merge adds the least spread
// (sum of squared distances to the centre). That cost, nA·nB / (nA + nB) · |cA − cB|², grows with group size,
// so big groups stop swallowing everything. A merged centre is the size-weighted mean. Returns merges in order.
export function mergeTree({ labels, centroids }: Clustering): Merge[] {
  const size = centroids.map((_, j) => labels.filter((l) => l === j).length);
  const centre = centroids.map((c) => [...c]);
  const alive = new Set(centroids.map((_, j) => j).filter((j) => size[j] > 0));
  const merges: Merge[] = [];
  while (alive.size > 1) {
    let best: Merge = [-1, -1];
    let bestCost = Infinity;
    const ids = [...alive];
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const [i, j] = [ids[a], ids[b]];
        const cost = ((size[i] * size[j]) / (size[i] + size[j])) * dist2(centre[i], centre[j]);
        if (cost < bestCost) [best, bestCost] = [[i, j], cost];
      }
    const [into, from] = best;
    const n = size[into] + size[from];
    centre[into] = centre[into].map((x, d) => (x * size[into] + centre[from][d] * size[from]) / n);
    size[into] = n;
    alive.delete(from);
    merges.push(best);
  }
  return merges;
}

// Applies merges until `themes` groups are left. Labels are renumbered 0..themes-1; centres are member means.
export function cut(vectors: number[][], fine: Clustering, merges: Merge[], themes: number): Clustering {
  const groups = merges.length + 1;
  const root = fine.centroids.map((_, j) => j);
  const find = (j: number): number => (root[j] === j ? j : (root[j] = find(root[j])));
  merges.slice(0, Math.max(0, groups - themes)).forEach(([into, from]) => (root[find(from)] = find(into)));
  const ids = new Map<number, number>();
  const labels = fine.labels.map((l) => {
    const r = find(l);
    if (!ids.has(r)) ids.set(r, ids.size);
    return ids.get(r)!;
  });
  return { labels, centroids: means(vectors, labels, ids.size) };
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
