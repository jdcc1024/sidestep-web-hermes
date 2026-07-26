import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getCurrentUserOrNull, requireCurrentUser } from "./_auth";
import { fileCountsByDesign } from "./_designAssets";
import { isLocked } from "../lib/jerseyRun/lock";

// Server-side guards. Mirror lib/order.ts so the client and server cap
// values the same way — defense in depth against a hand-rolled client that
// posts past the form's maxLength.
const TEAM_NAME_MAX_LENGTH = 120;
const SPORT_MAX_LENGTH = 120;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 10_000;
const INITIAL_INTERNAL_STAGE = "Inquiry";

function requireShort(value: string, field: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError(`${field} is required.`);
  if (trimmed.length > max) throw new ConvexError(`${field} is too long.`);
  return trimmed;
}

// The editable fields shared by create and update. Both mutations write the
// same validated shape, so centralising the checks here keeps them in lock
// step — there's no second copy of the rules to forget to update.
const ORDER_FIELD_ARGS = {
  teamName: v.string(),
  sport: v.string(),
  estimatedQuantity: v.number(),
  hasOwnDesign: v.boolean(),
  designIds: v.array(v.id("designs")),
} as const;

type OrderFieldArgs = {
  teamName: string;
  sport: string;
  estimatedQuantity: number;
  hasOwnDesign: boolean;
  designIds: Id<"designs">[];
};

// Normalise and validate the shared order fields, and confirm every linked
// design exists and belongs to this captain. Returns the persisted shape
// (sans timestamps/ownership, which the callers own).
async function normalizeOrderFields(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  args: OrderFieldArgs,
): Promise<{
  teamName: string;
  sport: string;
  estimatedQuantity: number;
  hasOwnDesign: boolean;
  designIds: Id<"designs">[];
}> {
  const teamName = requireShort(args.teamName, "Team name", TEAM_NAME_MAX_LENGTH);
  const sport = requireShort(args.sport, "Sport", SPORT_MAX_LENGTH);

  if (
    !Number.isFinite(args.estimatedQuantity) ||
    !Number.isInteger(args.estimatedQuantity) ||
    args.estimatedQuantity < MIN_QUANTITY ||
    args.estimatedQuantity > MAX_QUANTITY
  ) {
    throw new ConvexError(
      `Quantity must be a whole number between ${MIN_QUANTITY} and ${MAX_QUANTITY}.`,
    );
  }

  // Each linked design must exist and be owned by this captain. Without
  // this check, a captain could link another user's designs by id.
  const uniqueDesignIds = Array.from(new Set(args.designIds));
  for (const designId of uniqueDesignIds) {
    const design = await ctx.db.get(designId);
    if (!design || design.ownerId !== ownerId)
      throw new ConvexError("One of the linked designs is not yours.");
  }

  return {
    teamName,
    sport,
    estimatedQuantity: args.estimatedQuantity,
    hasOwnDesign: args.hasOwnDesign,
    designIds: uniqueDesignIds,
  };
}

// One of the captain's orders with linked designs (and their file URLs)
// resolved server-side so the detail page can render download links in a
// single round-trip. Stage derivation stays on the client so the same
// `deriveCustomerStage` function powers both the dashboard chip and the
// timeline — no chance of drift between the two views.
//
// Returns null for unauthenticated callers, unsynced users, and missing
// orders. Throws on access violation (the order exists but belongs to a
// different captain) so the UI can surface "you don't have access" instead
// of indistinguishably rendering "not found".
export const getMyOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;

    const order = await ctx.db.get(orderId);
    if (!order) return null;
    if (order.captainId !== user._id)
      throw new ConvexError("You don't have access to this order.");

    // Linked designs may have been deleted since the order was placed;
    // drop missing ids so the UI doesn't blow up on a stale reference.
    const linkedDesigns = (
      await Promise.all(order.designIds.map((id) => ctx.db.get(id)))
    ).filter((d): d is Doc<"designs"> => d !== null);

    const fileCounts = await fileCountsByDesign(
      ctx,
      linkedDesigns.map((d) => d._id),
    );

    const designs = await Promise.all(
      linkedDesigns.map(async (design) => ({
        _id: design._id,
        title: design.title,
        brief: design.brief,
        canvaLink: design.canvaLink,
        // Silhouette specs live on the design now (O-01); surface them so the
        // order detail can render each design as its own section with its cut.
        jerseyStyle: design.jerseyStyle,
        neckline: design.neckline,
        sleeveStyle: design.sleeveStyle,
        fileCount: fileCounts.get(design._id) ?? 0,
      })),
    );

    return { order, designs };
  },
});

// Captain's own orders, newest first. Returns an empty array for the
// unauthenticated case and for signed-in users whose Convex `users` row
// hasn't been synced yet (first render before UserSync writes the row).
export const listMyOrders = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return [];

    return ctx.db
      .query("orders")
      .withIndex("by_captain", (q) => q.eq("captainId", user._id))
      .order("desc")
      .collect();
  },
});

export const createOrder = mutation({
  args: ORDER_FIELD_ARGS,
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const fields = await normalizeOrderFields(ctx, user._id, args);

    const now = Date.now();
    return ctx.db.insert("orders", {
      captainId: user._id,
      ...fields,
      internalStages: [{ name: INITIAL_INTERNAL_STAGE, completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Edit an existing order's team context and linked designs. Same validation
// and zero-to-many design linking as create; ownership of the order itself is
// enforced before any write. internalStages, captainId, and createdAt are
// immutable here — only the captain-editable fields and updatedAt change.
export const updateOrder = mutation({
  args: { orderId: v.id("orders"), ...ORDER_FIELD_ARGS },
  handler: async (ctx, { orderId, ...args }) => {
    const user = await requireCurrentUser(ctx);

    const order = await ctx.db.get(orderId);
    if (!order || order.captainId !== user._id)
      throw new ConvexError("You don't have access to this order.");

    // Once the order's jersey run is locked (R-06), the order details —
    // including which designs it links — are frozen along with the
    // roster/order-entry rows.
    const run = await ctx.db
      .query("jerseyRuns")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .unique();
    if (run && isLocked(run))
      throw new ConvexError("This order's jersey run is locked.");

    const fields = await normalizeOrderFields(ctx, user._id, args);

    await ctx.db.patch(orderId, { ...fields, updatedAt: Date.now() });
    return orderId;
  },
});
