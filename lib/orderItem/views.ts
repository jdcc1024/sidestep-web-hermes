// Pure mappers from the order list read model (`orderItems.listForOrder`,
// i.e. `summarize`'s output) to the props today's order-page components take
// (initiative 0004, L-02). They exist so the page can switch onto one
// subscription while the design cards, the roster sheet, the size chips and
// the CSV keep rendering unchanged; L-03 rebuilds those components around
// `ItemView` directly and these go with them.
//
// One item is one row: a named item is a player row (its size, or "not yet
// filled" when it needs one), and a design's unnamed sized items fold into
// the one blank line the card has always shown.

import {
  jerseyLabel,
  sizeTally,
  type BreakdownEntry,
  type RosterRow,
} from "../jerseyBreakdown";
import type { ItemView, OrderItemsSummary } from "./summary";

type DesignList<Id extends string, DesignId extends string> = OrderItemsSummary<
  Id,
  DesignId
>["designs"][number];

// The roster sheet's slot shape (`RosterSheetSlot`, structurally): a named
// item with its own id, its size as M-01's `sizes` list, and its qty.
export type ItemSlot<Id extends string = string> = {
  _id: Id;
  name: string;
  number?: string;
  designation?: "C" | "A";
  source: "captain" | "fan";
  filled: boolean;
  collision: boolean;
  sizes: { size: string; qty: number }[];
  total: number;
  qty: number;
};

function sizesOf(item: Pick<ItemView, "size" | "qty">) {
  return item.size === undefined ? [] : [{ size: item.size, qty: item.qty }];
}

// The design's players, in list order (`summarize` sorts by `createdAt`).
// What the roster sheet edits; unnamed items aren't players and stay off it.
export function itemSlots<Id extends string, DesignId extends string>(
  design: DesignList<Id, DesignId>,
): ItemSlot<Id>[] {
  return design.items.flatMap((item) =>
    item.name === undefined
      ? []
      : [
          {
            _id: item._id,
            name: item.name,
            number: item.number,
            designation: item.designation,
            source: item.source,
            filled: item.size !== undefined,
            collision: item.collision,
            sizes: sizesOf(item),
            total: item.size === undefined ? 0 : item.qty,
            qty: item.qty,
          },
        ],
  );
}

// The design card's rows (and its CSV): one per player, then the design's
// unnamed sized jerseys as a single blank line, as `rosterRowsByDesign` laid
// them out. A Needs-size item counts 0, so Σ `total` is the design's
// `summary.itemCount`.
export function itemRosterRows<Id extends string, DesignId extends string>(
  design: DesignList<Id, DesignId>,
): RosterRow[] {
  const rows: RosterRow[] = itemSlots(design).map((slot) => ({
    key: slot._id,
    label: jerseyLabel(slot.name, slot.number),
    name: slot.name,
    number: slot.number,
    designation: slot.designation,
    blank: false,
    filled: slot.filled,
    collision: slot.collision,
    sizes: slot.sizes,
    total: slot.total,
  }));

  const blankSizes = sizeTally(
    design.items.flatMap((item) =>
      item.name === undefined && item.size !== undefined
        ? [{ designId: "", designTitle: "", size: item.size, qty: item.qty }]
        : [],
    ),
  );
  const blankTotal = blankSizes.reduce((sum, s) => sum + s.qty, 0);
  if (blankTotal > 0)
    rows.push({
      // Namespaced so it can't collide with an item id.
      key: `blank:${design.designId}`,
      label: jerseyLabel(undefined, undefined),
      blank: true,
      // A blank jersey is one somebody asked for, so it reads as filled.
      filled: true,
      collision: false,
      sizes: blankSizes,
      total: blankTotal,
    });
  return rows;
}

// Every sized item on the order's linked designs, as the size chips read
// them. Removed-design items are already out (`summarize` puts them in
// `removedDesigns`), so the chips reconcile with `summary.itemCount`.
export function itemBreakdownEntries<
  Id extends string,
  DesignId extends string,
>(list: Pick<OrderItemsSummary<Id, DesignId>, "designs">): BreakdownEntry[] {
  return list.designs.flatMap((design) =>
    design.items.flatMap((item) =>
      item.size === undefined
        ? []
        : [
            {
              designId: design.designId,
              designTitle: design.title,
              name: item.name,
              number: item.number,
              designation: item.designation,
              size: item.size,
              qty: item.qty,
            },
          ],
    ),
  );
}
