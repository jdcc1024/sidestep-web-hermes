// Bulk-paste parsing (M-03, sizes L-04, grouped by player R2-04): a pasted
// spreadsheet block in, the players it would add out. Pure and DOM-free on
// purpose — the preview the captain approves and the payload
// `rosterEntries.addMany` commits come from the same call, so the two can
// never disagree about what a paste meant. There is no undo; this preview is
// the safety net (PRD §6).
//
// Columns are name, number, size and an optional "how many" after the size.
// Rows naming the same player (`playerKey`) become one player whose sizes are
// summed, so "Sidestep 72 S / Sidestep 72 M 3 / Sidestep 72 XL" is one
// Sidestep #72 with S×1, M×3, XL×1. A player already on the design is "updated":
// the paste adds its sizes to that player (the server resolves the match
// again on commit, so the preview is advisory, R2-01).

import { SIZE_OPTIONS, type SizeOption } from "../orderForm/rules";
import { checkQty, MAX_QTY } from "../orderEntry/rules";
import {
  checkRosterName,
  checkRosterNumber,
  playerKey,
} from "../rosterEntry/rules";
import { sizeQtyText } from "./label";

// The batch bound, shared with the mutation. A captain pastes ~15 players;
// anything past this is a wrong-clipboard accident, and refusing it beats
// previewing four hundred rows on a phone. It bounds raw rows, before
// grouping.
export const ROSTER_PASTE_MAX_ROWS = 200;

export type RosterPasteStatus =
  // Its player isn't on the design yet; confirm creates it.
  | "new"
  // Its player is already on the design; confirm adds the sizes to it.
  | "updated"
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
  // The size this row adds, and how many. Undefined when there's no size
  // column or it's a size we don't make — the row then adds no line.
  size?: SizeOption;
  qty?: number;
  // Something worth a second look on a row that is still valid: a size we
  // don't make, or a player already on the list. Never on an invalid row.
  note?: string;
  // Why an invalid row is left out.
  problem?: string;
};

export type RosterPasteSize = { size: SizeOption; qty: number };

// What goes to `addMany`, one per player with something to send.
export type RosterPastePlayer = {
  name: string;
  number: string | undefined;
  sizes: RosterPasteSize[];
};

// One preview item per player (including a matched player with nothing to
// add, which isn't in `players`) and one per invalid row, ordered by first
// line, so the captain reads the preview in the order they pasted.
export type RosterPastePreview =
  | {
      kind: "player";
      key: string;
      name: string;
      number: string | undefined;
      // "updated" with no `sizes` is a match that adds nothing.
      status: "new" | "updated";
      // What this paste adds, not what the player will end up with.
      sizes: RosterPasteSize[];
      lines: number[];
      notes: string[];
    }
  | { kind: "invalid"; row: RosterPasteRow };

export type RosterPasteResult = {
  rows: RosterPasteRow[];
  // Exactly what to send to `addMany`.
  players: RosterPastePlayer[];
  preview: RosterPastePreview[];
  counts: {
    // New players (with or without sizes).
    added: number;
    // Players already on the design that this paste adds sizes to.
    updated: number;
    // Σ qty across `players`.
    jerseys: number;
    // New players with no size lines.
    needSize: number;
    invalid: number;
  };
  // Over the batch bound: nothing is parsed or offered, the UI says so.
  tooManyRows: boolean;
};

export type RosterPasteExisting = {
  name: string;
  number?: string;
  sizes?: readonly { size: string; qty?: number }[];
};

const EMPTY_COUNTS = {
  added: 0,
  updated: 0,
  jerseys: 0,
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
// don't make — the row is kept but adds no line — and the cell is the last
// non-numeric one, since the name and number are the other two.
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

// The "how many" cell, by the same rule as a quantity anywhere else
// (`checkQty`). Digits only first, so "2.5", "-1" and "1e2" never coerce.
function howManyOf(cell: string): number | undefined {
  if (!isNumeric(cell)) return undefined;
  const check = checkQty(Number(cell));
  return check.ok ? check.value : undefined;
}

type ReadRow = RosterPasteRow & { unknownSize?: string };

// Which cell is the name and which is the number. Captains keep the columns
// in any order, and at ~15 rows a wrong global guess costs more than deciding
// per row does (PRD §6) — so the numeric cell is the number, and a row where
// that's ambiguous falls back to the documented Name, Number order.
function readRow(line: number, raw: string): ReadRow {
  const cells = cellsOf(raw);
  const invalid = (problem: string, name = raw, number?: string): ReadRow => ({
    line,
    raw,
    status: "invalid",
    name,
    ...(number !== undefined && { number }),
    problem,
  });

  if (cells.length > 4)
    return invalid(
      "Expected a name, a number, a size and how many. This row has more.",
    );

  // The fourth cell is always "how many": it comes after the size.
  let qty = 1;
  if (cells.length === 4) {
    const howMany = howManyOf(cells[3]);
    if (howMany === undefined)
      return invalid(
        `"How many" should be a whole number from 1 to ${MAX_QTY}, not "${cells[3]}".`,
      );
    qty = howMany;
  }

  const { rest, size, unknownSize } = splitSize(cells.slice(0, 3));
  const [first, second] = rest;
  const reversed = second !== undefined && isNumeric(first) && !isNumeric(second);
  const rawName = reversed ? second : first;
  const rawNumber = reversed ? first : second;

  // A lone number is a row with no player on it — adding a player named "99"
  // is never what the captain meant.
  if (second === undefined && isNumeric(first))
    return invalid("This row has a number but no name.");

  const nameCheck = checkRosterName(rawName);
  if (!nameCheck.ok) return invalid(nameCheck.error, rawName);

  const numberCheck = checkRosterNumber(rawNumber);
  if (!numberCheck.ok)
    return invalid(numberCheck.error, nameCheck.value, rawNumber);

  return {
    line,
    raw,
    status: "new",
    name: nameCheck.value,
    number: numberCheck.value,
    ...(size && { size, qty }),
    ...(unknownSize !== undefined && { unknownSize }),
  };
}

// "an L", "an XS", "a 2XL": the letter sizes are said as letters.
function withArticle(size: string): string {
  return /^[SMLX]/.test(size) ? `an ${size}` : `a ${size}`;
}

function sizesText(sizes: readonly { size: string; qty: number }[]): string {
  return sizes.map(sizeQtyText).join(", ");
}

// UX §7: `Already on your list with M×1, XL×1. Adds an L.`
function matchNote(
  existingSizes: readonly { size: string; qty: number }[],
  adds: readonly RosterPasteSize[],
): string {
  if (adds.length === 0) return "Already on your list. Nothing to add.";
  const already =
    existingSizes.length > 0
      ? `Already on your list with ${sizesText(existingSizes)}.`
      : "Already on your list.";
  const added =
    adds.length === 1 && adds[0].qty === 1
      ? withArticle(adds[0].size)
      : sizesText(adds);
  return `${already} Adds ${added}.`;
}

type Group = {
  key: string;
  name: string;
  number: string | undefined;
  rows: ReadRow[];
  sizes: RosterPasteSize[];
  existingSizes?: { size: string; qty: number }[];
};

// Parse a pasted block against the design's current players. Rows group by
// player; a player matching one of `existing` adds its sizes to that player
// rather than becoming a second one.
export function parseRosterPaste(
  text: string,
  existing: readonly RosterPasteExisting[] = [],
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
      players: [],
      preview: [],
      counts: { ...EMPTY_COUNTS },
      tooManyRows: true,
    };

  const existingSizes = new Map<string, { size: string; qty: number }[]>();
  for (const player of existing) {
    const key = playerKey(player);
    const sizes = existingSizes.get(key) ?? [];
    for (const { size, qty = 1 } of player.sizes ?? []) {
      const line = sizes.find((s) => s.size === size);
      if (line) line.qty += qty;
      else sizes.push({ size, qty });
    }
    existingSizes.set(key, sizes);
  }

  const groups = new Map<string, Group>();
  const rows: ReadRow[] = lines.map((raw, index) => {
    const row = readRow(index + 1, raw);
    if (row.status === "invalid") return row;

    const key = playerKey(row);
    const group = groups.get(key) ?? {
      key,
      name: row.name,
      number: row.number,
      rows: [],
      sizes: [],
      existingSizes: existingSizes.get(key),
    };

    if (row.size && row.qty) {
      const line = group.sizes.find((s) => s.size === row.size);
      const before =
        (line?.qty ?? 0) +
        (group.existingSizes?.find((s) => s.size === row.size)?.qty ?? 0);
      // The server refuses the whole paste past MAX_QTY of one size on one
      // player; catching it here leaves the rest of the paste committable.
      if (before + row.qty > MAX_QTY)
        return {
          ...row,
          status: "invalid",
          problem: `That makes more than ${MAX_QTY} ${row.size} for this player.`,
        };
      if (line) line.qty += row.qty;
      else group.sizes.push({ size: row.size, qty: row.qty });
    }

    group.rows.push(row);
    groups.set(key, group);
    return row;
  });

  const unknownNote = (row: ReadRow) =>
    row.unknownSize === undefined
      ? undefined
      : `Row ${row.line}: "${row.unknownSize}" isn't a size we make. Nothing added for this row.`;

  // Second pass, now that each player's whole paste is known: a matched
  // player's rows are "updated" and carry the player's match note.
  const notesByGroup = new Map<string, string | undefined>();
  for (const group of groups.values())
    notesByGroup.set(
      group.key,
      group.existingSizes && matchNote(group.existingSizes, group.sizes),
    );

  const finalRows: RosterPasteRow[] = rows.map(({ unknownSize, ...row }) => {
    if (row.status === "invalid") return row;
    const key = playerKey(row);
    const matched = groups.get(key)!.existingSizes !== undefined;
    const note = [notesByGroup.get(key), unknownNote({ ...row, unknownSize })]
      .filter(Boolean)
      .join(" ");
    return {
      ...row,
      status: matched ? "updated" : "new",
      ...(note && { note }),
    };
  });

  const players: RosterPastePlayer[] = [];
  // Paired with each item's first line, to interleave invalid rows in order.
  const preview: [first: number, item: RosterPastePreview][] = [];
  let added = 0;
  let updated = 0;
  let needSize = 0;
  for (const group of groups.values()) {
    const matched = group.existingSizes !== undefined;
    const notes = [
      group.rows.length > 1 ? `${group.rows.length} rows, one player.` : null,
      notesByGroup.get(group.key) ?? null,
      ...group.rows.map(unknownNote),
    ].filter((note): note is string => Boolean(note));
    preview.push([
      group.rows[0].line,
      {
        kind: "player",
        key: group.key,
        name: group.name,
        number: group.number,
        status: matched ? "updated" : "new",
        sizes: group.sizes,
        lines: group.rows.map((row) => row.line),
        notes,
      },
    ]);

    // A matched player with no sizes has nothing to send.
    if (matched && group.sizes.length === 0) continue;
    players.push({ name: group.name, number: group.number, sizes: group.sizes });
    if (matched) updated += 1;
    else {
      added += 1;
      if (group.sizes.length === 0) needSize += 1;
    }
  }
  for (const row of finalRows)
    if (row.status === "invalid")
      preview.push([row.line, { kind: "invalid", row }]);

  const invalid = finalRows.filter((row) => row.status === "invalid").length;
  return {
    rows: finalRows,
    players,
    preview: preview
      .sort(([a], [b]) => a - b)
      .map(([, item]) => item),
    counts: {
      added,
      updated,
      jerseys: players.reduce(
        (sum, player) =>
          sum + player.sizes.reduce((total, line) => total + line.qty, 0),
        0,
      ),
      needSize,
      invalid,
    },
    tooManyRows: false,
  };
}
