// Bulk-paste parsing (M-03): a pasted spreadsheet block in, a preview of
// what it would create out. Pure and DOM-free on purpose — the preview the
// captain approves and the payload `rosterEntries.createMany` commits are
// the same array from the same call, so the two can never disagree about
// what a paste meant. There is no undo; this preview is the safety net
// (PRD §6).

import {
  checkRosterName,
  checkRosterNumber,
  rosterSlotKey,
} from "./rules";

// The batch bound, shared with the mutation. A captain pastes ~15 players;
// anything past this is a wrong-clipboard accident, and refusing it beats
// previewing four hundred rows on a phone.
export const ROSTER_PASTE_MAX_ROWS = 200;

export type RosterPasteStatus =
  // Will be created on confirm.
  | "new"
  // Already on this design's roster.
  | "existing"
  // Repeated earlier in this same paste.
  | "duplicate"
  // Didn't parse, or failed the same rules the single-add path applies.
  | "invalid";

export type RosterPasteRow = {
  // 1-based position among the paste's non-blank lines — what the preview
  // labels a row with, so "row 7" means something the captain can find.
  line: number;
  raw: string;
  status: RosterPasteStatus;
  // Best effort: the raw line for a row that didn't parse at all.
  name: string;
  number?: string;
  // User-facing reason, on the excluded statuses only.
  problem?: string;
};

export type RosterPastePlayer = {
  name: string;
  number: string | undefined;
};

export type RosterPasteResult = {
  rows: RosterPasteRow[];
  // Exactly what to send to `createMany` — the rows nothing is wrong with.
  additions: RosterPastePlayer[];
  counts: {
    additions: number;
    existing: number;
    duplicate: number;
    invalid: number;
  };
  // Over the batch bound: nothing is parsed or offered, the UI says so.
  tooManyRows: boolean;
};

const EMPTY_COUNTS = {
  additions: 0,
  existing: 0,
  duplicate: 0,
  invalid: 0,
} as const;

// Digits only — a jersey number is *text* ("01" and "0" are both real), so
// this tests the shape of the string and never coerces it to a Number.
function isNumeric(cell: string): boolean {
  return /^\d+$/.test(cell);
}

// Splits one line into at most a name cell and a number cell. Tabs win over
// commas because that's what Sheets and Excel put on the clipboard, and a
// name may legitimately contain a comma. Falls back to the hand-typed
// single-column shape: everything up to a trailing run of digits is the
// name.
function cellsOf(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : line.includes(",") ? "," : null;
  if (delimiter) {
    // A spreadsheet selection carries the empty columns either side of the
    // two that matter; dropping them keeps the shape without reordering.
    return line
      .split(delimiter)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
  }
  const trailing = /^(.+?)\s+(\d+)$/.exec(line);
  return trailing ? [trailing[1].trim(), trailing[2]] : [line];
}

// Which cell is the name and which is the number. Captains keep the two
// columns in either order, and at ~15 rows a wrong global guess costs more
// than deciding per row does (PRD §6) — so the numeric cell is the number,
// and a row where that's ambiguous falls back to the documented
// Name, Number order.
function readRow(line: number, raw: string): RosterPasteRow {
  const cells = cellsOf(raw);

  if (cells.length > 2)
    return {
      line,
      raw,
      status: "invalid",
      name: raw,
      problem: "Expected a name and a number — this row has more.",
    };

  const [first, second] = cells;
  const reversed = second !== undefined && isNumeric(first) && !isNumeric(second);
  const rawName = reversed ? second : first;
  const rawNumber = reversed ? first : second;

  // A lone number is a row with no player on it — creating a slot named
  // "99" is never what the captain meant.
  if (second === undefined && isNumeric(first))
    return {
      line,
      raw,
      status: "invalid",
      name: raw,
      problem: "This row has a number but no name.",
    };

  const nameCheck = checkRosterName(rawName);
  if (!nameCheck.ok)
    return { line, raw, status: "invalid", name: rawName, problem: nameCheck.error };

  const numberCheck = checkRosterNumber(rawNumber);
  if (!numberCheck.ok)
    return {
      line,
      raw,
      status: "invalid",
      name: nameCheck.value,
      number: rawNumber,
      problem: numberCheck.error,
    };

  return {
    line,
    raw,
    status: "new",
    name: nameCheck.value,
    number: numberCheck.value,
  };
}

// Parse a pasted block against the design's current roster. `existing` is
// the design's slots — matched with the same `rosterSlotKey` the fan-attach
// path uses, so a paste can't create a second slot a future fan order would
// have to choose between.
export function parseRosterPaste(
  text: string,
  existing: readonly { name: string; number?: string }[] = [],
): RosterPasteResult {
  // Real clipboard data arrives with \r\n and trailing empty lines.
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length > ROSTER_PASTE_MAX_ROWS)
    return {
      rows: [],
      additions: [],
      counts: { ...EMPTY_COUNTS },
      tooManyRows: true,
    };

  const existingKeys = new Set(
    existing.map((slot) => rosterSlotKey(slot.name, slot.number)),
  );
  const seen = new Set<string>();

  const rows = lines.map((raw, index) => {
    const row = readRow(index + 1, raw);
    if (row.status !== "new") return row;

    const key = rosterSlotKey(row.name, row.number);
    if (existingKeys.has(key))
      return {
        ...row,
        status: "existing" as const,
        problem: "Already on this roster.",
      };
    if (seen.has(key))
      return {
        ...row,
        status: "duplicate" as const,
        problem: "Repeated earlier in this paste.",
      };
    seen.add(key);
    return row;
  });

  const additions = rows
    .filter((row) => row.status === "new")
    .map(({ name, number }) => ({ name, number }));

  return {
    rows,
    additions,
    counts: {
      additions: additions.length,
      existing: rows.filter((r) => r.status === "existing").length,
      duplicate: rows.filter((r) => r.status === "duplicate").length,
      invalid: rows.filter((r) => r.status === "invalid").length,
    },
    tooManyRows: false,
  };
}
