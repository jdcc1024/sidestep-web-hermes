// Bulk-paste parsing (M-03, sizes and repeats L-04): a pasted spreadsheet
// block in, a preview of what it would add out. Pure and DOM-free on purpose
// — the preview the captain approves and the payload `orderItems.addMany`
// commits are the same array from the same call, so the two can never
// disagree about what a paste meant. There is no undo; this preview is the
// safety net (PRD §6).

import { SIZE_OPTIONS, type SizeOption } from "../orderForm/rules";
import {
  checkRosterName,
  checkRosterNumber,
  playerKey,
} from "../rosterEntry/rules";

// The batch bound, shared with the mutation. A captain pastes ~15 players;
// anything past this is a wrong-clipboard accident, and refusing it beats
// previewing four hundred rows on a phone.
export const ROSTER_PASTE_MAX_ROWS = 200;

export type RosterPasteStatus =
  // Will be added on confirm — repeats included (JCC Q7), with a note.
  | "new"
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
  // Undefined is Needs size — no size column, or one we don't make.
  size?: SizeOption;
  // Something worth a second look on a row that is still added: a repeat,
  // or a size we don't make. Never on an invalid row.
  note?: string;
  // Why an invalid row is left out.
  problem?: string;
};

export type RosterPastePlayer = {
  name: string;
  number: string | undefined;
  size?: SizeOption;
};

export type RosterPasteResult = {
  rows: RosterPasteRow[];
  // Exactly what to send to `addMany` — every row that isn't invalid.
  additions: RosterPastePlayer[];
  counts: {
    additions: number;
    // Additions matching a live item, or an earlier row of this paste.
    repeats: number;
    // Additions with no size.
    needSize: number;
    invalid: number;
  };
  // Over the batch bound: nothing is parsed or offered, the UI says so.
  tooManyRows: boolean;
};

const EMPTY_COUNTS = {
  additions: 0,
  repeats: 0,
  needSize: 0,
  invalid: 0,
} as const;

// Digits only — a jersey number is *text* ("01" and "0" are both real), so
// this tests the shape of the string and never coerces it to a Number.
function isNumeric(cell: string): boolean {
  return /^\d+$/.test(cell);
}

// A size cell as a catalogue size, or undefined. Spreadsheets spell 2XL as
// XXL often enough that it's worth reading.
function sizeOf(cell: string): SizeOption | undefined {
  const upper = cell.trim().toUpperCase();
  const size = upper === "XXL" ? "2XL" : upper;
  return (SIZE_OPTIONS as readonly string[]).includes(size)
    ? (size as SizeOption)
    : undefined;
}

// Splits one line into its cells. Tabs win over commas because that's what
// Sheets and Excel put on the clipboard, and a name may legitimately contain
// a comma. Falls back to the hand-typed single-column shape: everything up
// to a trailing run of digits is the name.
function cellsOf(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : line.includes(",") ? "," : null;
  if (delimiter) {
    // A spreadsheet selection carries the empty columns either side of the
    // ones that matter; dropping them keeps the shape without reordering.
    return line
      .split(delimiter)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
  }
  const trailing = /^(.+?)\s+(\d+)$/.exec(line);
  return trailing ? [trailing[1].trim(), trailing[2]] : [line];
}

// With three cells, which one is the size: the one that reads as a size,
// preferring the documented third column. When none does, it's a size we
// don't make — the row is still added, as Needs size (§7.7) — and the cell
// is the last non-numeric one, since the name and number are the other two.
function splitSize(cells: string[]): {
  rest: string[];
  size?: SizeOption;
  unknownSize?: string;
} {
  if (cells.length < 3) return { rest: cells };
  const without = (at: number) => cells.filter((_, i) => i !== at);

  const at = [2, 1, 0].find((i) => sizeOf(cells[i]) !== undefined);
  if (at !== undefined) return { rest: without(at), size: sizeOf(cells[at]) };

  const words = [0, 1, 2].filter((i) => !isNumeric(cells[i]));
  const unknown = words.length >= 2 ? words[words.length - 1] : 2;
  return { rest: without(unknown), unknownSize: cells[unknown] };
}

// Which cell is the name and which is the number. Captains keep the columns
// in any order, and at ~15 rows a wrong global guess costs more than deciding
// per row does (PRD §6) — so the numeric cell is the number, and a row where
// that's ambiguous falls back to the documented Name, Number order.
function readRow(line: number, raw: string): RosterPasteRow {
  const cells = cellsOf(raw);

  if (cells.length > 3)
    return {
      line,
      raw,
      status: "invalid",
      name: raw,
      problem: "Expected a name, a number and a size — this row has more.",
    };

  const { rest, size, unknownSize } = splitSize(cells);
  const [first, second] = rest;
  const reversed = second !== undefined && isNumeric(first) && !isNumeric(second);
  const rawName = reversed ? second : first;
  const rawNumber = reversed ? first : second;

  // A lone number is a row with no player on it — adding an item named "99"
  // is never what the captain meant.
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
    ...(size && { size }),
    ...(unknownSize !== undefined && {
      note: `Row ${line}: "${unknownSize}" isn't a size we make — added as Needs size.`,
    }),
  };
}

// The same player key the rest of the list uses, which reads runs of spaces
// as one: "Jordan  Lee" pasted from a sloppy sheet is still Jordan Lee.
function repeatKey(name: string, number: string | undefined): string {
  return playerKey({ name, number });
}

function playerLabel(name: string, number: string | undefined): string {
  return number ? `${name} #${number}` : name;
}

// Parse a pasted block against the design's current items. A row matching
// one of `existing` (or an earlier row) is still added — the same name twice
// can be two jerseys (JCC Q7) — but the preview says so, so the captain can
// catch a paste they've already done.
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
    existing.map((item) => repeatKey(item.name, item.number)),
  );
  const seen = new Set<string>();
  let repeats = 0;

  const rows = lines.map((raw, index): RosterPasteRow => {
    const row = readRow(index + 1, raw);
    if (row.status !== "new") return row;

    const key = repeatKey(row.name, row.number);
    const label = playerLabel(row.name, row.number);
    const repeat = existingKeys.has(key)
      ? `${label} is already on the list — adds another.`
      : seen.has(key)
        ? `${label} is in this paste twice — adds both.`
        : undefined;
    seen.add(key);
    if (!repeat) return row;
    repeats += 1;
    return { ...row, note: row.note ? `${repeat} ${row.note}` : repeat };
  });

  const additions = rows
    .filter((row) => row.status === "new")
    .map(({ name, number, size }) => ({ name, number, size }));

  return {
    rows,
    additions,
    counts: {
      additions: additions.length,
      repeats,
      needSize: additions.filter((a) => a.size === undefined).length,
      invalid: rows.length - additions.length,
    },
    tooManyRows: false,
  };
}
