import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoViews, type DemoData } from "./view";

// A fake demo file: 4 reviews, 3 themes at 2 counts.
const demo: DemoData = {
  model: "fake",
  threshold: 0.3,
  sentences: 6,
  hasText: [true, true, true, true],
  ratings: [1, 2, null, 5],
  segments: ["mail", "mail", "chat", "chat"],
  counts: {
    "12": [
      { name: "Praise", problem: "none", actionable: false, rows: [0, 1, 2, 3], loose: 0, examples: [] },
      { name: "Small", problem: "p", actionable: true, rows: [3], loose: 2, examples: [{ row: 3, text: "Hi there." }] },
      { name: "Big", problem: "p", actionable: true, rows: [0, 0, 1, 2], loose: 1, examples: [] },
    ],
  },
};

describe("demoViews", () => {
  const views = demoViews(demo, 12);

  it("ranks by share with non-actionable themes last", () => {
    expect(views.map((v) => v.name)).toEqual(["Big", "Small", "Praise"]);
  });

  it("sizes each theme in code from its matching rows", () => {
    expect(views[0].size).toMatchObject({ sentences: 4, reviews: 3, share: 0.75, avgRating: 1.5 });
    expect(views[0].size.segments).toEqual([["mail", 2], ["chat", 1]]);
    expect(views[1]).toMatchObject({ loose: 2, examples: [{ row: 3, text: "Hi there.", segment: "chat" }] });
  });

  it("returns nothing for a count the demo does not have", () => {
    expect(demoViews(demo, 7)).toEqual([]);
  });
});

describe("the real demo file", () => {
  const real = JSON.parse(readFileSync("public/demo.json", "utf8")) as DemoData;

  it("covers the 3,542 demo reviews at 12 and 20 themes, at the site's threshold", () => {
    expect(real.hasText).toHaveLength(3542);
    expect(Object.keys(real.counts)).toEqual(["12", "20"]);
    expect(real.threshold).toBe(0.3);
    expect(demoViews(real, 20)).toHaveLength(20);
  });
});
