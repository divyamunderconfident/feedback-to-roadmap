import { describe, expect, it } from "vitest";
import { checkColumn, guessMapping, MAX_SEGMENTS } from "./mapping";

describe("guessMapping", () => {
  it("picks columns by name, ignoring case and spaces", () => {
    expect(guessMapping(["id", " Text ", "RATING", "Date", "Segment"])).toEqual({
      text: " Text ",
      rating: "RATING",
      date: "Date",
      segment: "Segment",
    });
  });

  it("uses app as the segment when there is no segment column", () => {
    expect(guessMapping(["id", "domain", "app", "title", "text", "rating"])).toEqual({
      text: "text",
      rating: "rating",
      date: "",
      segment: "app",
    });
  });

  it("prefers segment over app", () => {
    expect(guessMapping(["text", "app", "segment"]).segment).toBe("segment");
  });

  it("falls back to the first column for text and none for the rest", () => {
    expect(guessMapping(["comment", "score"])).toEqual({ text: "comment", rating: "", date: "", segment: "" });
  });
});

const repeat = (value: string, n: number) => Array(n).fill(value);

describe("checkColumn: text", () => {
  it("passes when at least 90% of rows have text", () => {
    expect(checkColumn("text", [...repeat("great app", 9), ""]).ok).toBe(true);
  });

  it("fails when too many rows are empty or blank", () => {
    const check = checkColumn("text", [...repeat("great app", 8), "", "   "]);
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/80%/);
  });

  it("fails on no rows", () => {
    expect(checkColumn("text", []).ok).toBe(false);
  });
});

describe("checkColumn: rating", () => {
  it("passes whole and decimal ratings from 1 to 5, ignoring empty cells", () => {
    expect(checkColumn("rating", ["1", "5", "3.5", "", " 4 "]).ok).toBe(true);
  });

  it("fails on values outside 1 to 5 or not numbers, and counts them", () => {
    const check = checkColumn("rating", ["0", "6", "five", "4"]);
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/^3 values/);
  });

  it("fails on an empty column", () => {
    expect(checkColumn("rating", ["", ""]).ok).toBe(false);
  });
});

describe("checkColumn: date", () => {
  it("passes ISO dates and times", () => {
    expect(checkColumn("date", ["2026-10-24", "2026-01-31T09:30:00Z", ""]).ok).toBe(true);
  });

  it("fails on values that are not dates", () => {
    const check = checkColumn("date", ["2026-10-24", "yesterday", "5 stars"]);
    expect(check.ok).toBe(false);
    expect(check.message).toMatch(/^2 values/);
  });

  it("fails on bare numbers, which Date.parse would accept", () => {
    expect(checkColumn("date", ["5", "3", "1"]).ok).toBe(false);
  });

  it("uses the singular for one bad value", () => {
    expect(checkColumn("date", ["2026-10-24", "soon"]).message).toBe("1 value can't be read as a date.");
  });
});

describe("checkColumn: segment", () => {
  it("passes with fewer than 50 distinct values", () => {
    const values = Array.from({ length: 200 }, (_, i) => `app ${i % (MAX_SEGMENTS - 1)}`);
    const check = checkColumn("segment", values);
    expect(check.ok).toBe(true);
    expect(check.message).toBe("49 segments.");
  });

  it("fails with 50 or more distinct values", () => {
    const values = Array.from({ length: MAX_SEGMENTS }, (_, i) => `id ${i}`);
    expect(checkColumn("segment", values).ok).toBe(false);
  });
});
