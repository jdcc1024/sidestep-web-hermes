// Server helpers for the order list (initiative 0004, L-01). Underscored, so
// nothing here is a Convex function: these are the shared reads and the write
// guard behind `convex/orderItems.ts` (and, from L-02, the public form).
//
// Items are soft-deleted (`removedAt`), so every reader must skip removed rows.
// To make that impossible to forget, `loadItems` is the only place that reads
// `orderItems` by `by_order`.

import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireCurrentUser } from "./_auth";
import {
  isListConfirmed,
  listProblems,
  needsSizeMessage,
  summarize,
} from "../lib/orderItem";

type Ctx = QueryCtx | MutationCtx;

export const LIST_LOCKED_MESSAGE = "This order is locked for production.";

// The order's live items, in index order. Callers that display them sort by
// `createdAt` (via `summarize`): migrated rows have a fresh `_creationTime`.
export async function loadItems(
  ctx: Ctx,
  orderId: Id<"orders">,
): Promise<Doc<"orderItems">[]> {
  const rows = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  return rows.filter((row) => row.removedAt === undefined);
}

// Whether the order has any item at all, removed ones included. Only the
// "already done?" checks need this (the dev fixtures);
// everything else wants live items.
export async function hasAnyItem(
  ctx: Ctx,
  orderId: Id<"orders">,
): Promise<boolean> {
  const first = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .first();
  return first !== null;
}

// The order form (a jersey run), if the captain has made one. 0..1 per order.
export async function loadOrderForm(
  ctx: Ctx,
  orderId: Id<"orders">,
): Promise<Doc<"jerseyRuns"> | null> {
  return ctx.db
    .query("jerseyRuns")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .unique();
}

// The order's live items run through the single read model (`summarize`),
// with the titles and names mode it needs. Every count of an order — the
// captain's list, the admin page and export, the closure email — comes from
// here, so they can't disagree. `items` is returned
// too for callers that need the raw rows alongside the summary.
export async function summarizeOrder(ctx: Ctx, order: Doc<"orders">) {
  const items = await loadItems(ctx, order._id);
  const form = await loadOrderForm(ctx, order._id);

  // Titles for the linked designs and for any unlinked design that still
  // has items on it, so "removed designs" can name them.
  const designIds = new Set<Id<"designs">>(order.designIds);
  for (const item of items) designIds.add(item.designId);
  const titles: Record<string, string> = {};
  for (const designId of designIds) {
    const design = await ctx.db.get(designId);
    titles[designId] = design?.title ?? "Deleted design";
  }

  const summary = summarize(items, {
    designIds: order.designIds,
    titles,
    namesMode: form?.namesMode ?? null,
  });
  return { items, form, summary };
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

// The confirm gate (L-06, Q2 = A): the message that refuses confirming the
// order size while a live item on the order's current designs has no size,
// or null when it may be confirmed. Admin copy.
export async function confirmBlocker(
  ctx: Ctx,
  order: Doc<"orders">,
): Promise<string | null> {
  const current = new Set<Id<"designs">>(order.designIds);
  const items = (await loadItems(ctx, order._id))
    .filter((item) => current.has(item.designId))
    .sort((a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime);
  const problems = listProblems(items);
  return problems.length > 0 ? needsSizeMessage(problems) : null;
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
