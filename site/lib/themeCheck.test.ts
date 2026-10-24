import { describe, expect, it } from "vitest";
import { BANDS, buildSample, PER_BAND, readAnswers, THEMES, toCsv, toPublic, type Export } from "./themeCheck";

// A fake export: 7 themes with 10 sentences in each band, plus one below the threshold. No model, no real data.
const sims = [0.2, ...[0.31, 0.36, 0.41, 0.5].flatMap((s) => Array(10).fill(s))];
const fakeExport = (): Export => {
  const sentences: Export["sentences"] = [];
  const theme = (name: string, actionable: boolean, size: number) => {
    const members = sims.slice(0, size).map(() => sentences.push({ row: sentences.length, review: `r-${sentences.length}`, text: `${name} sentence ${sentences.length}, "quoted"` }) - 1);
    return { name, problem: `${name} problem`, actionable, members, sims: sims.slice(0, size) };
  };
  return {
    sentences,
    counts: {
      "20": [
        theme("praise", false, 41), // largest, but not actionable
        theme("a", true, 41),
        theme("b", true, 41),
        theme("c", true, 41),
        theme("d", true, 41),
        theme("e", true, 41),
        theme("small", true, 21), // fewest matching sentences: left out
      ],
    },
  };
};

describe("buildSample", () => {
  const items = buildSample(fakeExport());

  it("takes the 5 largest actionable themes, 5 sentences per band", () => {
    expect(new Set(items.map((i) => i.theme))).toEqual(new Set(["a", "b", "c", "d", "e"]));
    expect(items).toHaveLength(THEMES * BANDS.length * PER_BAND);
    for (const t of "abcde")
      for (const [band] of BANDS) expect(items.filter((i) => i.theme === t && i.band === band)).toHaveLength(PER_BAND);
  });

  it("only uses sentences at or above the threshold, in the band their similarity falls in", () => {
    for (const i of items) {
      const [, lo, hi] = BANDS.find(([b]) => b === i.band)!;
      expect(i.similarity >= lo && i.similarity < hi).toBe(true);
    }
  });

  it("is the same for the same seed and shuffles themes together", () => {
    expect(buildSample(fakeExport())).toEqual(items);
    expect(items.slice(0, 5).map((i) => i.theme)).not.toEqual(Array(5).fill(items[0].theme));
  });

  it("gives the page no similarity or band", () => {
    expect(Object.keys(toPublic(items[0])).sort()).toEqual(["id", "problem", "text", "theme"]);
  });
});

describe("CSV", () => {
  it("writes only answered items and reads the answers back", () => {
    const items = buildSample(fakeExport());
    const answers = { [items[3].id]: true, [items[0].id]: false };
    const csv = toCsv(items, answers);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("item_id,theme,problem,band,similarity,row,review_id,sentence,on_topic");
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith(`${items[0].id},`)).toBe(true); // sample order, not answer order
    expect(csv).toContain('""quoted""'); // quotes inside a sentence are escaped
    expect(readAnswers(csv)).toEqual(answers);
  });

  it("reads nothing from an empty file", () => {
    expect(readAnswers("")).toEqual({});
  });
});
