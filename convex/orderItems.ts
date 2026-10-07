// The reads over the order list (initiative 0004, L-01; players since R2-02).
// Design: docs/architecture/0004-roster-sizes.md "Reads". The writes live in
// `convex/rosterEntries.ts` (the captain / admin API over players) and
// `convex/orderEntries.ts` (the public form).

import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUserOrNull, requireCurrentUser } from "./_auth";
import { isListLocked, loadRoster, summarizeRosterOrder } from "./_orderItems";
import { submittersOf } from "../lib/orderItem";

// The order's list as one read model: per-design players (with their size
// lines) and counts, the order total, jerseys on since-unlinked designs, and
// what this caller may do. The captain's rows, chips, footer and CSV all come
// from this one subscription. Null when signed out or the order is gone;
// throws for anyone but the order's captain or an admin.
export const listForOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    const order = await ctx.db.get(orderId);
    if (!order) return null;
    const isOwner = order.captainId === user._id;
    if (!isOwner && !user.isAdmin)
      throw new ConvexError("You don't have access to this order.");

    const { form, summary } = await summarizeRosterOrder(ctx, order);
    const locked = await isListLocked(ctx, order);

    return {
      ...summary,
      locked,
      canEdit: user.isAdmin || (isOwner && !locked),
      form: form ? { orderFormId: form._id, namesMode: form.namesMode } : null,
    };
  },
});

// Who would lose a jersey if this design were unlinked from the order: each
// sender with their summed qty, plus the design's total. For the confirm
// step before removing a design.
export const affectedByDesignRemoval = query({
  args: { orderId: v.id("orders"), designId: v.id("designs") },
  handler: async (ctx, { orderId, designId }) => {
    const user = await requireCurrentUser(ctx);
    const order = await ctx.db.get(orderId);
    if (!order) throw new ConvexError("Order not found.");
    if (order.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this order.");

    const { entries, items } = await loadRoster(ctx, orderId);
    const playersOnDesign = new Set(
      entries.filter((e) => e.designId === designId).map((e) => e._id),
    );
    const onDesign = items.filter((i) => playersOnDesign.has(i.rosterEntryId));
    return {
      itemCount: onDesign.reduce((sum, i) => sum + i.qty, 0),
      submitters: submittersOf(onDesign),
    };
  },
});
