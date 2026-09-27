import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type AuthCtx = MutationCtx | QueryCtx;

// Soft variant: returns null when the caller is unauthenticated or when
// their Convex `users` row hasn't been synced yet. Use in queries whose
// loading/empty states are driven by a null result (dashboards, detail
// pages that render a "not found" view).
export async function getCurrentUserOrNull(
  ctx: AuthCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

// Hard variant: throws on unauth or missing user row. Use in mutations
// where the caller must be a real, synced user.
export async function requireCurrentUser(
  ctx: AuthCtx,
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new ConvexError("User not found.");
  return user;
}

// Admin gate. Defense in depth — even if a Next.js route check is
// bypassed, Convex will refuse unless the calling user's row has
// isAdmin === true. That field caches Clerk private metadata (see
// lib/adminFlag) and is written only by users.applyClerkUser (internal).
export async function requireAdmin(ctx: AuthCtx): Promise<Doc<"users">> {
  const user = await requireCurrentUser(ctx);
  if (!user.isAdmin) throw new ConvexError("Admin access required.");
  return user;
}

// One-shot helper for mutations that need to act on an order owned by
// the caller: fetches the user, fetches the order, throws on missing or
// access violation. Returns both so the caller doesn't need a second
// db.get. Soft callers (queries that return null on missing) keep their
// own inline branching against getCurrentUserOrNull.
export async function requireOrderOwnership(
  ctx: AuthCtx,
  orderId: Id<"orders">,
): Promise<{ user: Doc<"users">; order: Doc<"orders"> }> {
  const user = await requireCurrentUser(ctx);
  const order = await ctx.db.get(orderId);
  if (!order) throw new ConvexError("Order not found.");
  if (order.captainId !== user._id)
    throw new ConvexError("You don't have access to this order.");
  return { user, order };
}
