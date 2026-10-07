// Server helpers for the order list (initiative 0004). Underscored, so
// nothing here is a Convex function: these are the shared reads and the write
// guard behind `convex/rosterEntries.ts`, `convex/orderItems.ts` and the
// public form.
//
// A roster entry is a player; its size lines are `orderItems` pointing at it
// (0004 phase 1b). Both are soft-deleted, and an item under a removed entry is
// hidden too. To make that impossible to forget, this module is the only
// place that reads either table by `by_order` (invariant 4): readers go
// through `loadRoster`. Design: docs/architecture/0004-roster-sizes.md.

import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireCurrentUser } from "./_auth";
import {
  isListConfirmed,
  listPlayerProblems,
  needsSizesMessage,
  summarizeRoster,
} from "../lib/orderItem";
import { playerKey } from "../lib/rosterEntry/rules";

type Ctx = QueryCtx | MutationCtx;

export const LIST_LOCKED_MESSAGE = "This order is locked for production.";

// The order's live entries, plus the live size lines whose entry is live.
export async function loadRoster(
  ctx: Ctx,
  orderId: Id<"orders">,
): Promise<{ entries: Doc<"rosterEntries">[]; items: Doc<"orderItems">[] }> {
  const entries = (
    await ctx.db
      .query("rosterEntries")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect()
  ).filter((entry) => entry.removedAt === undefined);
  const liveIds = new Set<Id<"rosterEntries">>(entries.map((e) => e._id));
  const items = (
    await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect()
  ).filter(
    (item) =>
      item.removedAt === undefined &&
      // Until the schema narrows, a legacy unlinked or sizeless row may still
      // exist; `_migrations:stripFlatItemFields` removes them. Neither is a
      // jersey.
      item.size !== undefined &&
      item.rosterEntryId !== undefined &&
      liveIds.has(item.rosterEntryId),
  );
  return { entries, items };
}

// One entry's items, removed ones included (the caller filters): what moves
// on a merge or a restore-into-a-live-twin.
export async function loadEntryItems(
  ctx: Ctx,
  entryId: Id<"rosterEntries">,
): Promise<Doc<"orderItems">[]> {
  return ctx.db
    .query("orderItems")
    .withIndex("by_entry", (q) => q.eq("rosterEntryId", entryId))
    .collect();
}

export type PlayerValues = {
  name?: string;
  number?: string;
  designation?: "C" | "A";
};

// The live entry on `designId` with the same `playerKey`, other than `except`.
export function findLiveEntry(
  entries: readonly Doc<"rosterEntries">[],
  designId: Id<"designs">,
  values: Pick<PlayerValues, "name" | "number">,
  except?: Id<"rosterEntries">,
): Doc<"rosterEntries"> | undefined {
  const key = playerKey(values);
  return entries.find(
    (entry) =>
      entry._id !== except &&
      entry.removedAt === undefined &&
      entry.designId === designId &&
      playerKey(entry) === key,
  );
}

// Invariant 1 + 2: every write that names a player comes through here. Returns
// the live entry on (order, design) with the same key, or inserts one with
// `values`. A match keeps its own spelling and letter: the caller decides
// whether to set a letter. Values must already be checked. A caller that
// resolves many players in one mutation (paste) passes `entries`, the live
// entries it loaded, and gets each insert appended so the next call sees it
// without re-reading the order.
export async function resolveEntry(
  ctx: MutationCtx,
  order: Doc<"orders">,
  designId: Id<"designs">,
  values: PlayerValues,
  options: {
    source?: Doc<"rosterEntries">["source"];
    updatedBy?: Id<"users">;
    entries?: Doc<"rosterEntries">[];
  } = {},
): Promise<{ entry: Doc<"rosterEntries">; matched: boolean }> {
  const entries = options.entries ?? (await loadRoster(ctx, order._id)).entries;
  const existing = findLiveEntry(entries, designId, values);
  if (existing) return { entry: existing, matched: true };

  const now = Date.now();
  const entryId = await ctx.db.insert("rosterEntries", {
    orderId: order._id,
    designId,
    name: values.name,
    number: values.number,
    designation: values.designation,
    source: options.source ?? "captain",
    createdAt: now,
    updatedAt: now,
    updatedBy: options.updatedBy,
  });
  const entry = (await ctx.db.get(entryId))!;
  entries.push(entry);
  return { entry, matched: false };
}

// Inserts one size line under `entry`. The printed values stay on the entry.
// Size and qty must already be checked. Only the public form passes a
// submission (who sent it, their answers, the form): a captain's line has
// none.
export async function insertSizeLine(
  ctx: MutationCtx,
  entry: Doc<"rosterEntries">,
  line: {
    size: string;
    qty: number;
    source: Doc<"orderItems">["source"];
    updatedBy?: Id<"users">;
    submission?: Pick<
      Doc<"orderItems">,
      "submitterName" | "submitterEmail" | "customAnswers" | "orderFormId"
    >;
  },
): Promise<Id<"orderItems">> {
  const now = Date.now();
  return ctx.db.insert("orderItems", {
    orderId: entry.orderId,
    rosterEntryId: entry._id,
    size: line.size,
    qty: line.qty,
    source: line.source,
    ...line.submission,
    createdAt: now,
    updatedAt: now,
    updatedBy: line.updatedBy,
  });
}

export function requireDesignOnOrder(
  order: Doc<"orders">,
  designId: Id<"designs">,
) {
  if (!order.designIds.includes(designId))
    throw new ConvexError("That design isn't part of this order.");
}

// Whether the order has any player at all, removed ones included (every item
// hangs off an entry, so this covers items too). Only the "already done?"
// checks need this (the dev fixtures); everything else wants live players.
export async function hasAnyPlayer(
  ctx: Ctx,
  orderId: Id<"orders">,
): Promise<boolean> {
  const first = await ctx.db
    .query("rosterEntries")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .first();
  return first !== null;
}

// Hard-deletes every entry and item on the order, removed ones included, and
// returns how many rows went. Test fixtures only (`_e2e.cleanup`): the app
// itself never hard-deletes a player or a size line.
export async function deleteOrderRoster(
  ctx: MutationCtx,
  orderId: Id<"orders">,
): Promise<number> {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const entries = await ctx.db
    .query("rosterEntries")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  for (const row of [...items, ...entries]) await ctx.db.delete(row._id);
  return items.length + entries.length;
}

// The order form (a jersey run), if the captain has made one. 0..1 per order.
export async function loadOrderForm(
  ctx: Ctx,
  orderId: Id<"orders">,
): Promise<Doc<"orderForms"> | null> {
  return ctx.db
    .query("orderForms")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .unique();
}

// The one lock predicate for the list (L-06, Q1 = A): JCC has checked the
// order's "Order Size Confirmed" stage. The order form's deadline plays no
// part. Async and ctx-taking although today's rule only reads the order, so
// every lock decision keeps going through here if the rule changes again.
export async function isListLocked(
  _ctx: Ctx,
  order: Doc<"orders">,
): Promise<boolean> {
  return isListConfirmed(order);
}

// The order's players through the single read model (`summarizeRoster`),
// with the titles it needs. Every count of an order (the captain's list, the
// confirm gate, the admin page and export, the closure email) comes from
// here, so they can't disagree. Titles cover the linked designs and any
// unlinked design that still has a player, so "removed designs" can name them.
export async function summarizeRosterOrder(ctx: Ctx, order: Doc<"orders">) {
  const { entries, items } = await loadRoster(ctx, order._id);
  const form = await loadOrderForm(ctx, order._id);

  const designIds = new Set<Id<"designs">>(order.designIds);
  for (const entry of entries) designIds.add(entry.designId);
  const titles: Record<string, string> = {};
  for (const designId of designIds) {
    const design = await ctx.db.get(designId);
    titles[designId] = design?.title ?? "Deleted design";
  }

  const summary = summarizeRoster(entries, items, {
    designIds: order.designIds,
    titles,
  });
  return { form, summary };
}

// The confirm gate (L-06, Q2 = A; players since R2-02): the message that
// refuses confirming the order size while a named player on the order's
// current designs has no live size, or null when it may be confirmed. Blank
// jerseys never block: there is no name to chase. Admin copy.
export async function confirmBlocker(
  ctx: Ctx,
  order: Doc<"orders">,
): Promise<string | null> {
  const { summary } = await summarizeRosterOrder(ctx, order);
  const problems = listPlayerProblems(
    summary.designs.flatMap((design) => design.players),
  );
  return problems.length > 0 ? needsSizesMessage(problems) : null;
}

// The write guard for every captain/admin list mutation. Admin status comes
// from the server-side user record only. An admin may write to any order,
// locked or not (UX §7.8); a captain only to their own order while unlocked.
// Messages are customer copy: a captain reads them.
export async function requireListWriter(
  ctx: MutationCtx,
  orderId: Id<"orders">,
): Promise<{ user: Doc<"users">; order: Doc<"orders"> }> {
  const user = await requireCurrentUser(ctx);
  const order = await ctx.db.get(orderId);
  if (!order) throw new ConvexError("Order not found.");
  if (user.isAdmin) return { user, order };
  if (order.captainId !== user._id)
    throw new ConvexError("You don't have access to this order.");
  if (await isListLocked(ctx, order))
    throw new ConvexError(LIST_LOCKED_MESSAGE);
  return { user, order };
}
