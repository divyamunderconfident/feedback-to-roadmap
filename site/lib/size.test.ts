import { describe, expect, it } from "vitest";
import { sizeTheme } from "./size";

// 10 reviews; row 9 has no text.
const hasText = [...Array(9).fill(true), false];

describe("sizeTheme", () => {
  it("counts sentences, distinct reviews and share of reviews with text", () => {
    const s = sizeTheme([0, 0, 1, 2], 4, { hasText });
    expect(s).toMatchObject({ sentences: 4, reviews: 3, share: 3 / 9 });
  });

  it("averages ratings of the theme's reviews, skipping empty ones", () => {
    const rating = [5, 1, null, 4, 4, 4, 4, 4, 4, null];
    expect(sizeTheme([0, 1, 2], 3, { hasText, rating }).avgRating).toBe(3);
    expect(sizeTheme([2], 1, { hasText, rating }).avgRating).toBeNull();
    expect(sizeTheme([0], 1, { hasText }).avgRating).toBeNull();
  });

  it("lists the top 3 segments by reviews", () => {
    const segment = ["a", "a", "b", "b", "b", "c", "d", "", "a", "a"];
    expect(sizeTheme([0, 1, 2, 3, 4, 5, 6, 7], 8, { hasText, segment }).segments).toEqual([
      ["b", 3],
      ["a", 2],
      ["c", 1],
    ]);
  });

  it("shows no trend without a date column or with too few dated reviews", () => {
    expect(sizeTheme([0], 1, { hasText }).trend).toBeNull();
    expect(sizeTheme([0], 1, { hasText, date: Array(10).fill(1) }).trend).toBeNull(); // only 9 dated reviews
  });

  it("compares the theme's share of reviews before and from the median date", () => {
    // 40 reviews with text, dates 0..39; median is 20. The theme has 2 early reviews and 8 late ones.
    const h = Array(40).fill(true);
    const date = Array.from({ length: 40 }, (_, i) => i);
    const rows = [0, 1, 20, 21, 22, 23, 24, 25, 26, 27];
    expect(sizeTheme(rows, 10, { hasText: h, date }).trend).toEqual({ before: 2 / 20, after: 8 / 20 });
  });
});
