// The captain/admin API over players (initiative 0004 phase 1b, R2-01). A
// roster entry is a player on one design of one order; its sizes are the
// order items under it. Design: docs/architecture/0004-roster-sizes.md
// "Writes: captain / admin API".
//
// Every write goes through `requireListWriter`, and every by-id call resolves
// the order from the stored entry. No function here accepts `isAdmin`, a user
// id, `source`, or any submitter field or answer: identity comes from the
// server, and only the public form may record who sent a jersey. Validators
// are strict, so a client that sends one of those is refused before the
// handler runs. A merge moves items by `rosterEntryId` only, so every line
// keeps its own submitter (invariant 5).

import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  findLiveEntry,
  insertSizeLine,
  loadEntryItems,
  loadRoster,
  requireDesignOnOrder,
  requireListWriter,
  resolveEntry,
  type PlayerValues,
} from "./_orderItems";
import { checkItemName, itemLabel } from "../lib/orderItem";
import { ROSTER_PASTE_MAX_ROWS } from "../lib/orderItem/paste";
import {
  checkRosterDesignation,
  checkRosterNumber,
  playerKey,
} from "../lib/rosterEntry/rules";
import { planRosterCopy } from "../lib/rosterEntry/mirror";
import { checkQty, MAX_QTY, type CheckResult } from "../lib/orderEntry/rules";
import { SIZE_OPTIONS } from "../lib/orderForm/rules";

// The printed values a captain or admin may set. Strings, not literals, for
// the letter: `checkRosterDesignation` normalizes ("c" → "C") and words the
// error.
const playerValueArgs = {
  name: v.optional(v.string()),
  number: v.optional(v.string()),
  designation: v.optional(v.string()),
};

const sizesArg = v.array(v.object({ size: v.string(), qty: v.number() }));

type SizeQty = { size: string; qty: number };

function orThrow<T>(result: CheckResult<T>): T {
  if (!result.ok) throw new ConvexError(result.error);
  return result.value;
}

// Blank optional values come back `undefined`, so an insert omits them and a
// patch clears them.
function checkPrinted(input: {
  name?: string;
  number?: string;
  designation?: string;
}): PlayerValues {
  return {
    name: orThrow(checkItemName(input.name)),
    number: orThrow(checkRosterNumber(input.number)),
    designation: orThrow(checkRosterDesignation(input.designation)),
  };
}

const isBlank = (values: Pick<PlayerValues, "name" | "number">) =>
  playerKey(values) === "";

// A player's live qty per size.
function qtyBySize(items: readonly Doc<"orderItems">[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items)
    if (item.size !== undefined)
      totals.set(item.size, (totals.get(item.size) ?? 0) + item.qty);
  return totals;
}

// A size we make, or one the player already has (a legacy `XXL` survives an
// edit).
function isKnownSize(size: string, current: ReadonlyMap<string, number>) {
  return (SIZE_OPTIONS as readonly string[]).includes(size) || current.has(size);
}

// Checks sizes being added to a player whose live sizes are `current`: each
// size is one we make or one the player already has (a legacy `XXL` survives),
// each qty passes `checkQty`, and the player's total per size stays within
// MAX_QTY. Repeated sizes are summed. Throws; returns the lines to insert.
// (Each size is known: see `isKnownSize`.)
function checkSizesToAdd(
  sizes: readonly SizeQty[],
  current: ReadonlyMap<string, number>,
): SizeQty[] {
  const adding = new Map<string, number>();
  for (const { size: raw, qty } of sizes) {
    const size = raw.trim();
    if (!isKnownSize(size, current))
      throw new ConvexError("Pick a size from the list.");
    orThrow(checkQty(qty));
    adding.set(size, (adding.get(size) ?? 0) + qty);
  }
  for (const [size, qty] of adding)
    if ((current.get(size) ?? 0) + qty > MAX_QTY)
      throw new ConvexError(`Order at most ${MAX_QTY} in one size.`);
  return [...adding].map(([size, qty]) => ({ size, qty }));
}

async function requireEntry(ctx: MutationCtx, entryId: Id<"rosterEntries">) {
  const entry = await ctx.db.get(entryId);
  if (!entry) throw new ConvexError("That player is no longer on this order.");
  return entry;
}

async function designTitle(ctx: MutationCtx, designId: Id<"designs">) {
  return (await ctx.db.get(designId))?.title ?? "this design";
}

// Moves `from`'s live items under `into` (patching `rosterEntryId` only,
// never a submitter), then soft-removes `from`.
// Shared by rename-merge and restore-into-a-live-twin.
async function mergeEntryInto(
  ctx: MutationCtx,
  from: Doc<"rosterEntries">,
  into: Doc<"rosterEntries">,
  userId: Id<"users">,
) {
  const now = Date.now();
  for (const item of await loadEntryItems(ctx, from._id)) {
    if (item.removedAt !== undefined) continue;
    await ctx.db.patch(item._id, { rosterEntryId: into._id });
  }
  if (from.removedAt === undefined)
    await ctx.db.patch(from._id, {
      removedAt: now,
      updatedAt: now,
      updatedBy: userId,
    });
}

// Invariant 3: a blank entry ("Blank jerseys") with no live size line has no
// meaning, so the write that empties it removes it.
async function removeIfEmptyBlank(
  ctx: MutationCtx,
  entry: Doc<"rosterEntries">,
  userId: Id<"users">,
) {
  if (!isBlank(entry)) return;
  const live = (await loadEntryItems(ctx, entry._id)).filter(
    (item) => item.removedAt === undefined && item.size !== undefined,
  );
  if (live.length > 0) return;
  const now = Date.now();
  await ctx.db.patch(entry._id, {
    removedAt: now,
    updatedAt: now,
    updatedBy: userId,
  });
}

// Add a player with some sizes, or add sizes to the player already holding
// that name + number on the design ("Sidestep #72" in S, M×3, XL is one
// player and three lines). A named player with no sizes "needs sizes"; a
// blank one must bring sizes.
export const add = mutation({
  args: {
    orderId: v.id("orders"),
    designId: v.id("designs"),
    ...playerValueArgs,
    sizes: sizesArg,
  },
  handler: async (ctx, { orderId, designId, sizes, ...input }) => {
    const { user, order } = await requireListWriter(ctx, orderId);
    requireDesignOnOrder(order, designId);
    const values = checkPrinted(input);
    if (isBlank(values) && sizes.length === 0)
      throw new ConvexError("Add a name, a number or a size.");

    const roster = await loadRoster(ctx, orderId);
    const existing = findLiveEntry(roster.entries, designId, values);
    const lines = checkSizesToAdd(
      sizes,
      qtyBySize(
        existing
          ? roster.items.filter((i) => i.rosterEntryId === existing._id)
          : [],
      ),
    );

    const resolved = await resolveEntry(ctx, order, designId, values, {
      updatedBy: user._id,
      entries: roster.entries,
    });
    let entry = resolved.entry;
    if (
      resolved.matched &&
      values.designation !== undefined &&
      values.designation !== entry.designation
    ) {
      await ctx.db.patch(entry._id, {
        designation: values.designation,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
      entry = (await ctx.db.get(entry._id))!;
    }
    for (const line of lines)
      await insertSizeLine(ctx, entry, {
        ...line,
        source: "captain",
        updatedBy: user._id,
      });
    return { entryId: entry._id, matched: resolved.matched };
  },
});

// Edit a player: a full replace of the printed values (an omitted optional
// clears it) and its sizes by delta, not by total, so a fan's jersey that
// lands while the sheet is open is never silently overwritten. +n inserts a
// captain line; −n takes qty from the player's live lines of that size,
// newest first, soft-removing a line that reaches 0, and clamps at 0. If the
// new name + number is another live player on the same design, it throws
// unless `merge`, which moves this player's lines onto that one.
export const update = mutation({
  args: {
    entryId: v.id("rosterEntries"),
    ...playerValueArgs,
    sizeDeltas: v.array(v.object({ size: v.string(), delta: v.number() })),
    merge: v.optional(v.boolean()),
  },
  handler: async (ctx, { entryId, sizeDeltas, merge, ...input }) => {
    const entry = await requireEntry(ctx, entryId);
    const { user } = await requireListWriter(ctx, entry.orderId);
    if (entry.removedAt !== undefined)
      throw new ConvexError("That player was removed. Undo the removal first.");
    const values = checkPrinted(input);

    const roster = await loadRoster(ctx, entry.orderId);
    const lines = roster.items.filter((i) => i.rosterEntryId === entryId);
    const current = qtyBySize(lines);

    // Validate every delta before writing anything.
    const deltas = new Map<string, number>();
    for (const { size: raw, delta } of sizeDeltas) {
      const size = raw.trim();
      if (!Number.isInteger(delta))
        throw new ConvexError("Quantity must be a whole number.");
      if (!isKnownSize(size, current))
        throw new ConvexError("Pick a size from the list.");
      deltas.set(size, (deltas.get(size) ?? 0) + delta);
    }
    for (const [size, delta] of deltas)
      if ((current.get(size) ?? 0) + delta > MAX_QTY)
        throw new ConvexError(`Order at most ${MAX_QTY} in one size.`);

    // Same order + design only: `roster` is this entry's order.
    const twin = findLiveEntry(roster.entries, entry.designId, values, entryId);
    if (twin && !merge) {
      const label = isBlank(values) ? "Blank jerseys" : itemLabel(values);
      throw new ConvexError(
        `${label} ${isBlank(values) ? "are" : "is"} already on ${await designTitle(ctx, entry.designId)}.`,
      );
    }

    for (const [size, delta] of deltas) {
      if (delta > 0) {
        await insertSizeLine(ctx, entry, {
          size,
          qty: delta,
          source: "captain",
          updatedBy: user._id,
        });
        continue;
      }
      let toTake = -delta;
      const newestFirst = lines
        .filter((line) => line.size === size)
        .sort(
          (a, b) =>
            b.createdAt - a.createdAt || b._creationTime - a._creationTime,
        );
      for (const line of newestFirst) {
        if (toTake === 0) break;
        const now = Date.now();
        if (line.qty > toTake) {
          await ctx.db.patch(line._id, {
            qty: line.qty - toTake,
            updatedAt: now,
            updatedBy: user._id,
          });
          toTake = 0;
        } else {
          // Reaches 0: soft-remove, keeping the qty it had as the record.
          await ctx.db.patch(line._id, {
            removedAt: now,
            updatedAt: now,
            updatedBy: user._id,
          });
          toTake -= line.qty;
        }
      }
    }

    if (twin) {
      // The twin keeps its own spelling; the letter, if one was given, moves
      // onto it with the player.
      if (
        values.designation !== undefined &&
        values.designation !== twin.designation
      )
        await ctx.db.patch(twin._id, {
          designation: values.designation,
          updatedAt: Date.now(),
          updatedBy: user._id,
        });
      await mergeEntryInto(ctx, entry, (await ctx.db.get(twin._id))!, user._id);
      return { entryId: twin._id, merged: true };
    }

    await ctx.db.patch(entryId, {
      name: values.name,
      number: values.number,
      designation: values.designation,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    const updated = (await ctx.db.get(entryId))!;
    await removeIfEmptyBlank(ctx, updated, user._id);
    return { entryId, merged: false };
  },
});

// Soft delete of the entry alone: its items are hidden by `loadRoster`, never
// inspected or touched, so there is no error path. Twice is a no-op.
export const remove = mutation({
  args: { entryId: v.id("rosterEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await requireEntry(ctx, entryId);
    const { user } = await requireListWriter(ctx, entry.orderId);
    if (entry.removedAt !== undefined) return null;
    const now = Date.now();
    await ctx.db.patch(entryId, {
      removedAt: now,
      updatedAt: now,
      updatedBy: user._id,
    });
    return null;
  },
});

// Undo for `remove`: the same entry and the same item ids come back. If the
// same player was added again in the meantime, this one merges into it
// instead, so there is still one live entry per player. No-op on a live entry.
export const restore = mutation({
  args: { entryId: v.id("rosterEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await requireEntry(ctx, entryId);
    const { user } = await requireListWriter(ctx, entry.orderId);
    if (entry.removedAt === undefined) return null;
    const { entries } = await loadRoster(ctx, entry.orderId);
    const twin = findLiveEntry(entries, entry.designId, entry);
    if (twin) {
      await mergeEntryInto(ctx, entry, twin, user._id);
      return null;
    }
    await ctx.db.patch(entryId, {
      removedAt: undefined,
      updatedAt: Date.now(),
      updatedBy: user._id,
    });
    return null;
  },
});

// Paste a list of players with their sizes (≤ ROSTER_PASTE_MAX_ROWS). All or
// nothing: every player is checked before any is written. A player matching
// an existing one (or an earlier one in the paste) adds sizes to it.
export const addMany = mutation({
  args: {
    orderId: v.id("orders"),
    designId: v.id("designs"),
    players: v.array(
      v.object({
        name: v.optional(v.string()),
        number: v.optional(v.string()),
        sizes: sizesArg,
      }),
    ),
  },
  handler: async (ctx, { orderId, designId, players }) => {
    const { user, order } = await requireListWriter(ctx, orderId);
    requireDesignOnOrder(order, designId);
    if (players.length === 0) throw new ConvexError("Add at least one player.");
    if (players.length > ROSTER_PASTE_MAX_ROWS)
      throw new ConvexError(
        `Paste at most ${ROSTER_PASTE_MAX_ROWS} players at a time.`,
      );

    const roster = await loadRoster(ctx, orderId);
    // Running per-player size totals, so a player pasted twice is checked
    // against everything it will hold.
    const totals = new Map<string, Map<string, number>>();
    const checked = players.map((player, index) => {
      try {
        const values = checkPrinted(player);
        if (isBlank(values) && player.sizes.length === 0)
          throw new ConvexError("Add a name, a number or a size.");
        const key = playerKey(values);
        let current = totals.get(key);
        if (!current) {
          const existing = findLiveEntry(roster.entries, designId, values);
          current = qtyBySize(
            existing
              ? roster.items.filter((i) => i.rosterEntryId === existing._id)
              : [],
          );
          totals.set(key, current);
        }
        const lines = checkSizesToAdd(player.sizes, current);
        for (const { size, qty } of lines)
          current.set(size, (current.get(size) ?? 0) + qty);
        return { values, lines };
      } catch (err) {
        if (err instanceof ConvexError && typeof err.data === "string")
          throw new ConvexError(`Line ${index + 1}: ${err.data}`);
        throw err;
      }
    });

    let added = 0;
    let updated = 0;
    let jerseys = 0;
    for (const { values, lines } of checked) {
      const { entry, matched } = await resolveEntry(
        ctx,
        order,
        designId,
        values,
        { updatedBy: user._id, entries: roster.entries },
      );
      if (matched) updated += 1;
      else added += 1;
      for (const line of lines) {
        await insertSizeLine(ctx, entry, {
          ...line,
          source: "captain",
          updatedBy: user._id,
        });
        jerseys += line.qty;
      }
    }
    return { added, updated, jerseys };
  },
});

// "Put these players on that kit too": copies the live players of one design
// onto another (name, number and letter, no sizes: copying sizes would invent
// jerseys nobody asked for). Deduped by player key against the target, so a
// re-run copies nothing new. Blank entries aren't players and aren't copied.
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

    const { entries } = await loadRoster(ctx, orderId);
    const playersOn = (designId: Id<"designs">) =>
      entries
        .filter((e) => e.designId === designId && !isBlank(e))
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => ({
          name: e.name ?? "",
          number: e.number,
          designation: e.designation,
        }));

    const { additions, copied, skipped } = planRosterCopy(
      playersOn(sourceDesignId),
      playersOn(targetDesignId),
    );
    for (const player of additions)
      await resolveEntry(
        ctx,
        order,
        targetDesignId,
        { ...player, name: player.name || undefined },
        { updatedBy: user._id, entries },
      );
    return { copied, skipped };
  },
});
