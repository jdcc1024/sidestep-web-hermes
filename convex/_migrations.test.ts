// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// L-01 acceptance test for the legacy → orderItems backfill
// (`internal._migrations.backfillOrderItems`). Spec: backlog/L-01 "Backfill",
// docs/architecture/0004-order-items.md "Must answer 2" mapping table.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;

type T = ReturnType<typeof convexTest>;

// The issue's fixture: a slot with 2 entries, an empty slot with a letter, a
// blank entry with qty 3, and an entry on a since-removed design → 5 items.
async function seedLegacyOrder(t: T, teamName = "Falcons") {
  return t.run(async (ctx) => {
    const base = Date.now() - 10 * ONE_DAY;
    const captainId = await ctx.db.insert("users", {
      clerkId: `clerk_${teamName}`,
      email: `${teamName}@example.com`,
      name: teamName,
      isAdmin: false,
      createdAt: base,
    });
    const design = (title: string) =>
      ctx.db.insert("designs", {
        ownerId: captainId,
        title,
        blocks: overviewBlocks(title),
        createdAt: base,
        updatedAt: base,
      });
    const home = await design("Home");
    const old = await design("Old");
    // `old` is no longer linked: it's a since-removed design.
    const orderId = await ctx.db.insert("orders", {
      captainId,
      teamName,
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [home],
      internalStages: [{ name: "Inquiry", completedAt: base }],
      createdAt: base,
      updatedAt: base,
    });
    const runId = await ctx.db.insert("jerseyRuns", {
      orderId,
      captainId,
      sizeOptions: ["S", "M", "L"],
      namesMode: "open",
      customQuestions: [{ id: "q1", label: "Pronouns?" }],
      deadline: base + 30 * ONE_DAY,
      status: "open",
      createdAt: base,
    });

    // Slot with 2 entries (one player, two jerseys, two submitters).
    const filledSlot = await ctx.db.insert("rosterEntries", {
      runId,
      orderId,
      designId: home,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      source: "fan",
      createdAt: base + 1,
    });
    const entryM = await ctx.db.insert("orderEntries", {
      runId,
      designId: home,
      rosterEntryId: filledSlot,
      size: "M",
      qty: 1,
      source: "fan",
      submitterName: "Jordan",
      submitterEmail: "jordan@example.com",
      customAnswers: { q1: "he/him" },
      createdAt: base + 2,
    });
    const entryL = await ctx.db.insert("orderEntries", {
      runId,
      designId: home,
      rosterEntryId: filledSlot,
      size: "L",
      qty: 2,
      source: "fan",
      submitterName: "Jordan's Dad",
      submitterEmail: "dad@example.com",
      createdAt: base + 3,
    });

    // Empty slot with a letter ("not yet filled").
    const emptySlot = await ctx.db.insert("rosterEntries", {
      runId,
      orderId,
      designId: home,
      name: "Sam Ortiz",
      number: "11",
      designation: "A",
      source: "captain",
      createdAt: base + 4,
    });

    // Blank entry (no slot), qty 3.
    const blank = await ctx.db.insert("orderEntries", {
      runId,
      designId: home,
      size: "XL",
      qty: 3,
      source: "captain",
      submitterName: "Cap",
      submitterEmail: "cap@example.com",
      createdAt: base + 5,
    });

    // Entry on the since-removed design.
    const onRemoved = await ctx.db.insert("orderEntries", {
      runId,
      designId: old,
      size: "S",
      qty: 1,
      source: "fan",
      submitterName: "Ana",
      submitterEmail: "ana@example.com",
      customAnswers: { q1: "she/her" },
      createdAt: base + 6,
    });

    return {
      orderId,
      runId,
      home,
      old,
      base,
      ids: { filledSlot, entryM, entryL, emptySlot, blank, onRemoved },
    };
  });
}

async function itemsFor(t: T, orderId: Id<"orders">) {
  return t.run((ctx) =>
    ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );
}

async function legacySnapshot(t: T) {
  return t.run(async (ctx) => ({
    roster: await ctx.db.query("rosterEntries").collect(),
    entries: await ctx.db.query("orderEntries").collect(),
    runs: await ctx.db.query("jerseyRuns").collect(),
  }));
}

describe("backfillOrderItems on a fixture (slot with 2 entries, empty slot with letter, blank entry qty 3, entry on a removed design) creates exactly 5 items with the mapped fields; a second run creates 0", () => {
  it("maps each legacy shape to the right item fields", async () => {
    const t = convexTest(schema, modules);
    const { orderId, runId, home, old, base } = await seedLegacyOrder(t);

    const result = await t.mutation(
      internal._migrations.backfillOrderItems,
      {},
    );
    expect(result).toEqual({ orders: 1, itemsCreated: 5 });

    const items = (await itemsFor(t, orderId)).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    expect(items).toHaveLength(5);
    const strip = (i: Doc<"orderItems">) => {
      // Compare the mapped fields only; ids and bookkeeping vary.
      const { _id, _creationTime, updatedAt, ...rest } = i;
      void _id;
      void _creationTime;
      void updatedAt;
      return rest;
    };

    // Slot + entry M → name / number / letter from the slot, the rest from the entry.
    expect(strip(items[0])).toEqual({
      orderId,
      designId: home,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "M",
      qty: 1,
      source: "fan",
      submitterName: "Jordan",
      submitterEmail: "jordan@example.com",
      customAnswers: { q1: "he/him" },
      runId,
      createdAt: base + 2,
    });
    // Same slot, entry L: a second item sharing the name.
    expect(strip(items[1])).toEqual({
      orderId,
      designId: home,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "L",
      qty: 2,
      source: "fan",
      submitterName: "Jordan's Dad",
      submitterEmail: "dad@example.com",
      runId,
      createdAt: base + 3,
    });
    // Empty slot → name / number / letter, no size, source from the slot, no submitter.
    expect(items[2]).toMatchObject({
      orderId,
      designId: home,
      name: "Sam Ortiz",
      number: "11",
      designation: "A",
      qty: 1,
      source: "captain",
      createdAt: base + 4,
    });
    expect(items[2].size).toBeUndefined();
    expect(items[2].submitterName).toBeUndefined();
    expect(items[2].submitterEmail).toBeUndefined();
    expect(items[2].customAnswers).toBeUndefined();
    // Blank entry → no name / number / letter, the rest from the entry.
    expect(strip(items[3])).toEqual({
      orderId,
      designId: home,
      size: "XL",
      qty: 3,
      source: "captain",
      submitterName: "Cap",
      submitterEmail: "cap@example.com",
      runId,
      createdAt: base + 5,
    });
    // Entry on the removed design → copied as-is.
    expect(strip(items[4])).toEqual({
      orderId,
      designId: old,
      size: "S",
      qty: 1,
      source: "fan",
      submitterName: "Ana",
      submitterEmail: "ana@example.com",
      customAnswers: { q1: "she/her" },
      runId,
      createdAt: base + 6,
    });
    for (const i of items) expect(i.removedAt).toBeUndefined();
  });

  it("creates 0 on a second run", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedLegacyOrder(t);

    await t.mutation(internal._migrations.backfillOrderItems, {});
    const second = await t.mutation(
      internal._migrations.backfillOrderItems,
      {},
    );
    expect(second.itemsCreated).toBe(0);
    expect(await itemsFor(t, orderId)).toHaveLength(5);
  });

  it("skips an order that already has any item but still backfills the others", async () => {
    const t = convexTest(schema, modules);
    const done = await seedLegacyOrder(t, "Done");
    const todo = await seedLegacyOrder(t, "Todo");
    await t.run((ctx) =>
      ctx.db.insert("orderItems", {
        orderId: done.orderId,
        designId: done.home,
        qty: 1,
        source: "captain",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    const result = await t.mutation(
      internal._migrations.backfillOrderItems,
      {},
    );
    expect(result.itemsCreated).toBe(5);
    expect(await itemsFor(t, done.orderId)).toHaveLength(1);
    expect(await itemsFor(t, todo.orderId)).toHaveLength(5);
  });

  it("leaves the legacy tables untouched", async () => {
    const t = convexTest(schema, modules);
    await seedLegacyOrder(t);
    const before = await legacySnapshot(t);

    await t.mutation(internal._migrations.backfillOrderItems, {});

    expect(await legacySnapshot(t)).toEqual(before);
  });
});
