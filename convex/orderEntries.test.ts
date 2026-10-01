// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;

// Same chain as the roster-entry tests: captain → design → order → run.
async function seedRun(t: ReturnType<typeof convexTest>) {
  const now = Date.now();
  const subject = "captain_clerk";
  const { userId, designId, orderId, runId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: subject,
      email: "captain@example.com",
      name: "Cap",
      isAdmin: false,
      createdAt: now,
    });
    const designId = await ctx.db.insert("designs", {
      ownerId: userId,
      title: "Home",
      blocks: overviewBlocks("home kit"),
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId: userId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [designId],
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    const runId = await ctx.db.insert("jerseyRuns", {
      orderId,
      captainId: userId,
      sizeOptions: ["S", "M", "L"],
      namesMode: "open",
      customQuestions: [],
      deadline: now + 7 * ONE_DAY,
      status: "open",
      createdAt: now,
    });
    return { userId, designId, orderId, runId };
  });
  return {
    userId,
    designId,
    orderId,
    runId,
    asCaptain: t.withIdentity({
      subject,
      email: "captain@example.com",
      name: "Cap",
    }),
  };
}

const submitter = {
  submitterName: "Fan One",
  submitterEmail: "fan@example.com",
};

describe("orderEntries.create", () => {
  it("creates a blank/bulk line with no roster entry", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    const id = await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "M",
      qty: 5,
      ...submitter,
    });

    const entry = await t.run((ctx) => ctx.db.get(id));
    expect(entry?.rosterEntryId).toBeUndefined();
    expect(entry?.qty).toBe(5);
    expect(entry?.submitterEmail).toBe("fan@example.com");
    expect(entry?.source).toBe("captain");
  });

  it("attaches to a roster entry on the same run + design", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const rosterEntryId = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });

    const id = await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      rosterEntryId,
      size: "L",
      qty: 1,
      source: "fan",
      ...submitter,
    });

    const entry = await t.run((ctx) => ctx.db.get(id));
    expect(entry?.rosterEntryId).toBe(rosterEntryId);
    expect(entry?.source).toBe("fan");
  });

  it("rejects a roster entry from a different design", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain, userId, orderId } = await seedRun(t);
    // Add a second design to the order and a roster entry on it.
    const otherDesignId = await t.run(async (ctx) => {
      const d = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Away",
        blocks: overviewBlocks("away kit"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const order = await ctx.db.get(orderId);
      await ctx.db.patch(orderId, { designIds: [...order!.designIds, d] });
      return d;
    });
    const otherSlot = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId: otherDesignId,
      name: "Luongo",
      number: "1",
    });

    await expect(
      asCaptain.mutation(api.orderEntries.create, {
        runId,
        designId, // Home design, but slot is on Away
        rosterEntryId: otherSlot,
        size: "M",
        qty: 1,
        ...submitter,
      }),
    ).rejects.toThrow(/different design/);
  });

  it("rejects a size not in the run's options", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await expect(
      asCaptain.mutation(api.orderEntries.create, {
        runId,
        designId,
        size: "XXXL",
        qty: 1,
        ...submitter,
      }),
    ).rejects.toThrow();
  });

  it("rejects a zero quantity", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await expect(
      asCaptain.mutation(api.orderEntries.create, {
        runId,
        designId,
        size: "M",
        qty: 0,
        ...submitter,
      }),
    ).rejects.toThrow();
  });

  it("rejects creating an order entry once the run is locked (R-06)", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await asCaptain.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    await expect(
      asCaptain.mutation(api.orderEntries.create, {
        runId,
        designId,
        size: "M",
        qty: 1,
        ...submitter,
      }),
    ).rejects.toThrow(/locked/i);
  });
});

describe("orderEntries.listByRun", () => {
  it("returns every order entry on the run for the captain", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "M",
      qty: 2,
      ...submitter,
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "L",
      qty: 3,
      ...submitter,
    });

    const entries = await asCaptain.query(api.orderEntries.listByRun, {
      runId,
    });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, e) => sum + e.qty, 0)).toBe(5);
  });
});

// Adds a second design (Away) to the order so the per-design grouping has
// something to split across. Returns its id.
async function addAwayDesign(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  orderId: Id<"orders">,
) {
  return t.run(async (ctx) => {
    const d = await ctx.db.insert("designs", {
      ownerId: userId,
      title: "Away",
      blocks: overviewBlocks("away kit"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const order = await ctx.db.get(orderId);
    await ctx.db.patch(orderId, { designIds: [...order!.designIds, d] });
    return d;
  });
}

describe("orderEntries.countsByRun", () => {
  it("totals Σ qty and groups per design, counting blank lines and zeroing empty slots", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, userId, asCaptain } = await seedRun(t);
    const awayId = await addAwayDesign(t, userId, orderId);

    // A filled slot on Home (qty 2).
    const slot = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      rosterEntryId: slot,
      size: "M",
      qty: 2,
      ...submitter,
    });
    // A not-yet-filled slot on Home — a roster entry with no order entry.
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Lemieux",
      number: "66",
    });
    // A blank/bulk line on Home (no roster entry), qty 3.
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "L",
      qty: 3,
      ...submitter,
    });
    // An order entry on Away, qty 4.
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId: awayId,
      size: "S",
      qty: 4,
      ...submitter,
    });

    const counts = await asCaptain.query(api.orderEntries.countsByRun, {
      runId,
    });

    expect(counts.total).toBe(9); // 2 + 3 + 4; empty slot contributes 0
    expect(counts.byDesign).toEqual([
      { designId, title: "Home", total: 5 },
      { designId: awayId, title: "Away", total: 4 },
    ]);
  });

  it("excludes order entries on a design removed from the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, userId, asCaptain } = await seedRun(t);
    const awayId = await addAwayDesign(t, userId, orderId);

    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "M",
      qty: 2,
      ...submitter,
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId: awayId,
      size: "L",
      qty: 4,
      ...submitter,
    });

    // Remove Away from the order — its entries become "removed-design" rows.
    await t.run(async (ctx) => {
      await ctx.db.patch(orderId, { designIds: [designId] });
    });

    const counts = await asCaptain.query(api.orderEntries.countsByRun, {
      runId,
    });
    expect(counts.total).toBe(2); // Away's 4 dropped out
    expect(counts.byDesign).toEqual([{ designId, title: "Home", total: 2 }]);
  });

  it("returns an empty shape for a missing run", async () => {
    const t = convexTest(schema, modules);
    const { runId, asCaptain } = await seedRun(t);
    // Delete the run so its id dangles — the query should return the empty
    // shape rather than throw.
    await t.run(async (ctx) => {
      await ctx.db.delete(runId);
    });

    const counts = await asCaptain.query(api.orderEntries.countsByRun, {
      runId,
    });
    expect(counts).toEqual({ total: 0, byDesign: [] });
  });

  it("rejects a non-captain non-admin", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedRun(t);

    const asStranger = t.withIdentity({
      subject: "stranger_clerk",
      email: "stranger@example.com",
      name: "Nobody",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "stranger_clerk",
        email: "stranger@example.com",
        name: "Nobody",
        isAdmin: false,
        createdAt: Date.now(),
      });
    });

    await expect(
      asStranger.query(api.orderEntries.countsByRun, { runId }),
    ).rejects.toThrow(/access/);
  });
});

// R-05 relabel: a design's roster + order entries reference it by id, so
// renaming the design (a "relabel") must carry every entry over untouched
// and leave the count whole — renaming is not data loss.
describe("R-05 relabel", () => {
  it("renaming a design carries its entries and count over untouched", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    const slot = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });
    const entryId = await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      rosterEntryId: slot,
      size: "M",
      qty: 3,
      ...submitter,
    });

    const before = await asCaptain.query(api.orderEntries.countsByRun, { runId });
    expect(before.total).toBe(3);

    // Relabel: rename the design. Entries key off designId, so this touches
    // none of them — only the displayed title changes.
    await t.run(async (ctx) => {
      await ctx.db.patch(designId, { title: "Home (2026 kit)" });
    });

    const after = await asCaptain.query(api.orderEntries.countsByRun, { runId });
    expect(after.total).toBe(3);
    expect(after.byDesign).toEqual([
      { designId, title: "Home (2026 kit)", total: 3 },
    ]);

    // The entry itself is the same row, still pointing at the same slot.
    const entry = await t.run((ctx) => ctx.db.get(entryId));
    expect(entry?.designId).toBe(designId);
    expect(entry?.rosterEntryId).toBe(slot);
    expect(entry?.qty).toBe(3);
  });
});

// L-02: these two keep their `runId` args (L-04 re-keys the UI) but read the
// items of `run.orderId`, so they see items added before the form existed
// and never see a removed one.
async function seedItem(
  t: ReturnType<typeof convexTest>,
  orderId: Id<"orders">,
  designId: Id<"designs">,
  fields: Partial<{
    name: string;
    number: string;
    size: string;
    qty: number;
    source: "captain" | "fan";
    submitterName: string;
    submitterEmail: string;
    runId: Id<"jerseyRuns">;
    removedAt: number;
    createdAt: number;
  }> = {},
): Promise<Id<"orderItems">> {
  const createdAt = fields.createdAt ?? Date.now();
  return t.run((ctx) =>
    ctx.db.insert("orderItems", {
      orderId,
      designId,
      qty: 1,
      source: "fan",
      ...fields,
      createdAt,
      updatedAt: createdAt,
    }),
  );
}

describe("orderEntries.affectedByDesignRemoval", () => {
  it("names the distinct submitters and sums the jerseys on a design, from its items (L-02)", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, asCaptain } = await seedRun(t);

    // Two fans order the Home design; one of them twice.
    await seedItem(t, orderId, designId, {
      size: "M",
      qty: 2,
      submitterName: "Ann",
      submitterEmail: "ann@example.com",
      runId,
      createdAt: 1_000,
    });
    await seedItem(t, orderId, designId, {
      size: "L",
      qty: 1,
      submitterName: "Ann",
      submitterEmail: "ann@example.com",
      runId,
      createdAt: 2_000,
    });
    await seedItem(t, orderId, designId, {
      size: "S",
      qty: 4,
      submitterName: "Bob",
      submitterEmail: "bob@example.com",
      runId,
      createdAt: 3_000,
    });

    const affected = await asCaptain.query(
      api.orderEntries.affectedByDesignRemoval,
      { runId, designId },
    );

    expect(affected.designId).toBe(designId);
    expect(affected.title).toBe("Home");
    expect(affected.entryCount).toBe(3);
    expect(affected.total).toBe(7); // 2 + 1 + 4
    expect(affected.submitters).toEqual([
      { name: "Ann", email: "ann@example.com", qty: 3 },
      { name: "Bob", email: "bob@example.com", qty: 4 },
    ]);
  });

  it("names nobody when the design's only items were added by the captain", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, asCaptain } = await seedRun(t);
    // A captain's player with no submitter — nobody has actually ordered.
    await seedItem(t, orderId, designId, {
      name: "Lemieux",
      number: "66",
      source: "captain",
    });

    const affected = await asCaptain.query(
      api.orderEntries.affectedByDesignRemoval,
      { runId, designId },
    );
    expect(affected.submitters).toEqual([]);
  });

  it("leaves out removed items", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, asCaptain } = await seedRun(t);
    await seedItem(t, orderId, designId, {
      size: "M",
      qty: 2,
      submitterName: "Ann",
      submitterEmail: "ann@example.com",
    });
    await seedItem(t, orderId, designId, {
      size: "L",
      qty: 5,
      submitterName: "Gone",
      submitterEmail: "gone@example.com",
      removedAt: Date.now(),
    });

    const affected = await asCaptain.query(
      api.orderEntries.affectedByDesignRemoval,
      { runId, designId },
    );
    expect(affected.total).toBe(2);
    expect(affected.entryCount).toBe(1);
    expect(affected.submitters).toEqual([
      { name: "Ann", email: "ann@example.com", qty: 2 },
    ]);
  });

  it("rejects a non-captain non-admin", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId } = await seedRun(t);
    const asStranger = t.withIdentity({
      subject: "stranger_clerk",
      email: "stranger@example.com",
      name: "Nobody",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "stranger_clerk",
        email: "stranger@example.com",
        name: "Nobody",
        isAdmin: false,
        createdAt: Date.now(),
      });
    });
    await expect(
      asStranger.query(api.orderEntries.affectedByDesignRemoval, {
        runId,
        designId,
      }),
    ).rejects.toThrow(/access/);
  });
});

describe("orderEntries.removedDesigns", () => {
  it("surfaces removed designs with their items, dropped from itemCount but still visible (L-02)", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, userId, asCaptain } = await seedRun(t);
    const awayId = await addAwayDesign(t, userId, orderId);

    await seedItem(t, orderId, designId, { size: "M", qty: 2, ...submitter });
    await seedItem(t, orderId, awayId, {
      size: "L",
      qty: 4,
      submitterName: "Bob",
      submitterEmail: "bob@example.com",
    });

    // No removed designs while both are still linked.
    const beforeRemoval = await asCaptain.query(
      api.orderEntries.removedDesigns,
      { runId },
    );
    expect(beforeRemoval).toEqual([]);

    // Remove Away from the order — non-destructively (drop the id only).
    await t.run(async (ctx) => {
      await ctx.db.patch(orderId, { designIds: [designId] });
    });

    const removed = await asCaptain.query(api.orderEntries.removedDesigns, {
      runId,
    });
    expect(removed).toHaveLength(1);
    expect(removed[0]).toEqual({
      designId: awayId,
      title: "Away",
      entryCount: 1,
      total: 4,
      submitters: [{ name: "Bob", email: "bob@example.com", qty: 4 }],
    });

    // The removed jerseys fall out of the order's total but the rows survive.
    const list = await asCaptain.query(api.orderItems.listForOrder, { orderId });
    expect(list!.summary.itemCount).toBe(2);
    expect(list!.removedDesigns.map((d) => d.designId)).toEqual([awayId]);
  });

  it("leaves out removed items, and a design whose items were all removed", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, userId, asCaptain } = await seedRun(t);
    const awayId = await addAwayDesign(t, userId, orderId);
    const warmupId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Warmup",
        blocks: overviewBlocks("warmup"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await seedItem(t, orderId, awayId, { size: "L", qty: 4, ...submitter });
    await seedItem(t, orderId, awayId, {
      size: "M",
      qty: 9,
      ...submitter,
      removedAt: Date.now(),
    });
    await seedItem(t, orderId, warmupId, {
      size: "S",
      ...submitter,
      removedAt: Date.now(),
    });
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));

    const removed = await asCaptain.query(api.orderEntries.removedDesigns, {
      runId,
    });
    expect(removed.map((r) => [r.designId, r.total])).toEqual([[awayId, 4]]);
  });

  it("returns [] for a missing run", async () => {
    const t = convexTest(schema, modules);
    const { runId, asCaptain } = await seedRun(t);
    await t.run(async (ctx) => {
      await ctx.db.delete(runId);
    });
    const removed = await asCaptain.query(api.orderEntries.removedDesigns, {
      runId,
    });
    expect(removed).toEqual([]);
  });
});
