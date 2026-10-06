// The single read model for an order's items (initiative 0004, "Must
// answer 5"). Every surface that counts jerseys — the captain's list, chips
// and footer, the admin page, the exports — reads this, so they can't
// disagree. Pure: the caller loads live items and hands over the order's
// design ids and titles.

import { sortSizes, type NamesMode } from "../orderForm/rules";
import { rosterSlotKey } from "../rosterEntry/rules";

// Generic over the id types so Convex `Id<…>` brands survive into the view.
export type SummaryItem<
  Id extends string = string,
  DesignId extends string = string,
> = {
  _id: Id;
  designId: DesignId;
  name?: string;
  number?: string;
  designation?: "C" | "A";
  size?: string;
  qty: number;
  source: "captain" | "fan";
  submitterName?: string;
  submitterEmail?: string;
  customAnswers?: Record<string, string>;
  createdAt: number;
};

export type ItemView<
  Id extends string = string,
  DesignId extends string = string,
  EntryId extends string = string,
> = {
  _id: Id;
  designId: DesignId;
  // Set by `summarizeRoster` (the player this size line belongs to); the
  // phase-1 `summarize` has no entries, so it leaves it out.
  rosterEntryId?: EntryId;
  name?: string;
  number?: string;
  designation?: "C" | "A";
  size?: string;
  qty: number;
  source: "captain" | "fan";
  submitterName?: string;
  submitterEmail?: string;
  customAnswers: Record<string, string>;
  createdAt: number;
  // Phase-1 only (`summarize`); the roster read model never sets it (Gate 1b
  // Q5). Deleted with `summarize` in R2-03.
  collision?: boolean;
};

export type ItemSummary = {
  // Σ qty of sized items: the number that goes to production.
  itemCount: number;
  // Σ qty of items with no size yet; deliberately not part of `itemCount`.
  needsSize: number;
  bySize: { size: string; qty: number }[];
};

export type Submitter = { name?: string; email: string; qty: number };

export type OrderItemsSummary<
  Id extends string = string,
  DesignId extends string = string,
> = {
  designs: {
    designId: DesignId;
    title: string;
    items: ItemView<Id, DesignId>[];
    summary: ItemSummary;
  }[];
  summary: ItemSummary;
  // Items on a design that has since been unlinked from the order. Kept
  // visible so nobody's jersey silently disappears, but out of the totals.
  removedDesigns: {
    designId: DesignId;
    title: string;
    itemCount: number;
    submitters: Submitter[];
  }[];
};

export type SummarizeOptions<DesignId extends string = string> = {
  designIds: readonly DesignId[];
  titles: Readonly<Record<string, string>>;
  // The order form's names mode, or null when the order has no form.
  namesMode: NamesMode | null;
};

export function summarize<Id extends string, DesignId extends string>(
  items: readonly SummaryItem<Id, DesignId>[],
  { designIds, titles, namesMode }: SummarizeOptions<DesignId>,
): OrderItemsSummary<Id, DesignId> {
  // Index order isn't display order: migrated rows get a fresh
  // `_creationTime` but keep their legacy `createdAt`.
  const sorted = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const colliding = collidingIds(sorted, namesMode);
  const linked = new Set<string>(designIds);

  const designs = designIds.map((designId) => {
    const designItems = sorted
      .filter((i) => i.designId === designId)
      .map((i) => toView(i, colliding.has(i._id)));
    return {
      designId,
      title: titles[designId] ?? "",
      items: designItems,
      summary: summarizeItems(designItems),
    };
  });

  const removedByDesign = new Map<DesignId, SummaryItem<Id, DesignId>[]>();
  for (const item of sorted) {
    if (linked.has(item.designId)) continue;
    const list = removedByDesign.get(item.designId) ?? [];
    list.push(item);
    removedByDesign.set(item.designId, list);
  }
  const removedDesigns = [...removedByDesign].map(([designId, list]) => ({
    designId,
    title: titles[designId] ?? "",
    itemCount: list.reduce((sum, i) => sum + i.qty, 0),
    submitters: submittersOf(list),
  }));

  return {
    designs,
    summary: summarizeItems(designs.flatMap((d) => d.items)),
    removedDesigns,
  };
}

// Who sent the given items, with their summed qty. Items with no submitter
// (captain-added) aren't anyone's, so they're left out.
export function submittersOf(
  items: readonly Pick<
    SummaryItem,
    "submitterName" | "submitterEmail" | "qty"
  >[],
): Submitter[] {
  const byEmail = new Map<string, Submitter>();
  for (const item of items) {
    if (!item.submitterEmail) continue;
    const prev = byEmail.get(item.submitterEmail);
    if (prev) prev.qty += item.qty;
    else
      byEmail.set(item.submitterEmail, {
        name: item.submitterName,
        email: item.submitterEmail,
        qty: item.qty,
      });
  }
  return [...byEmail.values()];
}

function summarizeItems(
  items: readonly Pick<SummaryItem, "size" | "qty">[],
): ItemSummary {
  let itemCount = 0;
  let needsSize = 0;
  const qtyBySize = new Map<string, number>();
  for (const { size, qty } of items) {
    if (size === undefined) {
      needsSize += qty;
      continue;
    }
    itemCount += qty;
    qtyBySize.set(size, (qtyBySize.get(size) ?? 0) + qty);
  }
  const bySize = sortSizes([...qtyBySize.keys()]).map((size) => ({
    size,
    qty: qtyBySize.get(size)!,
  }));
  return { itemCount, needsSize, bySize };
}

// Open-mode collision (R-02 semantics, carried over): two different people
// typed the same player onto the same design. A key is colliding when its
// named items carry two or more distinct submitter emails; one person sending
// two jerseys for the same name isn't a collision (Q7). Fixed mode shares
// names by design, so it never flags.
function collidingIds<Id extends string>(
  items: readonly SummaryItem<Id>[],
  namesMode: NamesMode | null,
): Set<Id> {
  const colliding = new Set<Id>();
  if (namesMode !== "open") return colliding;

  const groups = new Map<string, { ids: Id[]; emails: Set<string> }>();
  for (const item of items) {
    if (!item.name) continue;
    const key = `${item.designId}::${rosterSlotKey(item.name, item.number)}`;
    const group = groups.get(key) ?? { ids: [], emails: new Set<string>() };
    group.ids.push(item._id);
    if (item.submitterEmail) group.emails.add(item.submitterEmail);
    groups.set(key, group);
  }
  for (const { ids, emails } of groups.values())
    if (emails.size > 1) for (const id of ids) colliding.add(id);
  return colliding;
}

function toView<Id extends string, DesignId extends string>(
  item: SummaryItem<Id, DesignId>,
  collision: boolean,
): ItemView<Id, DesignId> {
  return {
    _id: item._id,
    designId: item.designId,
    name: item.name,
    number: item.number,
    designation: item.designation,
    size: item.size,
    qty: item.qty,
    source: item.source,
    submitterName: item.submitterName,
    submitterEmail: item.submitterEmail,
    customAnswers: item.customAnswers ?? {},
    createdAt: item.createdAt,
    collision,
  };
}

// ── The roster read model (initiative 0004 phase 1b, R2-01) ─────────────────
// A roster entry ("player" on screen) owns its size lines (order items). The
// caller hands over live entries and the live items under them (`loadRoster`);
// this groups them per design into players, flattens the lines back into
// `ItemView`s for the CSV and exports, and counts. Replaces `summarize` in
// R2-03. No collision flag (Gate 1b Q5): two submitters on one print are one
// player whose `lines` keep each submitter.

export type RosterEntryInput<
  EntryId extends string = string,
  DesignId extends string = string,
> = {
  _id: EntryId;
  designId: DesignId;
  name?: string;
  number?: string;
  designation?: "C" | "A";
  source: "captain" | "fan";
  createdAt: number;
};

export type RosterLineInput<
  Id extends string = string,
  EntryId extends string = string,
> = {
  _id: Id;
  rosterEntryId?: EntryId;
  // Optional only while the schema is widened: a legacy sizeless row linked
  // by the migration. It's no jersey, so the read model skips it.
  size?: string;
  qty: number;
  source: "captain" | "fan";
  submitterName?: string;
  submitterEmail?: string;
  customAnswers?: Record<string, string>;
  createdAt: number;
};

export type PlayerLine<Id extends string = string> = {
  itemId: Id;
  size: string;
  qty: number;
  source: "captain" | "fan";
  submitterName?: string;
  submitterEmail?: string;
  customAnswers: Record<string, string>;
  createdAt: number;
};

export type PlayerView<
  Id extends string = string,
  DesignId extends string = string,
  EntryId extends string = string,
> = {
  entryId: EntryId;
  designId: DesignId;
  name?: string;
  number?: string;
  designation?: "C" | "A";
  source: "captain" | "fan";
  createdAt: number;
  sizes: { size: string; qty: number }[];
  jerseyCount: number;
  needsSizes: boolean;
  // Every line with its own submitter, never collapsed: "Added by" and the
  // sheet's "Sizes added by" render these.
  lines: PlayerLine<Id>[];
};

export type RosterSummary = {
  // Σ qty of live size lines: the number that goes to production.
  jerseyCount: number;
  // Live entries carrying a name or a number (a blank entry is not a player).
  playerCount: number;
  // Named players with no live size line: a count of players, not of qty.
  needsSizes: number;
  bySize: { size: string; qty: number }[];
};

export type OrderRosterSummary<
  Id extends string = string,
  DesignId extends string = string,
  EntryId extends string = string,
> = {
  designs: {
    designId: DesignId;
    title: string;
    players: PlayerView<Id, DesignId, EntryId>[];
    items: ItemView<Id, DesignId, EntryId>[];
    summary: RosterSummary;
  }[];
  // Linked designs only.
  summary: RosterSummary;
  // Jerseys on a design since unlinked from the order: kept visible so
  // nobody's jersey silently disappears, but out of the totals.
  removedDesigns: {
    designId: DesignId;
    title: string;
    jerseyCount: number;
    submitters: Submitter[];
  }[];
};

export type SummarizeRosterOptions<DesignId extends string = string> = {
  designIds: readonly DesignId[];
  titles: Readonly<Record<string, string>>;
};

function isBlankPlayer(entry: Pick<RosterEntryInput, "name" | "number">) {
  return !entry.name?.trim() && !entry.number?.trim();
}

export function summarizeRoster<
  Id extends string,
  DesignId extends string,
  EntryId extends string,
>(
  entries: readonly RosterEntryInput<EntryId, DesignId>[],
  items: readonly RosterLineInput<Id, EntryId>[],
  { designIds, titles }: SummarizeRosterOptions<DesignId>,
): OrderRosterSummary<Id, DesignId, EntryId> {
  const linesByEntry = new Map<string, RosterLineInput<Id, EntryId>[]>();
  for (const item of items) {
    if (item.rosterEntryId === undefined || item.size === undefined) continue;
    const list = linesByEntry.get(item.rosterEntryId) ?? [];
    list.push(item);
    linesByEntry.set(item.rosterEntryId, list);
  }

  // Display order: players by entry `createdAt`, the blank entry last.
  const players = [...entries]
    .sort(
      (a, b) =>
        Number(isBlankPlayer(a)) - Number(isBlankPlayer(b)) ||
        a.createdAt - b.createdAt,
    )
    .map((entry) => toPlayerView(entry, linesByEntry.get(entry._id) ?? []));

  const designs = designIds.map((designId) => {
    const designPlayers = players.filter((p) => p.designId === designId);
    return {
      designId,
      title: titles[designId] ?? "",
      players: designPlayers,
      items: designPlayers.flatMap((p) => flattenPlayer(p)),
      summary: summarizePlayers(designPlayers),
    };
  });

  const linked = new Set<string>(designIds);
  const removedByDesign = new Map<DesignId, PlayerLine<Id>[]>();
  for (const player of players) {
    if (linked.has(player.designId) || player.lines.length === 0) continue;
    const list = removedByDesign.get(player.designId) ?? [];
    list.push(...player.lines);
    removedByDesign.set(player.designId, list);
  }
  const removedDesigns = [...removedByDesign].map(([designId, lines]) => ({
    designId,
    title: titles[designId] ?? "",
    jerseyCount: lines.reduce((sum, l) => sum + l.qty, 0),
    submitters: submittersOf(lines),
  }));

  return {
    designs,
    summary: summarizePlayers(designs.flatMap((d) => d.players)),
    removedDesigns,
  };
}

function toPlayerView<
  Id extends string,
  DesignId extends string,
  EntryId extends string,
>(
  entry: RosterEntryInput<EntryId, DesignId>,
  rawLines: readonly RosterLineInput<Id, EntryId>[],
): PlayerView<Id, DesignId, EntryId> {
  const lines = [...rawLines]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(
      (line): PlayerLine<Id> => ({
        itemId: line._id,
        size: line.size!,
        qty: line.qty,
        source: line.source,
        submitterName: line.submitterName,
        submitterEmail: line.submitterEmail,
        customAnswers: line.customAnswers ?? {},
        createdAt: line.createdAt,
      }),
    );
  return {
    entryId: entry._id,
    designId: entry.designId,
    name: entry.name,
    number: entry.number,
    designation: entry.designation,
    source: entry.source,
    createdAt: entry.createdAt,
    sizes: bySizeOf(lines),
    jerseyCount: lines.reduce((sum, l) => sum + l.qty, 0),
    needsSizes: !isBlankPlayer(entry) && lines.length === 0,
    lines,
  };
}

// One `ItemView` per size line, carrying the player's printed values: the
// shape the CSV, the admin export and `listOrderEntries` already read.
function flattenPlayer<
  Id extends string,
  DesignId extends string,
  EntryId extends string,
>(
  player: PlayerView<Id, DesignId, EntryId>,
): ItemView<Id, DesignId, EntryId>[] {
  return player.lines.map((line) => ({
    _id: line.itemId,
    designId: player.designId,
    rosterEntryId: player.entryId,
    name: player.name,
    number: player.number,
    designation: player.designation,
    size: line.size,
    qty: line.qty,
    source: line.source,
    submitterName: line.submitterName,
    submitterEmail: line.submitterEmail,
    customAnswers: line.customAnswers,
    createdAt: line.createdAt,
  }));
}

function bySizeOf(
  lines: readonly { size: string; qty: number }[],
): { size: string; qty: number }[] {
  const qtyBySize = new Map<string, number>();
  for (const { size, qty } of lines)
    qtyBySize.set(size, (qtyBySize.get(size) ?? 0) + qty);
  return sortSizes([...qtyBySize.keys()]).map((size) => ({
    size,
    qty: qtyBySize.get(size)!,
  }));
}

function summarizePlayers(
  players: readonly Pick<
    PlayerView,
    "name" | "number" | "lines" | "needsSizes"
  >[],
): RosterSummary {
  const lines = players.flatMap((p) => p.lines);
  return {
    jerseyCount: lines.reduce((sum, l) => sum + l.qty, 0),
    playerCount: players.filter((p) => !isBlankPlayer(p)).length,
    needsSizes: players.filter((p) => p.needsSizes).length,
    bySize: bySizeOf(lines),
  };
}
