// The captain's per-design list export (M-08, retargeted by L-03). Pure — it
// takes the very `ItemView[]` the order list renders for that design
// (`orderItems.listForOrder`), so the list and the download cannot disagree
// about what is on a design.
//
// The one real transformation is **expansion**. The list shows an item's
// quantity as "×3" because a captain reading a screen wants it short. A CSV is
// read by whoever is making the garments, so it goes the other way: one row
// per jersey, three identical rows for that item. Every row of this file is a
// thing to produce.

import { toCsv, csvSlug, isoDate } from "./csv";
import { jerseyLabel } from "./jerseyBreakdown";
import { sortSizes } from "./jerseyRun";
import type { ItemView } from "./orderItem/summary";
import { ROSTER_DESIGNATION_LABEL } from "./rosterEntry/rules";

// Alphabetical is the default — a captain checking the file against the team
// list scans for names. By size is the cut list: the same rows regrouped for
// whoever is pulling stock.
export const ROSTER_EXPORT_ORDERS = ["name", "size"] as const;
export type RosterExportOrder = (typeof ROSTER_EXPORT_ORDERS)[number];

const HEADERS = ["Name", "Number", "Role", "Size"];

type ExportItem = Pick<
  ItemView,
  "name" | "number" | "designation" | "size" | "qty"
>;

// One garment. `size` is "" for an item that still needs one — it stays in
// the file, because a captain uses it to see who still owes a size, and a
// missing row can't say that.
type ExportRecord = {
  name: string;
  number: string;
  // "Captain" / "Assistant captain" / "" (M-09). Spelled out rather than left
  // as the stored letter: this file is read by whoever makes the garments, and
  // they have no key to a one-character code.
  role: string;
  size: string;
  label: string;
  // No name and no number: a bulk line.
  blank: boolean;
};

function expand(items: readonly ExportItem[]): ExportRecord[] {
  return items.flatMap((item) => {
    const record: ExportRecord = {
      name: item.name ?? "",
      number: item.number ?? "",
      role: item.designation ? ROSTER_DESIGNATION_LABEL[item.designation] : "",
      size: item.size ?? "",
      label: jerseyLabel(item.name, item.number),
      blank: !item.name && !item.number,
    };
    return Array.from({ length: item.qty }, () => record);
  });
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

// Within one player, sizes in catalog order, so their rows read S → M → L
// under *either* ordering. Stable sort keeps everything else as it was.
function bySizeRank(rank: Map<string, number>) {
  return (a: ExportRecord, b: ExportRecord) =>
    (rank.get(a.size) ?? rank.size) - (rank.get(b.size) ?? rank.size);
}

function sortRecords(
  records: ExportRecord[],
  order: RosterExportOrder,
): ExportRecord[] {
  // Catalog order for every size present, with the sizeless rows — the items
  // that still need a size — ranked after all of them.
  const rank = new Map(
    sortSizes([...new Set(records.map((r) => r.size).filter(Boolean))]).map(
      (size, index) => [size, index] as const,
    ),
  );
  const sizeOrder = bySizeRank(rank);

  if (order === "name") {
    return records.sort(
      (a, b) => blanksLast(a, b) || byLabel(a, b) || sizeOrder(a, b),
    );
  }

  // Size groups in catalog order, Needs-size rows trailing every group: they
  // have no size to file under, and putting them last keeps the top of the
  // file a clean cut list.
  return records.sort(
    (a, b) => sizeOrder(a, b) || blanksLast(a, b) || byLabel(a, b),
  );
}

// Header plus one row per jersey. Exported alongside `buildRosterCsv` so the
// shaping can be asserted as data rather than by parsing a string back.
export function rosterExportRows(
  items: readonly ExportItem[],
  order: RosterExportOrder,
): string[][] {
  return [
    HEADERS,
    ...sortRecords(expand(items), order).map((r) => [
      r.name,
      r.number,
      r.role,
      r.size,
    ]),
  ];
}

export function buildRosterCsv(
  items: readonly ExportItem[],
  order: RosterExportOrder,
): string {
  return toCsv(rosterExportRows(items, order));
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
