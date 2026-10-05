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
  customAnswers: Record<string, string>;
  createdAt: number;
  collision: boolean;
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
