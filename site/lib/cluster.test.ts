import { describe, expect, it } from "vitest";
import { chooseK, kmeans, silhouette, summarize } from "./cluster";
import fixture from "./fixtures/clusters.json";

// 100 fake rows in 5 clear groups of 20; 8-number vectors stand in for real embeddings.
const vectors = fixture.map((r) => r.vector);
const groups = fixture.map((r) => r.group);

// True when every cluster holds exactly one group, whatever number the cluster got.
const matchesGroups = (labels: number[]) =>
  new Set(labels.map((l, i) => `${l}:${groups[i]}`)).size === new Set(groups).size;

describe("kmeans", () => {
  it("puts each fixture group in its own cluster", () => {
    expect(matchesGroups(kmeans(vectors, 5).labels)).toBe(true);
  });

  it("gives the same result for the same seed", () => {
    expect(kmeans(vectors, 6, 42)).toEqual(kmeans(vectors, 6, 42));
  });

  it("handles identical rows", () => {
    const same = Array(10).fill([1, 0, 0]);
    const { labels } = kmeans(same, 3);
    expect(labels).toHaveLength(10);
  });
});

describe("silhouette", () => {
  it("scores the true grouping higher than a wrong number of themes", () => {
    expect(silhouette(vectors, kmeans(vectors, 5))).toBeGreaterThan(silhouette(vectors, kmeans(vectors, 4)));
    expect(silhouette(vectors, kmeans(vectors, 5))).toBeGreaterThan(silhouette(vectors, kmeans(vectors, 7)));
  });
});

describe("chooseK", () => {
  it("finds the 5 fixture groups, trying 4 to 7 themes for 100 rows", () => {
    const tried: number[] = [];
    const { k, scores, clustering } = chooseK(vectors, 1, (k) => tried.push(k));
    expect(tried).toEqual([4, 5, 6, 7]); // √(100 / 2) ≈ 7
    expect(k).toBe(5);
    expect(Object.keys(scores)).toHaveLength(4);
    expect(matchesGroups(clustering.labels)).toBe(true);
  });

  it("uses one theme for very small files", () => {
    expect(chooseK(vectors.slice(0, 5)).k).toBe(1);
  });
});

describe("summarize", () => {
  it("returns theme sizes, shares and the rows nearest each centre", () => {
    const clustering = kmeans(vectors, 5);
    const themes = summarize(vectors, clustering);
    expect(themes.map((t) => t.size)).toEqual([20, 20, 20, 20, 20]);
    expect(themes.map((t) => t.share)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
    for (const t of themes) {
      expect(t.examples).toHaveLength(3);
      expect(new Set(t.examples.map((i) => groups[i])).size).toBe(1); // examples all from one group
    }
  });

  it("sorts largest first and picks the row at the centre first", () => {
    const vs = [[0, 0], [0, 1], [0, 2], [10, 0]];
    const themes = summarize(vs, { labels: [0, 0, 0, 1], centroids: [[0, 1], [10, 0]] });
    expect(themes.map((t) => t.size)).toEqual([3, 1]);
    expect(themes[0].examples[0]).toBe(1);
  });
});
