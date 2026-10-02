import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireCurrentUser,
  requireOrderOwnership,
} from "./_auth";
import {
  checkRosterDesignation,
  checkRosterName,
  checkRosterNumber,
} from "../lib/rosterEntry/rules";
import { ROSTER_PASTE_MAX_ROWS } from "../lib/orderItem/paste";
import { planRosterCopy } from "../lib/rosterEntry/mirror";
import { isLocked } from "../lib/jerseyRun/lock";
import { sortSizes } from "../lib/jerseyRun/rules";

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
    // M-09. Optional everywhere: most players wear no letter, and the public
    // form never sends one — who wears the C is the captain's call.
    designation: v.optional(v.string()),
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

    const designationCheck = checkRosterDesignation(args.designation);
    if (!designationCheck.ok) throw new ConvexError(designationCheck.error);

    return ctx.db.insert("rosterEntries", {
      runId: args.runId,
      orderId: run.orderId,
      designId: args.designId,
      name: nameCheck.value,
      number: numberCheck.value,
      designation: designationCheck.value,
      source: args.source ?? "captain",
      createdAt: Date.now(),
    });
  },
});

// The bulk-paste commit (M-03). One call for a whole pasted block, gated
// exactly like `create` — ownership, lock, design-on-order, and the same
// per-row name/number rules — so nothing reaches the roster through a paste
// that couldn't be typed in one at a time. Bounded, because an unreasonable
// paste is a wrong-clipboard accident, not a big team.
//
// Deliberately not deduped server-side: the client has already previewed
// this exact array against the design's roster and the captain approved a
// count, so silently dropping rows here would make the mutation disagree
// with the button they pressed. Convex mutations are transactional, so one
// bad row rejects the batch rather than half-inserting it.
export const createMany = mutation({
  args: {
    runId: v.id("jerseyRuns"),
    designId: v.id("designs"),
    players: v.array(
      v.object({ name: v.string(), number: v.optional(v.string()) }),
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Jersey run not found.");
    const { order } = await requireOrderOwnership(ctx, run.orderId);

    if (isLocked(run)) throw new ConvexError("This jersey run is locked.");

    if (!order.designIds.includes(args.designId))
      throw new ConvexError("That design isn't part of this order.");

    if (args.players.length === 0)
      throw new ConvexError("No players to add.");
    if (args.players.length > ROSTER_PASTE_MAX_ROWS)
      throw new ConvexError(
        `Too many players at once — paste ${ROSTER_PASTE_MAX_ROWS} or fewer.`,
      );

    // Validate the whole batch before writing any of it, so a bad row at the
    // end can't leave the earlier ones behind on a retry.
    const players = args.players.map((player) => {
      const nameCheck = checkRosterName(player.name);
      if (!nameCheck.ok) throw new ConvexError(nameCheck.error);
      const numberCheck = checkRosterNumber(player.number);
      if (!numberCheck.ok) throw new ConvexError(numberCheck.error);
      return { name: nameCheck.value, number: numberCheck.value };
    });

    const createdAt = Date.now();
    const ids = [];
    for (const player of players) {
      ids.push(
        await ctx.db.insert("rosterEntries", {
          runId: args.runId,
          orderId: run.orderId,
          designId: args.designId,
          name: player.name,
          number: player.number,
          source: "captain",
          createdAt,
        }),
      );
    }
    return ids;
  },
});

// The mirror (M-04): seed one design's roster from another's in a single
// action, so the same fifteen people aren't typed twice for a home and an
// away kit. Pull direction — the target is the design the captain has open
// (PRD §6) — but the gate is symmetric, since both designs are named here.
//
// Strictly additive. It only ever inserts: no existing target slot, its
// `filled` state, or its order entries can change through this path. Slots
// carry across as name + number only and land captain-sourced; copying
// sizes would fabricate jerseys nobody ordered.
//
// Deduped server-side — unlike `createMany`, whose payload the captain has
// already previewed row by row. Here they pressed one button, so the skip
// (and the count it reports back) has to be decided against the roster as
// it is at write time, not against a client's stale read.
export const copyToDesign = mutation({
  args: {
    runId: v.id("jerseyRuns"),
    sourceDesignId: v.id("designs"),
    targetDesignId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new ConvexError("Jersey run not found.");
    const { order } = await requireOrderOwnership(ctx, run.orderId);

    if (isLocked(run)) throw new ConvexError("This jersey run is locked.");

    if (args.sourceDesignId === args.targetDesignId)
      throw new ConvexError("Pick a different design to copy from.");

    for (const designId of [args.sourceDesignId, args.targetDesignId]) {
      if (!order.designIds.includes(designId))
        throw new ConvexError("That design isn't part of this order.");
    }

    const entries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    const onDesign = (designId: string) =>
      entries
        .filter((e) => e.designId === designId)
        .sort((a, b) => a.createdAt - b.createdAt);

    const { additions, copied, skipped } = planRosterCopy(
      onDesign(args.sourceDesignId),
      onDesign(args.targetDesignId),
    );

    const createdAt = Date.now();
    for (const player of additions) {
      await ctx.db.insert("rosterEntries", {
        runId: args.runId,
        orderId: run.orderId,
        designId: args.targetDesignId,
        name: player.name,
        number: player.number,
        // The letter travels with the player (M-09): the same person on the
        // away kit is the same captain.
        designation: player.designation,
        source: "captain",
        createdAt,
      });
    }

    // The counts come from the server so the message the captain reads
    // describes what was actually written.
    return { copied, skipped };
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
    designation: v.optional(v.string()),
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
    const designationCheck = checkRosterDesignation(args.designation);
    if (!designationCheck.ok) throw new ConvexError(designationCheck.error);

    // Always named in the patch, never conditionally: an omitted designation
    // is the captain taking the letter *off* someone, and a patch that skips
    // the field would leave it on.
    await ctx.db.patch(args.rosterEntryId, {
      name: nameCheck.value,
      number: numberCheck.value,
      designation: designationCheck.value,
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

// Σ qty per size, in canonical display order — the shape both a slot's
// sizes and a design's blank lines come back in, so every surface that
// renders sizes (card, sheet, SizeBreakdown) agrees on their order.
function toSizeCounts(qtyBySize: Map<string, number>) {
  return sortSizes([...qtyBySize.keys()]).map((size) => ({
    size,
    qty: qtyBySize.get(size)!,
  }));
}

function addQty(
  bySize: Map<string, Map<string, number>>,
  key: string,
  size: string,
  qty: number,
) {
  const sizes = bySize.get(key) ?? new Map<string, number>();
  sizes.set(size, (sizes.get(size) ?? 0) + qty);
  bySize.set(key, sizes);
}

// The unified roster read (M-01, extending R-03's seeding view): the run's
// roster grouped by design, each slot annotated with whether it's been
// filled and with the sizes ordered against it, plus the design's
// blank/bulk lines — order entries carrying no slot. One read behind both
// the design-card preview and the roster editor, so the two can't disagree
// about what a design's roster is the way the order page and Run Setup
// used to.
//
// "Not yet filled" stays purely derived — a slot with zero order entries —
// so there's no status field to keep in sync. Only walks the order's
// current designs; entries on a since-removed design are R-05's concern,
// which is also what keeps the totals here reconciling with
// `orderEntries.countsByRun`. Captain or admin only.
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
    // the run's order entries builds the set of filled slot ids, the sizes
    // ordered against each slot, the design's unattached blank/bulk lines,
    // and — for open-names runs — the set of distinct submitter emails per
    // slot, so a slot two different fans both claimed reads as a collision
    // (R-02). One pass, no extra queries: the sizes and blanks (M-01) ride
    // along on the scan that was already happening.
    const orderEntries = await ctx.db
      .query("orderEntries")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const filledSlotIds = new Set<string>();
    const emailsBySlot = new Map<string, Set<string>>();
    const sizesBySlot = new Map<string, Map<string, number>>();
    const blankSizesByDesign = new Map<string, Map<string, number>>();
    for (const e of orderEntries) {
      // No slot behind it: a bulk/spare jersey, counted under its design so
      // no jersey drops out of the view.
      if (!e.rosterEntryId) {
        addQty(blankSizesByDesign, e.designId, e.size, e.qty);
        continue;
      }
      filledSlotIds.add(e.rosterEntryId);
      const set = emailsBySlot.get(e.rosterEntryId) ?? new Set<string>();
      set.add(e.submitterEmail);
      emailsBySlot.set(e.rosterEntryId, set);
      addQty(sizesBySlot, e.rosterEntryId, e.size, e.qty);
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
          .map((e) => {
            const sizes = toSizeCounts(
              sizesBySlot.get(e._id) ?? new Map<string, number>(),
            );
            return {
              _id: e._id,
              name: e.name,
              number: e.number,
              designation: e.designation,
              source: e.source,
              filled: filledSlotIds.has(e._id),
              collision: isCollision(e._id),
              sizes,
              total: sizes.reduce((sum, s) => sum + s.qty, 0),
            };
          });
        return {
          designId,
          title: design?.title ?? "Untitled design",
          entries: designEntries,
          blankSizes: toSizeCounts(
            blankSizesByDesign.get(designId) ?? new Map<string, number>(),
          ),
        };
      }),
    );

    return { runId, designs };
  },
});
