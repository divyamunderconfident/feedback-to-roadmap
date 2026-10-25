import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { toCsv, toMarkdown } from "./report";
import type { ThemeView } from "./view";

const size = { sentences: 40, reviews: 30, share: 0.25, avgRating: 2.5, segments: [["mail", 20], ["chat", 10]] as [string, number][], trend: null };
const themes: ThemeView[] = [
  {
    key: "a",
    name: "Sync is slow",
    problem: "Notes take minutes to sync.",
    actionable: true,
    size,
    share: 0.25,
    loose: 5,
    examples: [{ text: 'It says "syncing" forever.', row: 6, segment: "mail" }],
    claims: [{ claim: "Sync stalls.", evidence: [{ review: "r7", quote: "syncing forever" }] }],
    hidden: 1,
  },
  { key: "b", name: null, problem: null, size: { ...size, avgRating: null, segments: [] }, share: 0.1, loose: 0, examples: [], claims: [], hidden: 0 },
];
const meta = { source: "test.csv", count: 2, dates: false };

describe("toMarkdown", () => {
  const md = toMarkdown(themes, meta);

  it("lists themes in the given order with their numbers, claims and quotes", () => {
    expect(md).toContain("## 1. Sync is slow (25.0% of reviews)");
    expect(md).toContain("Notes take minutes to sync.");
    expect(md).toContain("- Sentences: 40 matching, 5 loosely related");
    expect(md).toContain("- Average rating: 2.5");
    expect(md).toContain("- Trend: no dates");
    expect(md).toContain("- Top segments: mail (20), chat (10)");
    expect(md).toContain('- Sync stalls. "syncing forever" (row 7)');
    expect(md).toContain("1 claim(s) hidden");
    expect(md).toContain('- "It says "syncing" forever." (mail, row 7)');
    expect(md.indexOf("## 1.")).toBeLessThan(md.indexOf("## 2. Theme 2"));
  });

  it("says when there are no ratings", () => {
    expect(md).toContain("- Average rating: no ratings");
  });
});

describe("toCsv", () => {
  it("has one row per theme that parses back, with quotes escaped", () => {
    const { data } = Papa.parse<Record<string, string>>(toCsv(themes, meta), { header: true, skipEmptyLines: true });
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      rank: "1",
      theme: "Sync is slow",
      actionable: "yes",
      share_of_reviews: "25.0",
      reviews: "30",
      avg_rating: "2.5",
      hidden_claims: "1",
      example_quotes: '"It says "syncing" forever." (mail, row 7)',
    });
    expect(data[1]).toMatchObject({ theme: "Theme 2", actionable: "", avg_rating: "" });
  });
});
