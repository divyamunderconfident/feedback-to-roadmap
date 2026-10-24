import Papa from "papaparse";

export const MAX_ROWS = 5000;

export type ParsedCsv = {
  columns: string[];
  rows: Record<string, string>[];
  capped: boolean; // the file had more than MAX_ROWS rows; only the first MAX_ROWS are kept
};

export function parseCsv(text: string): ParsedCsv {
  // Parse one row past the cap so we know whether the file was cut, without reading the rest.
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    preview: MAX_ROWS + 1,
  });
  const columns = (result.meta.fields ?? []).filter((c) => c.trim() !== "");
  if (columns.length === 0) throw new Error("The file has no header row.");
  return {
    columns,
    rows: result.data.slice(0, MAX_ROWS),
    capped: result.data.length > MAX_ROWS,
  };
}
