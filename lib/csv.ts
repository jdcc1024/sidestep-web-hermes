// The CSV primitives both exports share: the admin order export (3-03) and
// the captain's per-design roster export (M-08). Serialization, filename
// slugging, and the browser download all live here rather than in either
// feature — the formula-injection guard below is a security control, and a
// security control with two copies eventually has one copy that's wrong.
//
// Pure except for `downloadCsv`, which is the one DOM-touching function.

// Leading characters a spreadsheet treats as the start of a formula. Both
// exports carry attacker-controllable text (the public fan form is open to
// the internet: player names, custom answers) into a file someone opens in
// Excel and trusts — so neutralize with a leading apostrophe, which
// spreadsheets strip on display but which stops evaluation.
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function escapeCell(value: string): string {
  const guarded = FORMULA_PREFIXES.some((p) => value.startsWith(p))
    ? `'${value}`
    : value;
  return /[",\r\n']/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

// RFC 4180: CRLF row terminators, quotes doubled inside quoted fields.
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

// ISO date, not a locale format — the file crosses machines and a supplier
// reading 07/08 has no way to know which half is the month.
export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// A filename-safe slug of arbitrary user text. Empty (or all-punctuation)
// input returns "" so the caller can substitute its own fallback word.
export function csvSlug(value: string): string {
  return (
    value
      .toLowerCase()
      // Apostrophes vanish rather than becoming separators, so "O'Brien's"
      // reads as one word instead of three.
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

// U+FEFF. Excel assumes the system codepage for a bare CSV, which mangles
// accented names in a file meant for a supplier; a BOM pins it to UTF-8.
export const CSV_BOM = "﻿";

// Hand the browser a finished CSV as a download. Assembled client-side from a
// Blob rather than served by a route handler: authorization for both exports
// already lives in Convex, so routing the bytes through Next would mean a
// second, weaker gate over the same data.
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([CSV_BOM, csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
