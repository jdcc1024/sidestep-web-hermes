// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

const SNAP_EMAIL = "snap@example.com";

async function seedUser(
  t: ReturnType<typeof convexTest>,
  email = SNAP_EMAIL,
  clerkId = "user_snap_clerk",
) {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId,
      email,
      name: email,
      isAdmin: false,
      createdAt: Date.now(),
    }),
  );
}

describe("_devSeed:seedPortalFixtures", () => {
  it("should give the named account one order with a run and one without", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const result = await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });

    const orders = await t.run((ctx) => ctx.db.query("orders").collect());
    expect(orders).toHaveLength(2);
    expect(orders.every((o) => o.captainId === userId)).toBe(true);

    const runs = await t.run((ctx) => ctx.db.query("jerseyRuns").collect());
    expect(runs).toHaveLength(1);
    expect(runs[0].orderId).toBe(result.orderWithRunId);
    expect(runs[0].captainId).toBe(userId);

    // The other order must have no run at all — that's the whole point of it:
    // it's the only way B-04's NoRunYet branch can be photographed.
    const runsForNoRunOrder = runs.filter(
      (r) => r.orderId === result.orderWithoutRunId,
    );
    expect(runsForNoRunOrder).toEqual([]);
  });

  it("should give the run enough roster and order entries to render a breakdown", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    const result = await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });

    const roster = await t.run((ctx) =>
      ctx.db.query("rosterEntries").collect(),
    );
    const entries = await t.run((ctx) =>
      ctx.db.query("orderEntries").collect(),
    );

    expect(roster.length).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThan(0);

    // Every row hangs off the seeded run and a design the account owns, or the
    // responses page joins to nothing and renders blank anyway.
    expect(roster.every((r) => r.runId === result.runId)).toBe(true);
    expect(roster.every((r) => r.orderId === result.orderWithRunId)).toBe(true);
    expect(entries.every((e) => e.runId === result.runId)).toBe(true);
    expect(
      entries.every((e) => result.designIds.includes(e.designId)),
    ).toBe(true);

    // At least one fan line attached to a roster slot (the "By roster" view)
    // and at least one blank/spare line (the "By fan" view) — C-02 has three
    // tabs and an empty one photographs as a bug report.
    expect(entries.some((e) => e.rosterEntryId !== undefined)).toBe(true);
    expect(entries.some((e) => e.rosterEntryId === undefined)).toBe(true);

    // More than one size, so the size-breakdown chip row has something to say.
    expect(new Set(entries.map((e) => e.size)).size).toBeGreaterThan(1);
  });

  it("should link both orders to designs the account owns", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const result = await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });

    const designs = await t.run((ctx) => ctx.db.query("designs").collect());
    expect(designs.length).toBeGreaterThan(0);
    expect(designs.every((d) => d.ownerId === userId)).toBe(true);

    const orders = await t.run((ctx) => ctx.db.query("orders").collect());
    for (const order of orders) {
      expect(order.designIds.length).toBeGreaterThan(0);
      // An order linking a design the captain doesn't own is rejected by
      // updateOrder, so the seeded order would be uneditable in the UI.
      expect(
        order.designIds.every((id) => result.designIds.includes(id)),
      ).toBe(true);
    }
  });

  it("should be idempotent — a second run adds nothing", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    const first = await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });
    const counts = async () =>
      t.run(async (ctx) => ({
        designs: (await ctx.db.query("designs").collect()).length,
        orders: (await ctx.db.query("orders").collect()).length,
        runs: (await ctx.db.query("jerseyRuns").collect()).length,
        roster: (await ctx.db.query("rosterEntries").collect()).length,
        entries: (await ctx.db.query("orderEntries").collect()).length,
      }));
    const after1 = await counts();

    const second = await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });
    const after2 = await counts();

    expect(after2).toEqual(after1);
    expect(second.orderWithRunId).toBe(first.orderWithRunId);
    expect(second.orderWithoutRunId).toBe(first.orderWithoutRunId);
    expect(second.runId).toBe(first.runId);
    expect(second.created).toBe(false);
    expect(first.created).toBe(true);
  });

  it("should leave other accounts' rows untouched", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    const otherId = await seedUser(t, "someone.else@example.com", "user_other");
    const foreignOrderId = await t.run((ctx) =>
      ctx.db.insert("orders", {
        captainId: otherId,
        teamName: "Not mine",
        sport: "Dodgeball",
        estimatedQuantity: 5,
        hasOwnDesign: false,
        designIds: [],
        internalStages: [{ name: "Inquiry", completedAt: Date.now() }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });

    const foreign = await t.run((ctx) => ctx.db.get(foreignOrderId));
    expect(foreign).toMatchObject({ teamName: "Not mine", designIds: [] });
    const mine = await t.run((ctx) =>
      ctx.db
        .query("orders")
        .withIndex("by_captain", (q) => q.eq("captainId", otherId))
        .collect(),
    );
    expect(mine).toHaveLength(1);
  });

  it("should refuse to invent a user when the email is unknown", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal._devSeed.seedPortalFixtures, {
        email: "nobody@example.com",
      }),
    ).rejects.toThrow(/no user/i);

    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users).toEqual([]);
  });

  it("should adopt an existing fixture design rather than duplicating it", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    // Simulate a half-finished earlier run: the design exists, nothing else does.
    await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Snap Demo — Home Kit",
        blocks: overviewBlocks("Pre-existing"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });

    const homeKits = await t.run(async (ctx) =>
      (await ctx.db.query("designs").collect()).filter(
        (d) => d.title === "Snap Demo — Home Kit",
      ),
    );
    expect(homeKits).toHaveLength(1);
    // Adopted, not overwritten: the existing brief is left alone.
    expect(homeKits[0].blocks[0]).toMatchObject({ body: "Pre-existing" });
  });
});

// M-01: the design-card roster preview's overflow cap can only be judged
// against a card that overflows, and its muted "not yet filled" row only
// against slots nobody has ordered for. seedPortalFixtures produces neither.
describe("_devSeed:seedLargeRoster", () => {
  async function seedBase(t: ReturnType<typeof convexTest>) {
    await seedUser(t);
    return t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });
  }

  it("should top the home design up to a full roster of unfilled slots", async () => {
    const t = convexTest(schema, modules);
    const base = await seedBase(t);

    const result = await t.mutation(internal._devSeed.seedLargeRoster, {
      email: SNAP_EMAIL,
    });

    expect(result.total).toBe(15);
    expect(result.designId).toBe(base.designIds[0]);

    const onDesign = await t.run(async (ctx) =>
      (await ctx.db.query("rosterEntries").collect()).filter(
        (r) => r.designId === result.designId,
      ),
    );
    expect(onDesign).toHaveLength(15);

    // The added slots must be unordered, or the card photographs as fully
    // filled and the muted treatment never appears.
    const entries = await t.run((ctx) => ctx.db.query("orderEntries").collect());
    const filled = new Set(
      entries.map((e) => e.rosterEntryId).filter(Boolean) as string[],
    );
    expect(onDesign.filter((r) => !filled.has(r._id))).toHaveLength(
      15 - result.before,
    );
  });

  it("should be idempotent — a second run adds nothing", async () => {
    const t = convexTest(schema, modules);
    await seedBase(t);

    await t.mutation(internal._devSeed.seedLargeRoster, { email: SNAP_EMAIL });
    const second = await t.mutation(internal._devSeed.seedLargeRoster, {
      email: SNAP_EMAIL,
    });

    expect(second.added).toBe(0);
    expect(second.total).toBe(15);
  });

  it("should leave the already-filled slots and their jerseys alone", async () => {
    const t = convexTest(schema, modules);
    const base = await seedBase(t);
    const before = await t.run((ctx) => ctx.db.query("orderEntries").collect());

    await t.mutation(internal._devSeed.seedLargeRoster, { email: SNAP_EMAIL });

    const after = await t.run((ctx) => ctx.db.query("orderEntries").collect());
    expect(after).toEqual(before);
    // …and the away design keeps exactly the roster it had.
    const away = await t.run(async (ctx) =>
      (await ctx.db.query("rosterEntries").collect()).filter(
        (r) => r.designId === base.designIds[1],
      ),
    );
    expect(away).toHaveLength(1);
  });

  it("should refuse before the base fixtures exist", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    await expect(
      t.mutation(internal._devSeed.seedLargeRoster, { email: SNAP_EMAIL }),
    ).rejects.toThrow(/seedPortalFixtures/i);
  });
});
