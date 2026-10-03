import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { prepareBlocks } from "./_designBlocks";
import { overviewBlocks } from "../lib/designBlock";

/**
 * Seed + cleanup for the Playwright E2E suite (`e2e/`).
 *
 * Every row an E2E run creates is named with a per-run tag (`e2e-<base36>`),
 * so a run only ever touches its own rows and runs never bleed into each
 * other or into JCC's hand-made dev data. Cleanup only deletes orders whose
 * team name — and designs whose title — start with `E2E `, owned by the
 * named account, so it cannot reach a real order even if called by mistake.
 *
 * Internal only (never reachable from the client). Called by
 * `e2e/support/convex.ts` through `npx convex run` against the dev deployment.
 */

const PREFIX = "E2E ";
const TAG = /^e2e-[a-z0-9-]{4,40}$/;

function checkTag(tag: string) {
  if (!TAG.test(tag)) throw new ConvexError(`Bad E2E tag "${tag}".`);
}

async function userByEmail(ctx: MutationCtx, email: string): Promise<Doc<"users">> {
  const wanted = email.trim().toLowerCase();
  const users = await ctx.db.query("users").collect();
  const user = users.find((u) => u.email.trim().toLowerCase() === wanted);
  if (!user)
    throw new ConvexError(
      `Found no user with email "${email}". Sign in as that account once, then re-run.`,
    );
  return user;
}

export type SeedOrderResult = {
  orderId: Id<"orders">;
  designId: Id<"designs">;
  teamName: string;
};

// One order with one design and no order form yet: the starting state for
// "captain makes an order form".
export const seedOrder = internalMutation({
  args: { email: v.string(), tag: v.string() },
  handler: async (ctx, { email, tag }): Promise<SeedOrderResult> => {
    checkTag(tag);
    const user = await userByEmail(ctx, email);
    const now = Date.now();
    const teamName = `${PREFIX}${tag}`;

    const designId = await ctx.db.insert("designs", {
      ownerId: user._id,
      title: `${PREFIX}${tag} kit`,
      blocks: prepareBlocks(overviewBlocks("E2E fixture kit.")),
      jerseyStyle: "Soccer jersey",
      neckline: "Crew Neck",
      sleeveStyle: "Regular",
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId: user._id,
      teamName,
      sport: "Dodgeball",
      estimatedQuantity: 12,
      hasOwnDesign: true,
      designIds: [designId],
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    return { orderId, designId, teamName };
  },
});

// Test-only: puts items straight on an E2E order, so a test can start from
// "a list with a sized and an unsized item" without driving the sheet.
export const seedItems = internalMutation({
  args: {
    email: v.string(),
    tag: v.string(),
    orderId: v.id("orders"),
    items: v.array(
      v.object({
        name: v.optional(v.string()),
        number: v.optional(v.string()),
        size: v.optional(v.string()),
        qty: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { email, tag, orderId, items }) => {
    checkTag(tag);
    const user = await userByEmail(ctx, email);
    const order = await ctx.db.get(orderId);
    if (!order || order.captainId !== user._id || !order.teamName.startsWith(`${PREFIX}${tag}`))
      throw new ConvexError("Not an E2E order for this tag.");
    const now = Date.now();
    const designId = order.designIds[0];
    for (const [i, item] of items.entries()) {
      await ctx.db.insert("orderItems", {
        orderId,
        designId,
        name: item.name,
        number: item.number,
        size: item.size,
        qty: item.qty ?? 1,
        source: "captain",
        createdAt: now + i,
        updatedAt: now + i,
      });
    }
    return { count: items.length };
  },
});

// Test-only: checks or unchecks "Order Size Confirmed" without the admin gate,
// so captain-side lock tests don't depend on the account being an admin.
export const setConfirmed = internalMutation({
  args: {
    email: v.string(),
    tag: v.string(),
    orderId: v.id("orders"),
    confirmed: v.boolean(),
  },
  handler: async (ctx, { email, tag, orderId, confirmed }) => {
    checkTag(tag);
    const user = await userByEmail(ctx, email);
    const order = await ctx.db.get(orderId);
    if (!order || order.captainId !== user._id || !order.teamName.startsWith(`${PREFIX}${tag}`))
      throw new ConvexError("Not an E2E order for this tag.");
    const rest = order.internalStages.filter((s) => s.name !== "Order Size Confirmed");
    await ctx.db.patch(orderId, {
      internalStages: confirmed
        ? [...rest, { name: "Order Size Confirmed", completedAt: Date.now() }]
        : rest,
    });
    return { ok: true as const };
  },
});

export type CleanupResult = { orders: number; designs: number; rows: number };

// Deletes the named account's E2E rows: those carrying `tag`, plus (when
// `olderThanMs` is given) any E2E row older than that — the sweep for runs
// that crashed before their own cleanup.
export const cleanup = internalMutation({
  args: {
    email: v.string(),
    tag: v.optional(v.string()),
    olderThanMs: v.optional(v.number()),
  },
  handler: async (ctx, { email, tag, olderThanMs }): Promise<CleanupResult> => {
    if (tag !== undefined) checkTag(tag);
    if (tag === undefined && olderThanMs === undefined)
      throw new ConvexError("Pass a tag, olderThanMs, or both.");
    const user = await userByEmail(ctx, email);
    const cutoff = olderThanMs === undefined ? -Infinity : Date.now() - olderThanMs;
    const ours = (name: string, createdAt: number) =>
      name.startsWith(PREFIX) &&
      ((tag !== undefined && name.startsWith(`${PREFIX}${tag}`)) || createdAt < cutoff);

    let orders = 0;
    let designs = 0;
    let rows = 0;

    const userOrders = await ctx.db
      .query("orders")
      .withIndex("by_captain", (q) => q.eq("captainId", user._id))
      .collect();
    for (const order of userOrders.filter((o) => ours(o.teamName, o.createdAt))) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      const runs = await ctx.db
        .query("jerseyRuns")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      for (const run of runs) {
        for (const table of ["rosterEntries", "orderEntries"] as const) {
          const legacy = await ctx.db
            .query(table)
            .withIndex("by_run", (q) => q.eq("runId", run._id))
            .collect();
          for (const row of legacy) await ctx.db.delete(row._id);
          rows += legacy.length;
        }
        await ctx.db.delete(run._id);
        rows += 1;
      }
      for (const item of items) await ctx.db.delete(item._id);
      rows += items.length;
      await ctx.db.delete(order._id);
      orders += 1;
    }

    const userDesigns = await ctx.db
      .query("designs")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const design of userDesigns.filter((d) => ours(d.title, d.createdAt))) {
      const assets = await ctx.db
        .query("designAssets")
        .withIndex("by_design", (q) => q.eq("designId", design._id))
        .collect();
      for (const asset of assets) {
        await ctx.storage.delete(asset.storageId);
        await ctx.db.delete(asset._id);
      }
      rows += assets.length;
      await ctx.db.delete(design._id);
      designs += 1;
    }

    return { orders, designs, rows };
  },
});
