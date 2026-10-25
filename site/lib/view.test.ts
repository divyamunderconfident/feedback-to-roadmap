import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoViews, type DemoData } from "./view";

// A fake demo file: 4 reviews, 4 themes, slider counts 2 and 3 sharing one theme.
const demo: DemoData = {
  model: "fake",
  threshold: 0.3,
  sentences: 6,
  hasText: [true, true, true, true],
  ratings: [1, 2, null, 5],
  segments: ["mail", "mail", "chat", "chat"],
  themes: {
    "0": { name: "Praise", problem: "none", actionable: false, rows: [0, 1, 2, 3], loose: 0, examples: [] },
    "1": { name: "Small", problem: "p", actionable: true, rows: [3], loose: 2, examples: [{ row: 3, text: "Hi there." }] },
    "2": { name: "Big", problem: "p", actionable: true, rows: [0, 0, 1, 2], loose: 1, examples: [] },
    "1,2": { name: "Merged", problem: "p", actionable: true, rows: [0, 1, 2, 3], loose: 3, examples: [] },
  },
  counts: { "2": ["0", "1,2"], "3": ["0", "1", "2"] },
};

describe("demoViews", () => {
  const views = demoViews(demo, 3);

  it("ranks by share with non-actionable themes last", () => {
    expect(views.map((v) => v.name)).toEqual(["Big", "Small", "Praise"]);
  });

  it("sizes each theme in code from its matching rows", () => {
    expect(views[0].size).toMatchObject({ sentences: 4, reviews: 3, share: 0.75, avgRating: 1.5 });
    expect(views[0].size.segments).toEqual([["mail", 2], ["chat", 1]]);
    expect(views[1]).toMatchObject({ loose: 2, examples: [{ row: 3, text: "Hi there.", segment: "chat" }] });
  });

  it("keeps a theme's key across slider counts", () => {
    expect(demoViews(demo, 2).find((v) => v.name === "Praise")!.key).toBe(views[2].key);
  });

  it("returns nothing for a count the demo does not have", () => {
    expect(demoViews(demo, 7)).toEqual([]);
  });
});

describe("the real demo file", () => {
  const real = JSON.parse(readFileSync("public/demo.json", "utf8")) as DemoData;

  it("covers the 3,542 demo reviews at every count from 5 to 40, at the site's threshold", () => {
    expect(real.hasText).toHaveLength(3542);
    expect(Object.keys(real.counts).map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 5),
    );
    expect(real.threshold).toBe(0.3);
    for (const n of [5, 12, 20, 40]) expect(demoViews(real, n)).toHaveLength(n);
  });
});
