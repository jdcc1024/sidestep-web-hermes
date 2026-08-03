// The captain's per-design roster export (M-08). Pure — it takes the very
// `RosterRow[]` the design card is already rendering (M-01's read, via
// `rosterRowsByDesign`) and shapes it into the file, so the card and the
// download cannot disagree about who is on a design.
//
// The one real transformation is **expansion**. The card collapses repeats
// into a chip — "L ×3" — because a captain reading a screen wants the roster
// short. A CSV is read by whoever is making the garments, so it goes the
// other way: one row per jersey, three identical rows for that chip. Every
// row of this file is a thing to produce.

import { toCsv, csvSlug, isoDate } from "./csv";
import type { RosterRow } from "./jerseyBreakdown";
import { sortSizes } from "./jerseyRun";
import { ROSTER_DESIGNATION_LABEL } from "./rosterEntry/rules";

// Alphabetical is the default — a captain checking the file against the team
// list scans for names. By size is the cut list: the same rows regrouped for
// whoever is pulling stock.
export const ROSTER_EXPORT_ORDERS = ["name", "size"] as const;
export type RosterExportOrder = (typeof ROSTER_EXPORT_ORDERS)[number];

export const ROSTER_EXPORT_ORDER_LABEL: Record<RosterExportOrder, string> = {
  name: "Sorted by name",
  size: "Grouped by size",
};

const HEADERS = ["Name", "Number", "Role", "Size"];

// One garment (or one unfilled slot). `size` is "" for a seeded player nobody
// has ordered for yet — they stay in the file, because a captain uses it to
// see who still owes a size, and a missing row can't say that.
type ExportRecord = {
  name: string;
  number: string;
  // "Captain" / "Assistant captain" / "" (M-09). Spelled out rather than left
  // as the stored letter: this file is read by whoever makes the garments, and
  // they have no key to a one-character code.
  role: string;
  size: string;
  label: string;
  blank: boolean;
};

function expand(rows: readonly RosterRow[]): ExportRecord[] {
  const records: ExportRecord[] = [];

  for (const row of rows) {
    const base = {
      name: row.blank ? "" : (row.name ?? ""),
      number: row.blank ? "" : (row.number ?? ""),
      role: row.designation ? ROSTER_DESIGNATION_LABEL[row.designation] : "",
      label: row.label,
      blank: row.blank,
    };

    if (row.sizes.length === 0) {
      records.push({ ...base, size: "" });
      continue;
    }

    // Canonical size order here rather than at sort time, so a player's own
    // rows read S → M → L under *either* ordering.
    const bySize = new Map(row.sizes.map((s) => [s.size, s.qty] as const));
    for (const size of sortSizes(row.sizes.map((s) => s.size))) {
      for (let i = 0; i < (bySize.get(size) ?? 0); i++) {
        records.push({ ...base, size });
      }
    }
  }

  return records;
}

function byLabel(a: ExportRecord, b: ExportRecord): number {
  // `numeric` so "Player 2" precedes "Player 10", `base` sensitivity so a
  // lowercase entry doesn't sort into its own block after Z.
  return a.label.localeCompare(b.label, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

// Blanks are jerseys nobody's name is on, so they read as a tail rather than
// sorting under whatever their empty label would collate as.
function blanksLast(a: ExportRecord, b: ExportRecord): number {
  if (a.blank !== b.blank) return a.blank ? 1 : -1;
  return 0;
}

function sortRecords(
  records: ExportRecord[],
  order: RosterExportOrder,
): ExportRecord[] {
  if (order === "name") {
    return records.sort((a, b) => blanksLast(a, b) || byLabel(a, b));
  }

  // Size groups in catalog order, with the sizeless rows — the unfilled slots
  // — trailing every group. They have no size to file under, and putting them
  // last keeps the top of the file a clean cut list.
  const rank = new Map(
    sortSizes([...new Set(records.map((r) => r.size).filter(Boolean))]).map(
      (size, index) => [size, index] as const,
    ),
  );
  const groupOf = (r: ExportRecord) =>
    r.size ? (rank.get(r.size) ?? 0) : rank.size;

  return records.sort(
    (a, b) =>
      groupOf(a) - groupOf(b) || blanksLast(a, b) || byLabel(a, b),
  );
}

// Header plus one row per jersey. Exported alongside `buildRosterCsv` so the
// shaping can be asserted as data rather than by parsing a string back.
export function rosterExportRows(
  rows: readonly RosterRow[],
  order: RosterExportOrder,
): string[][] {
  return [
    HEADERS,
    ...sortRecords(expand(rows), order).map((r) => [
      r.name,
      r.number,
      r.role,
      r.size,
    ]),
  ];
}

export function buildRosterCsv(
  rows: readonly RosterRow[],
  order: RosterExportOrder,
): string {
  return toCsv(rosterExportRows(rows, order));
}

// Team *and* design, because "home-kit" alone collides in a downloads folder
// the moment a captain runs two teams — and the design title is often just
// "Home".
export function rosterExportFilename(
  teamName: string,
  designTitle: string,
  date: number,
): string {
  const slug =
    [csvSlug(teamName), csvSlug(designTitle)].filter(Boolean).join("-") ||
    "design";
  return `sidestep-roster-${slug}-${isoDate(date)}.csv`;
}
