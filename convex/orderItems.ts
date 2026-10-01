// The captain/admin API over the order list (initiative 0004, L-01).
// Design: docs/architecture/0004-order-items.md. Every write goes through
// `requireListWriter`; every read through `loadItems` + `summarize`.
//
// No function here accepts `isAdmin`, a user id, `source`, or any submitter
// field: identity comes from the server, and only the public form (L-02) may
// record who sent a jersey. Validators are strict, so a client that sends one
// of those is refused before the handler runs.

import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserOrNull, requireCurrentUser } from "./_auth";
import {
  isListLocked,
  loadItems,
  requireListWriter,
  summarizeOrder,
} from "./_orderItems";
import {
  checkItemName,
  checkItemSize,
  submittersOf,
} from "../lib/orderItem";
import {
  checkRosterDesignation,
  checkRosterNumber,
} from "../lib/rosterEntry/rules";
import { planRosterCopy } from "../lib/rosterEntry/mirror";
import { ROSTER_PASTE_MAX_ROWS } from "../lib/rosterEntry/paste";
import { checkQty, type CheckResult } from "../lib/orderEntry/rules";
import { SIZE_OPTIONS } from "../lib/jerseyRun/rules";

// What a captain or admin may set on an item. Strings, not literals, for the
// letter: `checkRosterDesignation` normalizes ("c" → "C") and words the error.
const editableFields = {
  name: v.optional(v.string()),
  number: v.optional(v.string()),
  designation: v.optional(v.string()),
  size: v.optional(v.string()),
  qty: v.number(),
};

type EditableInput = {
  name?: string;
  number?: string;
  designation?: string;
  size?: string;
  qty: number;
};

function orThrow<T>(result: CheckResult<T>): T {
  if (!result.ok) throw new ConvexError(result.error);
  return result.value;
}

// Validates and normalizes the editable fields. Blank optional fields come
// back `undefined`, so an insert omits them and a patch clears them.
// `currentSize` lets an item keep a legacy size it already has.
function checkEditable(input: EditableInput, currentSize?: string) {
  return {
    name: orThrow(checkItemName(input.name)),
    number: orThrow(checkRosterNumber(input.number)),
    designation: orThrow(checkRosterDesignation(input.designation)),
    size: orThrow(checkItemSize(input.size, SIZE_OPTIONS, currentSize)),
    qty: orThrow(checkQty(input.qty)),
  };
}

function requireDesignOnOrder(order: Doc<"orders">, designId: Id<"designs">) {
  if (!order.designIds.includes(designId))
    throw new ConvexError("That design isn't part of this order.");
}

async function requireItem(ctx: MutationCtx, itemId: Id<"orderItems">) {
  const item = await ctx.db.get(itemId);
  if (!item) throw new ConvexError("That item is no longer on this order.");
  return item;
}

// The order's list as one read model: per-design items and counts, the order
// total, items on since-unlinked designs, and what this caller may do. The
// captain's rows, chips, footer and CSV all come from this one subscription.
// Null when signed out or the order is gone; throws for anyone but the
// order's captain or an admin.
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

    const { form, summary } = await summarizeOrder(ctx, order);
    const locked = await isListLocked(ctx, order);

    return {
      ...summary,
      locked,
      canEdit: user.isAdmin || (isOwner && !locked),
      form: form ? { runId: form._id, namesMode: form.namesMode } : null,
    };
  },
});

export const add = mutation({
  args: {
    orderId: v.id("orders"),
    designId: v.id("designs"),
    ...editableFields,
  },
  handler: async (ctx, { orderId, designId, ...input }) => {
    const { user, order } = await requireListWriter(ctx, orderId);
    requireDesignOnOrder(order, designId);
    const fields = checkEditable(input);
    const now = Date.now();
    return ctx.db.insert("orderItems", {
      orderId,
      designId,
      ...fields,
      source: "captain",
      createdAt: now,
      updatedAt: now,
      updatedBy: user._id,
    });
  },
});

// Paste a list (≤ ROSTER_PASTE_MAX_ROWS rows, qty 1 each). All-or-nothing:
// every row is checked before any is written. Not deduped: the client showed
// the captain a preview, and the same name twice can be two jerseys (Q7).
export const addMany = mutation({
  args: {
    orderId: v.id("orders"),
    designId: v.id("designs"),
    rows: v.array(
      v.object({
        name: v.optional(v.string()),
        number: v.optional(v.string()),
        size: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orderId, designId, rows }) => {
    const { user, order } = await requireListWriter(ctx, orderId);
    requireDesignOnOrder(order, designId);
    if (rows.length === 0) throw new ConvexError("Add at least one line.");
    if (rows.length > ROSTER_PASTE_MAX_ROWS)
      throw new ConvexError(
        `Paste at most ${ROSTER_PASTE_MAX_ROWS} lines at a time.`,
      );

    const checked = rows.map((row, index) => {
      try {
        return checkEditable({ ...row, qty: 1 });
      } catch (err) {
        if (err instanceof ConvexError && typeof err.data === "string")
          throw new ConvexError(`Line ${index + 1}: ${err.data}`);
        throw err;
      }
    });

    const now = Date.now();
    const ids: Id<"orderItems">[] = [];
    for (const fields of checked) {
      ids.push(
        await ctx.db.insert("orderItems", {
          orderId,
          designId,
          ...fields,
          source: "captain",
          createdAt: now,
          updatedAt: now,
          updatedBy: user._id,
        }),
      );
    }
    return ids;
  },
});

// Full replace of the five editable fields: an omitted optional clears it.
// Never touches the design, source, submitter, answers or form provenance,
// so a captain can fix a player's size without becoming its sender.
export const update = mutation({
  args: { itemId: v.id("orderItems"), ...editableFields },
  handler: async (ctx, { itemId, ...input }) => {
    const item = await requireItem(ctx, itemId);
    const { user } = await requireListWriter(ctx, item.orderId);
    if (item.removedAt !== undefined)
      throw new ConvexError("That item was removed. Undo the removal first.");
    const fields = checkEditable(input, item.size);
    await ctx.db.patch(itemId, {
      ...fields,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    return null;
  },
});

// Soft delete: the whole item goes (sizes, sender, the lot) and `restore`
// brings back the same row. Removing twice is a no-op.
export const remove = mutation({
  args: { itemId: v.id("orderItems") },
  handler: async (ctx, { itemId }) => {
    const item = await requireItem(ctx, itemId);
    const { user } = await requireListWriter(ctx, item.orderId);
    if (item.removedAt !== undefined) return null;
    const now = Date.now();
    await ctx.db.patch(itemId, {
      removedAt: now,
      updatedAt: now,
      updatedBy: user._id,
    });
    return null;
  },
});

// Undo for `remove`. Same `_id` and fields, and the same place in the list
// (display sorts by `createdAt`). No-op on an item that isn't removed.
export const restore = mutation({
  args: { itemId: v.id("orderItems") },
  handler: async (ctx, { itemId }) => {
    const item = await requireItem(ctx, itemId);
    const { user } = await requireListWriter(ctx, item.orderId);
    if (item.removedAt === undefined) return null;
    await ctx.db.patch(itemId, {
      removedAt: undefined,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    return null;
  },
});

// "Put these players on that kit too": copies the named items of one design
// onto another — name, number and letter only, landing as Needs size (copying
// sizes or qty would invent jerseys nobody asked for). Deduped by the player
// key against the target's live items, so re-running copies nothing new.
export const copyToDesign = mutation({
  args: {
    orderId: v.id("orders"),
    sourceDesignId: v.id("designs"),
    targetDesignId: v.id("designs"),
  },
  handler: async (ctx, { orderId, sourceDesignId, targetDesignId }) => {
    const { user, order } = await requireListWriter(ctx, orderId);
    if (sourceDesignId === targetDesignId)
      throw new ConvexError("Pick a different design to copy from.");
    requireDesignOnOrder(order, sourceDesignId);
    requireDesignOnOrder(order, targetDesignId);

    const items = await loadItems(ctx, orderId);
    const namedOn = (designId: Id<"designs">) =>
      items
        .filter((i) => i.designId === designId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .flatMap((i) =>
          i.name
            ? [{ name: i.name, number: i.number, designation: i.designation }]
            : [],
        );

    const { additions, copied, skipped } = planRosterCopy(
      namedOn(sourceDesignId),
      namedOn(targetDesignId),
    );

    const now = Date.now();
    for (const player of additions) {
      await ctx.db.insert("orderItems", {
        orderId,
        designId: targetDesignId,
        name: player.name,
        number: player.number,
        designation: player.designation,
        qty: 1,
        source: "captain",
        createdAt: now,
        updatedAt: now,
        updatedBy: user._id,
      });
    }
    return { copied, skipped };
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

    const onDesign = (await loadItems(ctx, orderId)).filter(
      (i) => i.designId === designId,
    );
    return {
      itemCount: onDesign.reduce((sum, i) => sum + i.qty, 0),
      submitters: submittersOf(onDesign),
    };
  },
});
