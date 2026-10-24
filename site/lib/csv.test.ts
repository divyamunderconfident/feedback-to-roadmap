import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_ROWS, parseCsv } from "./csv";

const csvWithRows = (n: number) =>
  "id,text\n" + Array.from({ length: n }, (_, i) => `${i},review ${i}`).join("\n");

describe("parseCsv", () => {
  it("reads columns and rows by header", () => {
    const { columns, rows, capped } = parseCsv("id,text,rating\n1,Great app,5\n2,Crashes,1\n");
    expect(columns).toEqual(["id", "text", "rating"]);
    expect(rows).toEqual([
      { id: "1", text: "Great app", rating: "5" },
      { id: "2", text: "Crashes", rating: "1" },
    ]);
    expect(capped).toBe(false);
  });

  it("keeps commas, quotes and newlines inside quoted fields", () => {
    const { rows } = parseCsv('id,text\n1,"Slow, buggy\nand ""meh"""\n');
    expect(rows[0].text).toBe('Slow, buggy\nand "meh"');
  });

  it("ignores a byte-order mark and blank lines", () => {
    const { columns, rows } = parseCsv("﻿id,text\n1,a\n\n2,b\n");
    expect(columns).toEqual(["id", "text"]);
    expect(rows).toHaveLength(2);
  });

  it("rejects a file with no header", () => {
    expect(() => parseCsv("")).toThrow(/no header/);
  });

  it("keeps exactly MAX_ROWS rows without a warning", () => {
    const { rows, capped } = parseCsv(csvWithRows(MAX_ROWS));
    expect(rows).toHaveLength(MAX_ROWS);
    expect(capped).toBe(false);
  });

  it("caps files over MAX_ROWS to the first MAX_ROWS rows", () => {
    const { rows, capped } = parseCsv(csvWithRows(MAX_ROWS + 1));
    expect(rows).toHaveLength(MAX_ROWS);
    expect(rows.at(-1)?.id).toBe(String(MAX_ROWS - 1));
    expect(capped).toBe(true);
  });

  it("parses the demo file in full", () => {
    const { columns, rows, capped } = parseCsv(readFileSync("public/demo_reviews.csv", "utf8"));
    expect(columns).toEqual(["id", "domain", "app", "title", "text", "rating"]);
    expect(rows).toHaveLength(3542);
    expect(capped).toBe(false);
  });
});
