import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireCurrentUser,
  requireOrderOwnership,
} from "./_auth";
import {
  checkRosterName,
  checkRosterNumber,
} from "../lib/rosterEntry/rules";
import { isLocked } from "../lib/jerseyRun/lock";

// Create a roster entry — a name+number player slot on one of the order's
// designs (R-01 foundation; the captain-seeding UI lands in R-03, the fan
// attach path in R-02). Takes the run id and resolves the order from it,
// since the run is 1:1 with the order and carries the ownership we gate
// on. `source` defaults to "captain" — the seeding path; R-02 passes
// "fan" from the public submission.
export const create = mutation({
  args: {
    runId: v.id("jerseyRuns"),
    designId: v.id("designs"),
    name: v.string(),
    number: v.optional(v.string()),
    source: v.optional(v.union(v.literal("captain"), v.literal("fan"))),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Jersey run not found.");
    const { order } = await requireOrderOwnership(ctx, run.orderId);

    if (isLocked(run))
      throw new ConvexError("This jersey run is locked.");

    // A roster entry belongs to a design the order actually links — a
    // slot on a design that isn't on the order has no home.
    if (!order.designIds.includes(args.designId))
      throw new ConvexError("That design isn't part of this order.");

    const nameCheck = checkRosterName(args.name);
    if (!nameCheck.ok) throw new ConvexError(nameCheck.error);

    const numberCheck = checkRosterNumber(args.number);
    if (!numberCheck.ok) throw new ConvexError(numberCheck.error);

    return ctx.db.insert("rosterEntries", {
      runId: args.runId,
      orderId: run.orderId,
      designId: args.designId,
      name: nameCheck.value,
      number: numberCheck.value,
      source: args.source ?? "captain",
      createdAt: Date.now(),
    });
  },
});

// Edit a seeded slot's name/number (R-03). Same ownership gate as create,
// reached through the entry's run. The design and source don't change
// here — a captain renames a player, they don't move them to another
// design (remove + re-add for that).
export const update = mutation({
  args: {
    rosterEntryId: v.id("rosterEntries"),
    name: v.string(),
    number: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.rosterEntryId);
    if (!entry) throw new ConvexError("Player slot not found.");
    const run = await ctx.db.get(entry.runId);
    if (!run) throw new ConvexError("Jersey run not found.");
    await requireOrderOwnership(ctx, run.orderId);

    if (isLocked(run))
      throw new ConvexError("This jersey run is locked.");

    const nameCheck = checkRosterName(args.name);
    if (!nameCheck.ok) throw new ConvexError(nameCheck.error);
    const numberCheck = checkRosterNumber(args.number);
    if (!numberCheck.ok) throw new ConvexError(numberCheck.error);

    await ctx.db.patch(args.rosterEntryId, {
      name: nameCheck.value,
      number: numberCheck.value,
    });
    return args.rosterEntryId;
  },
});

// Remove a seeded slot (R-03). Blocked once the slot is filled — an order
// entry points at it, and deleting the slot would orphan a real jersey
// someone ordered. The captain removes the orders first (or, post-R-05,
// removes the design). Safe to seed-then-prune an empty roster freely.
export const remove = mutation({
  args: { rosterEntryId: v.id("rosterEntries") },
  handler: async (ctx, { rosterEntryId }) => {
    const entry = await ctx.db.get(rosterEntryId);
    if (!entry) throw new ConvexError("Player slot not found.");
    const run = await ctx.db.get(entry.runId);
    if (!run) throw new ConvexError("Jersey run not found.");
    await requireOrderOwnership(ctx, run.orderId);

    if (isLocked(run))
      throw new ConvexError("This jersey run is locked.");

    const attached = await ctx.db
      .query("orderEntries")
      .withIndex("by_rosterEntry", (q) => q.eq("rosterEntryId", rosterEntryId))
      .first();
    if (attached)
      throw new ConvexError(
        "This slot has orders on it — remove those first.",
      );

    await ctx.db.delete(rosterEntryId);
    return rosterEntryId;
  },
});

// Every roster entry on a run, for the captain dashboard / order page
// (R-04 consumes this). Captain or admin only. Returns [] for a missing
// run so a deleted run renders empty rather than throwing.
export const listByRun = query({
  args: { runId: v.id("jerseyRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return [];

    const user = await requireCurrentUser(ctx);
    if (run.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this jersey run.");

    return ctx.db
      .query("rosterEntries")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
  },
});

// The captain's seeding view (R-03): the run's roster grouped by design,
// each slot annotated with whether it's been filled. "Not yet filled" is
// purely derived — a slot with zero order entries — so there's no status
// field to keep in sync. Only walks the order's current designs; entries
// on a since-removed design are R-05's concern. Captain or admin only.
export const listForRun = query({
  args: { runId: v.id("jerseyRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;

    const user = await requireCurrentUser(ctx);
    if (run.captainId !== user._id && !user.isAdmin)
      throw new ConvexError("You don't have access to this jersey run.");

    const order = await ctx.db.get(run.orderId);
    if (!order) return null;

    const entries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();

    // A slot is "filled" once any order entry references it. One scan of
    // the run's order entries builds the set of filled slot ids, and — for
    // open-names runs — the set of distinct submitter emails per slot, so
    // a slot two different fans both claimed reads as a collision (R-02).
    const orderEntries = await ctx.db
      .query("orderEntries")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const filledSlotIds = new Set<string>();
    const emailsBySlot = new Map<string, Set<string>>();
    for (const e of orderEntries) {
      if (!e.rosterEntryId) continue;
      filledSlotIds.add(e.rosterEntryId);
      const set = emailsBySlot.get(e.rosterEntryId) ?? new Set<string>();
      set.add(e.submitterEmail);
      emailsBySlot.set(e.rosterEntryId, set);
    }
    // Collision is shown only (PRD §6) — the captain edits freely; there's
    // no resolve workflow. Fixed-mode runs share seeded slots by design,
    // so a shared slot there is expected, not a collision.
    const isCollision = (slotId: string) =>
      run.namesMode === "open" && (emailsBySlot.get(slotId)?.size ?? 0) > 1;

    const designs = await Promise.all(
      order.designIds.map(async (designId) => {
        const design = await ctx.db.get(designId);
        const designEntries = entries
          .filter((e) => e.designId === designId)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((e) => ({
            _id: e._id,
            name: e.name,
            number: e.number,
            source: e.source,
            filled: filledSlotIds.has(e._id),
            collision: isCollision(e._id),
          }));
        return {
          designId,
          title: design?.title ?? "Untitled design",
          entries: designEntries,
        };
      }),
    );

    return { runId, designs };
  },
});
