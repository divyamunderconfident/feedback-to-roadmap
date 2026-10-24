import { describe, expect, it } from "vitest";
import { reviewId, rowOf, verifyClaims } from "./verify";

const reviews = ["Sync is   SLOW on my iPad.", "I can’t log in since the update.", "Great app!"];
const text = (row: number) => reviews[row];
const claim = (...evidence: [string, string][]) => ({
  claim: "c",
  evidence: evidence.map(([review, quote]) => ({ review, quote })),
});

describe("review IDs", () => {
  it("are row numbers starting at 1", () => {
    expect(reviewId(0)).toBe("r1");
    expect(rowOf("r124")).toBe(123);
    expect(rowOf("124")).toBe(-1);
    expect(rowOf("rx")).toBe(-1);
  });
});

describe("verifyClaims", () => {
  it("passes a quote that matches ignoring case and spacing", () => {
    expect(verifyClaims([claim(["r1", "sync is slow on my ipad"])], text)).toEqual({
      shown: [claim(["r1", "sync is slow on my ipad"])],
      hidden: 0,
    });
  });

  it("treats curly and straight quote marks the same", () => {
    expect(verifyClaims([claim(["r2", "I can't log in"])], text).hidden).toBe(0);
  });

  it("hides a quote that is reworded, from another review, or cites an unknown review", () => {
    const claims = [
      claim(["r1", "sync is very slow"]), // reworded
      claim(["r1", "I can’t log in"]), // the words are in r2, not r1
      claim(["r9", "Great app"]), // no such review
      claim(["12", "Great app"]), // not an ID
    ];
    expect(verifyClaims(claims, text)).toEqual({ shown: [], hidden: 4 });
  });

  it("hides a claim if any of its quotes fails, or if it has none", () => {
    const claims = [claim(["r1", "sync is slow"], ["r3", "terrible"]), claim(), claim(["r3", "  "])];
    expect(verifyClaims(claims, text)).toEqual({ shown: [], hidden: 3 });
  });
});
