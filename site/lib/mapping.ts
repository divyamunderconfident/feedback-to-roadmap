export type Field = "text" | "rating" | "date" | "segment";
export type Check = { ok: boolean; message: string };

export const MIN_TEXT_SHARE = 0.9; // "most rows": at least 90% must have text
export const MAX_SEGMENTS = 50;

const pass = (message: string): Check => ({ ok: true, message });
const fail = (message: string): Check => ({ ok: false, message });
const count = (n: number) => (n === 1 ? "1 value" : `${n} values`);

// Checks whether a column's values fit the field it is mapped to. Empty cells are allowed in optional fields.
export function checkColumn(field: Field, values: string[]): Check {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (field === "text") {
    const share = values.length ? filled.length / values.length : 0;
    const pct = `${Math.round(share * 100)}%`;
    return share >= MIN_TEXT_SHARE
      ? pass(`${pct} of rows have text.`)
      : fail(`Only ${pct} of rows have text. Pick a column where most rows have text.`);
  }
  if (filled.length === 0) return fail("This column is empty.");
  if (field === "rating") {
    const bad = filled.filter((v) => !(Number(v) >= 1 && Number(v) <= 5)).length;
    return bad ? fail(`${count(bad)} can't be read as a rating from 1 to 5.`) : pass("All ratings are from 1 to 5.");
  }
  if (field === "date") {
    // Date.parse alone accepts bare numbers like "5", so also require a 4-digit year.
    // shortcut: Date.parse handles ISO dates reliably but other formats vary by browser; add explicit formats if real files need them.
    const bad = filled.filter((v) => !/\d{4}/.test(v) || Number.isNaN(Date.parse(v))).length;
    return bad ? fail(`${count(bad)} can't be read as a date.`) : pass("All values are dates.");
  }
  const distinct = new Set(filled).size;
  return distinct < MAX_SEGMENTS
    ? pass(`${distinct} segments.`)
    : fail(`${distinct} different values. A segment column should have fewer than ${MAX_SEGMENTS}.`);
}
