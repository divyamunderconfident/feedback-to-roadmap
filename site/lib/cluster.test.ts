import { describe, expect, it } from "vitest";
import { centerBy, cut, FINE_GROUPS, fineGroups, kmeans, mergeTree, summarize } from "./cluster";
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

describe("fine groups and merge tree", () => {
  const fine = fineGroups(centered);
  const merges = mergeTree(fine);
  const groupsAt = (themes: number) => cut(centered, fine, merges, themes).labels;

  it("splits the fixture into 40 fine groups, each inside one problem", () => {
    expect(new Set(fine.labels).size).toBe(FINE_GROUPS);
    expect(fine.labels).toHaveLength(centered.length);
    // every fine group holds one problem only
    expect(new Set(fine.labels.map((l, i) => `${l}:${groups[i]}`)).size).toBe(FINE_GROUPS);
  });

  it("recovers the 8 problems when cut at 8", () => {
    expect(new Set(groupsAt(8)).size).toBe(8);
    expect(matchesGroups(groupsAt(8))).toBe(true);
  });

  it("removes exactly one group per merge, keeping every sentence", () => {
    expect(merges).toHaveLength(FINE_GROUPS - 1);
    for (const themes of [40, 20, 12, 5, 1]) {
      const labels = groupsAt(themes);
      expect(new Set(labels).size).toBe(themes);
      expect(labels).toHaveLength(centered.length);
    }
  });

  it("cut at 40 is the fine groups themselves", () => {
    const pairs = new Set(groupsAt(40).map((l, i) => `${l}:${fine.labels[i]}`));
    expect(pairs.size).toBe(FINE_GROUPS);
  });

  it("gives the same tree for the same seed", () => {
    expect(mergeTree(fineGroups(centered, 3))).toEqual(mergeTree(fineGroups(centered, 3)));
  });

  it("merges the most similar centres first", () => {
    // groups 0 and 1 point almost the same way; group 2 points elsewhere, so it joins last
    const fineToy = { labels: [0, 1, 1, 1, 2], centroids: [[1, 0.1], [1, 0], [0, 1]] };
    expect(mergeTree(fineToy)).toEqual([[0, 1], [0, 2]]);
  });

  it("handles fewer vectors than fine groups", () => {
    const few = centered.slice(0, 10);
    const tiny = fineGroups(few);
    expect(mergeTree(tiny)).toHaveLength(new Set(tiny.labels).size - 1);
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
