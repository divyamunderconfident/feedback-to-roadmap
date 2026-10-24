import { describe, expect, it } from "vitest";
import { byCentre, onePerReview, percentile, similarities, splitMatches } from "./match";

// Fake 2-number embeddings of length 1, stored flat as the worker stores them.
const unit = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const flat = (vs: number[][]) => Float32Array.from(vs.flat());
const angles = [0, 10, 60, 90, 180];
const vectors = flat(angles.map(unit));

describe("similarities", () => {
  it("gives the cosine similarity of each member to the target", () => {
    const sims = similarities(vectors, 2, [0, 1, 2, 3, 4], unit(0));
    expect(sims.map((s) => +s.toFixed(3))).toEqual([1, 0.985, 0.5, 0, -1]);
  });

  it("only scores the members asked for, in that order", () => {
    expect(similarities(vectors, 2, [3, 0], unit(0)).map((s) => +s.toFixed(3))).toEqual([0, 1]);
  });
});

describe("splitMatches", () => {
  it("counts a sentence as matching at or above the threshold, the rest as loosely related", () => {
    expect(splitMatches({ members: [7, 8, 9], sims: [0.6, 0.5, 0.2] }, 0.5)).toEqual({ matching: [7, 8], loose: [9] });
  });
});

describe("byCentre", () => {
  it("orders members nearest their mean first", () => {
    // mean of (0,0), (2,0), (10,0) is (4,0): distances 4, 2, 6
    expect(byCentre(flat([[0, 0], [2, 0], [10, 0]]), 2, [0, 1, 2])).toEqual([1, 0, 2]);
  });
});

describe("onePerReview", () => {
  it("keeps the first sentence of each review, in order, up to n", () => {
    const review = [5, 5, 6, 7, 8];
    expect(onePerReview([0, 1, 2, 3, 4], (s) => review[s], 3)).toEqual([0, 2, 3]);
  });
});

describe("percentile", () => {
  it("uses the nearest rank", () => {
    const v = [5, 1, 4, 2, 3];
    expect([0, 0.2, 0.5, 0.9, 1].map((p) => percentile(v, p))).toEqual([1, 1, 3, 5, 5]);
  });
});
