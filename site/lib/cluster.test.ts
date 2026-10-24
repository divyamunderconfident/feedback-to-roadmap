import { describe, expect, it } from "vitest";
import { centerBy, chooseK, kmeans, silhouette, summarize } from "./cluster";
import fixture from "./fixtures/clusters.json";

// 240 fake sentences: 8 problems × 3 apps × 10, two sentences per review. 11-number vectors stand in for real
// embeddings: one direction per problem plus a strong shift per app, so raw vectors group by app, not problem.
const raw = fixture.map((r) => r.vector);
const groups = fixture.map((r) => r.group);
const apps = fixture.map((r) => r.app);
const reviews = fixture.map((r) => r.review);
const centered = centerBy(raw, apps);

// True when every cluster holds exactly one problem group, whatever number the cluster got.
const matchesGroups = (labels: number[]) =>
  new Set(labels.map((l, i) => `${l}:${groups[i]}`)).size === new Set(groups).size;

describe("centerBy", () => {
  it("removes each app's mean and keeps vectors at length 1", () => {
    for (const app of ["mail", "notes", "chat"]) {
      const members = centered.filter((_, i) => apps[i] === app);
      const mean = members[0].map((_, d) => members.reduce((s, v) => s + v[d], 0) / members.length);
      expect(Math.hypot(...mean)).toBeLessThan(0.1);
    }
    centered.forEach((v) => expect(Math.hypot(...v)).toBeCloseTo(1, 6));
  });

  it("leaves a group of one at zero", () => {
    expect(centerBy([[0.6, 0.8]], ["solo"])).toEqual([[0, 0]]);
  });
});

describe("kmeans", () => {
  it("groups raw vectors by app, but centred vectors by problem", () => {
    expect(matchesGroups(kmeans(raw, 8).labels)).toBe(false);
    expect(matchesGroups(kmeans(centered, 8).labels)).toBe(true);
  });

  it("gives the same result for the same seed", () => {
    expect(kmeans(centered, 9, 42)).toEqual(kmeans(centered, 9, 42));
  });

  it("handles identical rows", () => {
    const { labels } = kmeans(Array(10).fill([1, 0, 0]), 3);
    expect(labels).toHaveLength(10);
  });
});

describe("silhouette", () => {
  it("scores the true grouping higher than a wrong number of themes", () => {
    const at = (k: number) => silhouette(centered, kmeans(centered, k));
    expect(at(8)).toBeGreaterThan(at(6));
    expect(at(8)).toBeGreaterThan(at(10));
  });
});

describe("chooseK", () => {
  it("finds the 8 problems, trying 6 to 10 themes for 240 rows", () => {
    const tried: number[] = [];
    const { k, scores, clustering } = chooseK(centered, 1, (k) => tried.push(k));
    expect(tried).toEqual([6, 7, 8, 9, 10]); // √(240 / 2) ≈ 10
    expect(k).toBe(8);
    expect(Object.keys(scores).map(Number)).toEqual(tried);
    expect(matchesGroups(clustering.labels)).toBe(true);
  });

  it("chooses on a sample but groups every vector", () => {
    const { k, clustering } = chooseK(centered, 1, undefined, 160);
    expect(k).toBe(8);
    expect(clustering.labels).toHaveLength(centered.length);
    expect(chooseK(centered, 1, undefined, 160)).toEqual(chooseK(centered, 1, undefined, 160));
  });

  it("uses one theme for very small inputs", () => {
    expect(chooseK(centered.slice(0, 5)).k).toBe(1);
  });
});

describe("summarize", () => {
  it("counts sentences, distinct reviews and apps, with examples from different reviews", () => {
    const themes = summarize(centered, kmeans(centered, 8), reviews, apps);
    expect(themes).toHaveLength(8);
    for (const t of themes) {
      expect(t.sentences).toBe(30);
      expect(t.reviews).toBe(15); // two sentences per review
      expect(t.apps).toEqual([expect.any(Array), expect.any(Array), expect.any(Array)]);
      expect(t.apps.map(([, n]) => n)).toEqual([10, 10, 10]);
      expect(t.examples).toHaveLength(3);
      expect(new Set(t.examples.map((i) => reviews[i])).size).toBe(3);
      expect(new Set(t.examples.map((i) => groups[i])).size).toBe(1);
    }
  });

  it("sorts by distinct reviews and skips a second sentence from the same review", () => {
    const vs = [[0, 1], [0, 1.01], [0, 2], [10, 0]];
    const themes = summarize(vs, { labels: [0, 0, 0, 1], centroids: [[0, 1], [10, 0]] }, [5, 5, 6, 7], ["a", "a", "b", "a"]);
    expect(themes.map((t) => [t.sentences, t.reviews])).toEqual([[3, 2], [1, 1]]);
    expect(themes[0].examples).toEqual([0, 2]);
    expect(themes[0].apps).toEqual([["a", 2], ["b", 1]]);
  });
});
