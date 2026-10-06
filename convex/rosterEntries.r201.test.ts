// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// R2-01 acceptance tests (initiative 0004, phase 1b): the captain/admin player
// API in convex/rosterEntries.ts. JCC: "take Sidestep #72, then add multiple
// order items for that roster entry (1 small, 3 medium, 1 XL)".
// Spec: backlog/R2-01-roster-entries-model.md (Logic), design note
// docs/architecture/0004-roster-sizes.md "Writes". Written before the build:
// fails because the `rosterEntries` table and module don't exist yet.
// Messages are not pinned (only "is already on" for the rename throw, which
// the design note quotes); rejections are asserted as ConvexError.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { loadRoster } from "./_orderItems";
import { overviewBlocks } from "../lib/designBlock";
import { INTERNAL_STAGES } from "../lib/orderStages";

const modules = import.meta.glob("./**/*.*s");
const CONFIRMED = "Order Size Confirmed";

type T = TestConvex<typeof schema>;

// ── seeding ────────────────────────────────────────────────────────────────

async function seedUser(t: T, subject: string, isAdmin = false) {
  const email = `${subject}@example.com`;
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email,
      name: subject,
      isAdmin,
      createdAt: Date.now(),
    }),
  );
  return { userId, as: t.withIdentity({ subject, email, name: subject }) };
}

// captain's order on two designs, a second (unrelated) captain, an admin, and
// a second order (for cross-order checks).
async function seedWorld(t: T) {
  const captain = await seedUser(t, "captain_x");
  const other = await seedUser(t, "captain_y");
  const admin = await seedUser(t, "admin", true);
  const now = Date.now();
  const mk = async (ownerId: Id<"users">, team: string) =>
    t.run(async (ctx) => {
      const designIds: Id<"designs">[] = [];
      for (const title of ["Home", "Away"])
        designIds.push(
          await ctx.db.insert("designs", {
            ownerId,
            title,
            blocks: overviewBlocks(`${title} kit`),
            createdAt: now,
            updatedAt: now,
          }),
        );
      const orderId = await ctx.db.insert("orders", {
        captainId: ownerId,
        teamName: team,
        sport: "Soccer",
        estimatedQuantity: 12,
        hasOwnDesign: false,
        designIds,
        internalStages: [{ name: "Inquiry", completedAt: now }],
        createdAt: now,
        updatedAt: now,
      });
      return { orderId, designIds };
    });
  const mine = await mk(captain.userId, "Falcons");
  const theirs = await mk(other.userId, "Hawks");
  return {
    captain,
    other,
    admin,
    orderId: mine.orderId,
    designId: mine.designIds[0],
    awayId: mine.designIds[1],
    otherOrderId: theirs.orderId,
    otherDesignId: theirs.designIds[0],
  };
}
type World = Awaited<ReturnType<typeof seedWorld>>;

async function lock(t: T, orderId: Id<"orders">) {
  await t.run(async (ctx) => {
    const order = await ctx.db.get(orderId);
    await ctx.db.patch(orderId, {
      internalStages: [
        ...(order?.internalStages ?? []),
        { name: CONFIRMED, completedAt: Date.now() },
      ],
    });
  });
  expect(INTERNAL_STAGES).toContain(CONFIRMED);
}

// Inserts an entry + its size lines directly (no API), the way a state built
// by earlier writes looks. Lines also carry the mirrored flat fields.
async function seedEntry(
  t: T,
  w: Pick<World, "orderId" | "designId">,
  o: {
    name?: string;
    number?: string;
    removedAt?: number;
    lines?: {
      size: string;
      qty?: number;
      source?: "captain" | "fan";
      email?: string;
      createdAt?: number;
      removedAt?: number;
    }[];
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const entryId = await ctx.db.insert("rosterEntries", {
      orderId: w.orderId,
      designId: w.designId,
      name: o.name,
      number: o.number,
      source: "captain",
      removedAt: o.removedAt,
      createdAt: now,
      updatedAt: now,
    });
    const itemIds: Id<"orderItems">[] = [];
    for (const [i, l] of (o.lines ?? []).entries())
      itemIds.push(
        await ctx.db.insert("orderItems", {
          orderId: w.orderId,
          designId: w.designId,
          name: o.name,
          number: o.number,
          rosterEntryId: entryId,
          size: l.size,
          qty: l.qty ?? 1,
          source: l.source ?? "captain",
          submitterEmail: l.email,
          submitterName: l.email ? l.email.split("@")[0] : undefined,
          removedAt: l.removedAt,
          createdAt: l.createdAt ?? now + i,
          updatedAt: now,
        }),
      );
    return { entryId, itemIds };
  });
}

const roster = (t: T, orderId: Id<"orders">) =>
  t.run((ctx) => loadRoster(ctx, orderId));

const allEntries = (t: T, orderId: Id<"orders">) =>
  t.run((ctx) =>
    ctx.db
      .query("rosterEntries")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );

const allItems = (t: T, orderId: Id<"orders">) =>
  t.run((ctx) =>
    ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );

const sizes = (lines: { size?: string; qty: number }[]) =>
  Object.fromEntries(
    Object.entries(
      lines.reduce<Record<string, number>>((acc, l) => {
        acc[l.size ?? "?"] = (acc[l.size ?? "?"] ?? 0) + l.qty;
        return acc;
      }, {}),
    ),
  );

async function rejection(fn: () => Promise<unknown>): Promise<ConvexError<string>> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected the call to be rejected").toBeInstanceOf(ConvexError);
  return caught as ConvexError<string>;
}

const SIDESTEP_SIZES = [
  { size: "S", qty: 1 },
  { size: "M", qty: 3 },
  { size: "XL", qty: 1 },
];

// ── rosterEntries.add ──────────────────────────────────────────────────────

describe("rosterEntries.add: Sidestep #72 takes S×1, M×3, XL×1 as one player with three lines", () => {
  it("makes 1 entry + 3 captain items (sum 5), with the entry's values mirrored onto them", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const res = await w.captain.as.mutation(api.rosterEntries.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "Sidestep",
      number: "72",
      sizes: SIDESTEP_SIZES,
    });
    expect(res.matched).toBe(false);

    const entries = await allEntries(t, w.orderId);
    expect(entries).toHaveLength(1);
    expect(entries[0]._id).toBe(res.entryId);
    expect(entries[0]).toMatchObject({ name: "Sidestep", number: "72", source: "captain" });

    const items = await allItems(t, w.orderId);
    expect(items).toHaveLength(3);
    expect(items.reduce((s, i) => s + i.qty, 0)).toBe(5);
    expect(sizes(items)).toEqual({ S: 1, M: 3, XL: 1 });
    for (const i of items) {
      expect(i.rosterEntryId).toBe(res.entryId);
      expect(i.source).toBe("captain");
      expect(i.orderId).toBe(w.orderId);
      // mirror window: flat copies of the entry's values
      expect(i).toMatchObject({ designId: w.designId, name: "Sidestep", number: "72" });
      expect(i.submitterEmail).toBeUndefined();
    }
  });

  it("a second add of the same print adds to that player and says matched: true", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const first = await w.captain.as.mutation(api.rosterEntries.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "Sidestep",
      number: "72",
      sizes: SIDESTEP_SIZES,
    });
    const second = await w.captain.as.mutation(api.rosterEntries.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: " SIDESTEP ",
      number: "72",
      sizes: [{ size: "L", qty: 1 }],
    });
    expect(second.matched).toBe(true);
    expect(second.entryId).toBe(first.entryId);
    expect(await allEntries(t, w.orderId)).toHaveLength(1);
    const items = await allItems(t, w.orderId);
    expect(items).toHaveLength(4);
    expect(sizes(items)).toEqual({ S: 1, M: 3, XL: 1, L: 1 });
  });

  it("the same print on another design of the order is a different player", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    for (const designId of [w.designId, w.awayId])
      await w.captain.as.mutation(api.rosterEntries.add, {
        orderId: w.orderId,
        designId,
        name: "Sidestep",
        number: "72",
        sizes: [{ size: "M", qty: 1 }],
      });
    expect(await allEntries(t, w.orderId)).toHaveLength(2);
  });

  it("rejects a captain on someone else's order, and a signed-out caller; nothing is written", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const args = {
      orderId: w.otherOrderId,
      designId: w.otherDesignId,
      name: "Sidestep",
      number: "72",
      sizes: SIDESTEP_SIZES,
    };
    await rejection(() => w.captain.as.mutation(api.rosterEntries.add, args));
    await rejection(() => t.mutation(api.rosterEntries.add, args));
    expect(await allEntries(t, w.otherOrderId)).toHaveLength(0);
    expect(await allItems(t, w.otherOrderId)).toHaveLength(0);
  });

  it("a captain on a locked order is rejected, an admin succeeds", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await lock(t, w.orderId);
    const args = {
      orderId: w.orderId,
      designId: w.designId,
      name: "Sidestep",
      number: "72",
      sizes: SIDESTEP_SIZES,
    };
    await rejection(() => w.captain.as.mutation(api.rosterEntries.add, args));
    expect(await allEntries(t, w.orderId)).toHaveLength(0);
    const res = await w.admin.as.mutation(api.rosterEntries.add, args);
    expect(res.matched).toBe(false);
    expect((await allItems(t, w.orderId)).length).toBe(3);
  });

  it("rejects nothing typed + no sizes, a size that doesn't exist, and a design not on the order", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await rejection(() =>
      w.captain.as.mutation(api.rosterEntries.add, {
        orderId: w.orderId,
        designId: w.designId,
        sizes: [],
      }),
    );
    await rejection(() =>
      w.captain.as.mutation(api.rosterEntries.add, {
        orderId: w.orderId,
        designId: w.designId,
        name: "Sam",
        sizes: [{ size: "HUGE", qty: 1 }],
      }),
    );
    await rejection(() =>
      w.captain.as.mutation(api.rosterEntries.add, {
        orderId: w.orderId,
        designId: w.otherDesignId,
        name: "Sam",
        sizes: [{ size: "M", qty: 1 }],
      }),
    );
    expect(await allEntries(t, w.orderId)).toHaveLength(0);
    expect(await allItems(t, w.orderId)).toHaveLength(0);
  });

  it("a named player with no sizes is allowed (\"needs sizes\")", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await w.captain.as.mutation(api.rosterEntries.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "Jordan Lee",
      number: "4",
      sizes: [],
    });
    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(1);
    expect(r.items).toHaveLength(0);
  });
});

// ── rosterEntries.update ───────────────────────────────────────────────────

describe("rosterEntries.update: size deltas, newest line first, and merge", () => {
  it("M −2 takes it from the newest line (fan×2), leaving the captain's older line alone", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId, itemIds } = await seedEntry(t, w, {
      name: "Sidestep",
      number: "72",
      lines: [
        { size: "M", qty: 1, source: "captain", createdAt: 1_000 },
        { size: "M", qty: 2, source: "fan", email: "fan@example.com", createdAt: 2_000 },
      ],
    });
    await w.captain.as.mutation(api.rosterEntries.update, {
      entryId,
      name: "Sidestep",
      number: "72",
      sizeDeltas: [{ size: "M", delta: -2 }],
    });
    const rows = await allItems(t, w.orderId);
    const captainLine = rows.find((r) => r._id === itemIds[0])!;
    const fanLine = rows.find((r) => r._id === itemIds[1])!;
    expect(captainLine.qty).toBe(1);
    expect(captainLine.removedAt).toBeUndefined();
    expect(fanLine.removedAt).toBeDefined(); // soft-removed, not deleted
    expect(fanLine.submitterEmail).toBe("fan@example.com");
    const live = (await roster(t, w.orderId)).items;
    expect(live.map((i) => i._id)).toEqual([itemIds[0]]);
  });

  it("a positive delta inserts a captain line; a delta below zero clamps at 0 without throwing", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId } = await seedEntry(t, w, {
      name: "Sam",
      number: "9",
      lines: [{ size: "M", qty: 1 }],
    });
    await w.captain.as.mutation(api.rosterEntries.update, {
      entryId,
      name: "Sam",
      number: "9",
      sizeDeltas: [
        { size: "L", delta: 2 },
        { size: "M", delta: -5 },
      ],
    });
    const live = (await roster(t, w.orderId)).items;
    expect(sizes(live)).toEqual({ L: 2 });
    expect(live.every((i) => i.qty > 0 && i.source === "captain")).toBe(true);
    expect((await allItems(t, w.orderId)).every((i) => i.qty >= 0)).toBe(true);
  });

  it("a full-replace of the printed values renames the player and mirrors it onto the lines", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId } = await seedEntry(t, w, {
      name: "Sam",
      number: "9",
      lines: [{ size: "M", qty: 1 }],
    });
    await w.captain.as.mutation(api.rosterEntries.update, {
      entryId,
      name: "Samuel",
      number: "9",
      designation: "C",
      sizeDeltas: [],
    });
    const [entry] = await allEntries(t, w.orderId);
    expect(entry).toMatchObject({ name: "Samuel", number: "9", designation: "C" });
    const [item] = await allItems(t, w.orderId);
    expect(item).toMatchObject({ name: "Samuel", number: "9" });
  });

  it("renaming onto an existing player throws without merge; with merge: true one live entry holds both sets of lines, submitters unchanged", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const a = await seedEntry(t, w, {
      name: "Sam",
      number: "9",
      lines: [{ size: "M", qty: 1, source: "captain" }],
    });
    const b = await seedEntry(t, w, {
      name: "Samuel",
      number: "9",
      lines: [{ size: "L", qty: 2, source: "fan", email: "pat@example.com" }],
    });
    const rename = {
      entryId: b.entryId,
      name: "Sam",
      number: "9",
      sizeDeltas: [],
    };
    const err = await rejection(() =>
      w.captain.as.mutation(api.rosterEntries.update, rename),
    );
    expect(String(err.data)).toMatch(/already on/i);
    expect((await roster(t, w.orderId)).entries).toHaveLength(2);

    await w.captain.as.mutation(api.rosterEntries.update, { ...rename, merge: true });
    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]._id).toBe(a.entryId);
    expect(r.items.map((i) => i._id).sort()).toEqual(
      [...a.itemIds, ...b.itemIds].sort(),
    );
    const moved = r.items.find((i) => i._id === b.itemIds[0])!;
    expect(moved.rosterEntryId).toBe(a.entryId);
    expect(moved.source).toBe("fan");
    expect(moved.submitterEmail).toBe("pat@example.com");
    // the source entry is soft-removed, not deleted
    const gone = (await allEntries(t, w.orderId)).find((e) => e._id === b.entryId)!;
    expect(gone.removedAt).toBeDefined();
  });

  it("rejects another captain and a locked order (admin succeeds), resolving the order from the entry", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId } = await seedEntry(t, w, {
      name: "Sam",
      number: "9",
      lines: [{ size: "M", qty: 1 }],
    });
    const args = {
      entryId,
      name: "Sam",
      number: "9",
      sizeDeltas: [{ size: "S", delta: 1 }],
    };
    await rejection(() => w.other.as.mutation(api.rosterEntries.update, args));
    await rejection(() => t.mutation(api.rosterEntries.update, args));
    expect((await allItems(t, w.orderId)).length).toBe(1);

    await lock(t, w.orderId);
    await rejection(() => w.captain.as.mutation(api.rosterEntries.update, args));
    await w.admin.as.mutation(api.rosterEntries.update, args);
    expect((await allItems(t, w.orderId)).length).toBe(2);
  });
});

// ── rosterEntries.remove / restore ─────────────────────────────────────────

describe("rosterEntries.remove / restore: soft delete of the entry alone", () => {
  it("remove hides the entry and all its items from loadRoster without touching item rows; twice is a no-op", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId, itemIds } = await seedEntry(t, w, {
      name: "Sidestep",
      number: "72",
      lines: [{ size: "S" }, { size: "M", qty: 3 }, { size: "XL" }],
    });
    const before = await allItems(t, w.orderId);
    await w.captain.as.mutation(api.rosterEntries.remove, { entryId });
    await w.captain.as.mutation(api.rosterEntries.remove, { entryId });
    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(0);
    expect(r.items).toHaveLength(0);
    expect(await allItems(t, w.orderId)).toEqual(before); // rows untouched
    expect(itemIds).toHaveLength(3);
  });

  it("restore brings back the same item ids", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId, itemIds } = await seedEntry(t, w, {
      name: "Sidestep",
      number: "72",
      lines: [{ size: "S" }, { size: "M", qty: 3 }],
    });
    await w.captain.as.mutation(api.rosterEntries.remove, { entryId });
    await w.captain.as.mutation(api.rosterEntries.restore, { entryId });
    const r = await roster(t, w.orderId);
    expect(r.entries.map((e) => e._id)).toEqual([entryId]);
    expect(r.items.map((i) => i._id).sort()).toEqual([...itemIds].sort());
  });

  it("restoring after the same player was re-added merges into one live entry", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId, itemIds } = await seedEntry(t, w, {
      name: "Sidestep",
      number: "72",
      lines: [{ size: "M", qty: 3 }],
    });
    await w.captain.as.mutation(api.rosterEntries.remove, { entryId });
    const again = await w.captain.as.mutation(api.rosterEntries.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "Sidestep",
      number: "72",
      sizes: [{ size: "L", qty: 1 }],
    });
    expect(again.entryId).not.toBe(entryId);
    await w.captain.as.mutation(api.rosterEntries.restore, { entryId });
    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(1);
    expect(r.items).toHaveLength(2);
    expect(new Set(r.items.map((i) => i.rosterEntryId)).size).toBe(1);
    expect(r.items.map((i) => i._id)).toContain(itemIds[0]);
    expect(sizes(r.items)).toEqual({ M: 3, L: 1 });
  });

  it("rejects another captain and a locked order for remove and restore (admin succeeds)", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId } = await seedEntry(t, w, {
      name: "Sam",
      number: "9",
      lines: [{ size: "M" }],
    });
    await rejection(() => w.other.as.mutation(api.rosterEntries.remove, { entryId }));
    await rejection(() => t.mutation(api.rosterEntries.remove, { entryId }));
    expect((await roster(t, w.orderId)).entries).toHaveLength(1);

    await lock(t, w.orderId);
    await rejection(() => w.captain.as.mutation(api.rosterEntries.remove, { entryId }));
    await w.admin.as.mutation(api.rosterEntries.remove, { entryId });
    expect((await roster(t, w.orderId)).entries).toHaveLength(0);
    await rejection(() => w.captain.as.mutation(api.rosterEntries.restore, { entryId }));
    await rejection(() => w.other.as.mutation(api.rosterEntries.restore, { entryId }));
    await w.admin.as.mutation(api.rosterEntries.restore, { entryId });
    expect((await roster(t, w.orderId)).entries).toHaveLength(1);
  });
});

// ── rosterEntries.addMany ──────────────────────────────────────────────────

describe("rosterEntries.addMany: paste adds players and sizes", () => {
  const players = [
    { name: "Sidestep", number: "72", sizes: [{ size: "M", qty: 1 }] },
    { name: "New Kid", number: "5", sizes: [{ size: "S", qty: 2 }] },
  ];

  it("two players, one matching an existing entry: {added: 1, updated: 1}, still one entry per key", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const { entryId } = await seedEntry(t, w, {
      name: "sidestep",
      number: "72",
      lines: [{ size: "L", qty: 1 }],
    });
    const res = await w.captain.as.mutation(api.rosterEntries.addMany, {
      orderId: w.orderId,
      designId: w.designId,
      players,
    });
    expect(res).toMatchObject({ added: 1, updated: 1 });
    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(2);
    const existing = r.items.filter((i) => i.rosterEntryId === entryId);
    expect(sizes(existing)).toEqual({ L: 1, M: 1 });
    expect(r.items.reduce((s, i) => s + i.qty, 0)).toBe(4);
  });

  it("201 players is rejected and nothing is written", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const many = Array.from({ length: 201 }, (_, i) => ({
      name: `Player ${i}`,
      number: String(i),
      sizes: [{ size: "M", qty: 1 }],
    }));
    await rejection(() =>
      w.captain.as.mutation(api.rosterEntries.addMany, {
        orderId: w.orderId,
        designId: w.designId,
        players: many,
      }),
    );
    expect(await allEntries(t, w.orderId)).toHaveLength(0);
  });

  it("is all-or-nothing: one bad size rejects the whole paste", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await rejection(() =>
      w.captain.as.mutation(api.rosterEntries.addMany, {
        orderId: w.orderId,
        designId: w.designId,
        players: [...players, { name: "Bad", number: "1", sizes: [{ size: "HUGE", qty: 1 }] }],
      }),
    );
    expect(await allEntries(t, w.orderId)).toHaveLength(0);
    expect(await allItems(t, w.orderId)).toHaveLength(0);
  });

  it("rejects another captain, a signed-out caller and a locked order (admin succeeds)", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const args = { orderId: w.orderId, designId: w.designId, players };
    await rejection(() => w.other.as.mutation(api.rosterEntries.addMany, args));
    await rejection(() => t.mutation(api.rosterEntries.addMany, args));
    await lock(t, w.orderId);
    await rejection(() => w.captain.as.mutation(api.rosterEntries.addMany, args));
    expect(await allEntries(t, w.orderId)).toHaveLength(0);
    const res = await w.admin.as.mutation(api.rosterEntries.addMany, args);
    expect(res).toMatchObject({ added: 2, updated: 0 });
  });
});

