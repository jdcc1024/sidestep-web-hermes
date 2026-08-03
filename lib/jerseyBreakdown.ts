// Pure derivations over the collected order entries (C-01) — the shapes the
// captain surfaces read the roster with. DOM-free and query-free: every
// consumer hands in whatever `jerseyRuns.listOrderEntries` returned and gets
// back render-ready groups, so the order detail page and the responses page
// (C-02) can't drift on how a roster is grouped, labelled, or tallied.
//
// The unit throughout is Σ **qty**, never row count — one order entry can be
// several jerseys (a bulk blank line), and that's what has to reconcile with
// `orderEntries.countsByRun`.

import { sortSizes } from "./jerseyRun";
import type { DesignMainImage } from "./designAsset";

// The slice of a `listOrderEntries` row these derivations need. Structural,
// not the Convex type, so tests and both pages can pass their own rows.
export type BreakdownEntry = {
  designId: string;
  designTitle: string;
  name?: string;
  number?: string;
  size: string;
  qty: number;
};

// A design as the order carries it. Titles come from here rather than from
// the entries so a design with nothing collected still renders as itself —
// and the same goes for its picture, which `orders.getMyOrder` resolves once
// per design (D-07). Optional because plenty of callers only care about the
// scoping, and a fixture shouldn't have to invent an image.
export type DesignRef = {
  _id: string;
  title: string;
  mainImage?: DesignMainImage | null;
};

// One production line: this player slot, in this size, this many times.
export type RosterLine = {
  // Stable across re-renders — the line's identity is what makes it, not
  // any one entry's id (several entries can merge into one line).
  key: string;
  name?: string;
  number?: string;
  label: string;
  size: string;
  qty: number;
};

export type DesignRoster = {
  designId: string;
  designTitle: string;
  // Null both when the design has no image and when the caller didn't hand
  // one over — a group renders the same placeholder either way.
  mainImage: DesignMainImage | null;
  lines: RosterLine[];
  total: number;
};

export type SizeCount = { size: string; qty: number };

// A collected entry read from the submitter's side (C-02's by-fan view) —
// the same jersey, plus who sent it in.
export type FanEntry = BreakdownEntry & {
  submitterName: string;
  submitterEmail: string;
};

// One jersey as it appears under a fan: the design it's on, then the same
// label/size/qty the roster lines use.
export type FanJersey = {
  key: string;
  designId: string;
  designTitle: string;
  name?: string;
  number?: string;
  label: string;
  size: string;
  qty: number;
};

export type FanGroup = {
  // Normalized — the identity the group is keyed on.
  email: string;
  name: string;
  jerseys: FanJersey[];
  total: number;
};

const BLANK = "Blank";

// The jersey's display identity, matching the responses table verbatim:
// name and number joined, falling back to "Blank" for a bulk/spare jersey
// that legitimately carries no player (PRD §6, "ship as true blanks").
export function jerseyLabel(name?: string, number?: string): string {
  const label = [name?.trim(), number?.trim() ? `#${number.trim()}` : null]
    .filter(Boolean)
    .join(" ");
  return label || BLANK;
}

// Narrow a run's entries to the order's *current* designs. Entries on a
// since-removed design stay in the run (they're the O-08 receipt) but must
// not show up under a linked design or inflate a total — this is the same
// scoping `orderEntries.countsByRun` applies server-side, which is what lets
// these UI numbers reconcile with it.
// Generic in the row so a caller keeps whatever else it was carrying — the
// responses page scopes rows that still need their submitter fields for the
// by-fan view (C-02), and shouldn't have to re-widen the type afterwards.
export function entriesForDesigns<T extends BreakdownEntry>(
  entries: readonly T[],
  designs: readonly DesignRef[],
): T[] {
  const linked = new Set(designs.map((d) => d._id));
  return entries.filter((e) => linked.has(e.designId));
}

// The roster grouped by design, in the order's own design sequence — one
// group per linked design, including designs nobody has ordered yet (an
// empty group, so the caller renders its own "nothing yet" treatment).
//
// Entries that are the same slot in the same size collapse into one line
// with their qty summed: two fans ordering #99 Gretzky in L is two jerseys
// on one production line, not two identical rows a captain has to reconcile
// by eye. No jersey is dropped — `total` is Σ qty over the design's entries.
export function rosterLinesByDesign(
  entries: readonly BreakdownEntry[],
  designs: readonly DesignRef[],
): DesignRoster[] {
  const byDesign = new Map<string, BreakdownEntry[]>(
    designs.map((d) => [d._id, []]),
  );
  for (const entry of entries) byDesign.get(entry.designId)?.push(entry);

  return designs.map((design) => {
    const own = byDesign.get(design._id) ?? [];
    const lines = new Map<string, RosterLine>();

    for (const entry of own) {
      const label = jerseyLabel(entry.name, entry.number);
      // NUL separator: a label can't contain one, so "Ann M" + "L" can't
      // collide with "Ann" + "M L". Written as an escape, not a raw control
      // character — a literal NUL makes git treat this whole file as binary.
      const key = `${label}\u0000${entry.size}`;
      const existing = lines.get(key);
      if (existing) {
        existing.qty += entry.qty;
        continue;
      }
      lines.set(key, {
        key,
        name: entry.name,
        number: entry.number,
        label,
        size: entry.size,
        qty: entry.qty,
      });
    }

    return {
      designId: design._id,
      designTitle: design.title,
      mainImage: design.mainImage ?? null,
      lines: sortLines([...lines.values()]),
      total: own.reduce((sum, e) => sum + e.qty, 0),
    };
  });
}

// Players alphabetically, blanks last, each player's sizes in canonical
// order — a captain scans this list for a name, and the spares belong at the
// bottom rather than sorted under "B".
function sortLines(lines: RosterLine[]): RosterLine[] {
  const sizeRank = new Map(
    sortSizes([...new Set(lines.map((l) => l.size))]).map(
      (size, index) => [size, index] as const,
    ),
  );
  return lines.sort((a, b) => {
    const aBlank = a.label === BLANK;
    const bBlank = b.label === BLANK;
    if (aBlank !== bBlank) return aBlank ? 1 : -1;
    const byLabel = a.label.localeCompare(b.label, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (byLabel !== 0) return byLabel;
    return (sizeRank.get(a.size) ?? 0) - (sizeRank.get(b.size) ?? 0);
  });
}

// ---------------------------------------------------------------------------
// The unified roster (M-01)
//
// Everything above starts from order entries, so it can only ever describe
// jerseys somebody ordered. A captain-seeded player nobody has ordered for is
// invisible to it — which is the disagreement between the order page and the
// roster editor this derivation exists to end. It starts from the *roster*
// instead: `rosterEntries.listForRun` hands over every slot on a design with
// its ordered sizes already summed, plus the design's unattached blank/bulk
// lines, and this turns that into one render-ready list per design.
//
// Same contract as the rest of the file: pure, DOM-free, Σ qty as the unit.
// ---------------------------------------------------------------------------

// One player slot as the read returns it: the seeded name/number, whether
// anyone has ordered against it, and the sizes they ordered.
export type RosterSlotRead = {
  _id: string;
  name: string;
  number?: string;
  source: "captain" | "fan";
  filled: boolean;
  collision: boolean;
  sizes: SizeCount[];
  total: number;
};

// One design's slice of the read. `blankSizes` is the design's jerseys with
// no slot behind them, already summed per size.
export type DesignRosterRead = {
  designId: string;
  title: string;
  entries: RosterSlotRead[];
  blankSizes: SizeCount[];
};

// A row on the card (and, from M-02, in the sheet): a player slot or the
// design's blank line. `filled: false` is the muted "seeded, nothing ordered"
// state — the feedback that was missing before this read existed.
export type RosterRow = {
  key: string;
  label: string;
  // The label's two halves, kept apart as well as joined. The card only ever
  // renders `label`, but the CSV export (M-08) needs Name and Number as their
  // own columns — and re-splitting "Ruiz #7" back out is guesswork the moment
  // a player's name legitimately contains a "#". Both absent on a blank row.
  name?: string;
  number?: string;
  blank: boolean;
  filled: boolean;
  collision: boolean;
  sizes: SizeCount[];
  total: number;
};

export type DesignRosterView = {
  designId: string;
  designTitle: string;
  rows: RosterRow[];
  total: number;
};

// The read, per design, as rows to render. Slots keep the order the query
// handed them over in — creation order, so the card and the editor list the
// same people in the same sequence — with the design's blank line last,
// matching where `rosterLinesByDesign` puts its blanks.
//
// `total` is Σ qty across the rows, which is the same set of order entries
// `orderEntries.countsByRun` sums for the design: unfilled slots contribute
// 0, blank lines contribute their qty.
export function rosterRowsByDesign(
  designs: readonly DesignRosterRead[],
): DesignRosterView[] {
  return designs.map((design) => {
    const rows: RosterRow[] = design.entries.map((slot) => ({
      key: slot._id,
      label: jerseyLabel(slot.name, slot.number),
      name: slot.name,
      number: slot.number,
      blank: false,
      filled: slot.filled,
      collision: slot.collision,
      sizes: slot.sizes,
      total: slot.total,
    }));

    const blankTotal = design.blankSizes.reduce((sum, s) => sum + s.qty, 0);
    if (blankTotal > 0) {
      rows.push({
        // Namespaced so it can't collide with a slot id.
        key: `blank:${design.designId}`,
        label: jerseyLabel(undefined, undefined),
        blank: true,
        // A blank line is a jersey somebody actually asked for, so it reads
        // as filled — there's no unordered blank to be muted about.
        filled: true,
        collision: false,
        sizes: design.blankSizes,
        total: blankTotal,
      });
    }

    return {
      designId: design.designId,
      designTitle: design.title,
      rows,
      total: rows.reduce((sum, row) => sum + row.total, 0),
    };
  });
}

// Match the email the way the submit path persists it
// (`checkSubmitterEmail` trims and lowercases). A fan who typed
// "Sam@Example.com " on one submission and "sam@example.com" on the next is
// one person, and the by-fan view has to read them as one group.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// The run read from the submitter's side (C-02): one group per fan, each
// holding **every jersey they ordered as its own row**. Deliberately no
// collapsing here — unlike `rosterLinesByDesign`, which merges identical
// slots into production lines, this view answers "what did this person ask
// for?", and two identical jerseys on one submission are two things they
// asked for.
//
// Fans come back alphabetically by display name (email as the tie-break) so
// a captain chasing a specific person can scan for them; within a fan the
// jerseys stay in the order the caller handed them over, which is the
// submission order `listOrderEntries` already sorted by.
export function jerseysByFan(entries: readonly FanEntry[]): FanGroup[] {
  const groups = new Map<string, FanGroup>();

  for (const entry of entries) {
    const email = normalizeEmail(entry.submitterEmail);
    let group = groups.get(email);
    if (!group) {
      // First submission wins the display name — the same email under two
      // spellings of a name is one fan, and picking one beats inventing a
      // merged label.
      group = { email, name: entry.submitterName, jerseys: [], total: 0 };
      groups.set(email, group);
    }

    group.jerseys.push({
      key: `${email}:${group.jerseys.length}`,
      designId: entry.designId,
      designTitle: entry.designTitle,
      name: entry.name,
      number: entry.number,
      label: jerseyLabel(entry.name, entry.number),
      size: entry.size,
      qty: entry.qty,
    });
    group.total += entry.qty;
  }

  return [...groups.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return byName !== 0 ? byName : a.email.localeCompare(b.email);
  });
}

// Σ qty per size across whatever entries are handed in — the combined
// breakdown when given the whole roster, one design's breakdown when given
// one design's entries (C-02 reuses it that way). Sizes come back in
// canonical display order; a size nobody ordered isn't listed at all.
export function sizeTally(entries: readonly BreakdownEntry[]): SizeCount[] {
  const qtyBySize = new Map<string, number>();
  for (const entry of entries)
    qtyBySize.set(entry.size, (qtyBySize.get(entry.size) ?? 0) + entry.qty);

  return sortSizes([...qtyBySize.keys()]).map((size) => ({
    size,
    qty: qtyBySize.get(size)!,
  }));
}
