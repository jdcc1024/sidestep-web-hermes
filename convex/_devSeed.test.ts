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

// L-02: the fixtures seed `orderItems` directly; the legacy tables are no
// longer written by any path.
async function allItems(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) => ctx.db.query("orderItems").collect());
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

  it("should give the run's order enough items to render a breakdown (L-02)", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    const result = await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });

    const items = (await allItems(t)).filter(
      (i) => i.orderId === result.orderWithRunId,
    );
    expect(items.length).toBeGreaterThan(0);

    // Every item hangs off a design the account owns, or the order page
    // joins to nothing and renders blank anyway.
    expect(items.every((i) => result.designIds.includes(i.designId))).toBe(true);
    expect(items.every((i) => i.removedAt === undefined)).toBe(true);

    // At least one named jersey (a player) and at least one unnamed sized
    // jersey (a blank/spare): an empty tab photographs as a bug report.
    const sized = items.filter((i) => i.size !== undefined);
    expect(sized.some((i) => i.name !== undefined)).toBe(true);
    expect(sized.some((i) => i.name === undefined)).toBe(true);
    // At least one came in through the form, with a submitter and the runId.
    expect(
      items.some(
        (i) => i.runId === result.runId && i.submitterEmail !== undefined,
      ),
    ).toBe(true);

    // More than one size, so the size-breakdown chip row has something to say.
    expect(new Set(sized.map((i) => i.size)).size).toBeGreaterThan(1);
  });

  it("should give the order with no run 2 captain items, one of them Needs size (L-02)", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    const result = await t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });

    const items = (await allItems(t)).filter(
      (i) => i.orderId === result.orderWithoutRunId,
    );
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.source === "captain")).toBe(true);
    expect(items.every((i) => i.runId === undefined)).toBe(true);
    expect(items.every((i) => i.submitterEmail === undefined)).toBe(true);
    expect(items.filter((i) => i.size === undefined)).toHaveLength(1);
    expect(items.filter((i) => i.size !== undefined)).toHaveLength(1);
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
    // Every item sits on a design its own order links.
    const byOrder = new Map(orders.map((o) => [o._id, o]));
    for (const item of await allItems(t))
      expect(byOrder.get(item.orderId)!.designIds).toContain(item.designId);
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
        items: (await ctx.db.query("orderItems").collect()).length,
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
    expect(
      (await allItems(t)).some((i) => i.orderId === foreignOrderId),
    ).toBe(false);
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

// M-01: the design-card roster preview can only be judged against a card
// with a full roster, and its muted "not yet filled" row only against players
// nobody has sized. seedPortalFixtures produces neither. L-02: a "player" is
// a named order item; an unfilled one is a named item with no size.
describe("_devSeed:seedLargeRoster", () => {
  async function seedBase(t: ReturnType<typeof convexTest>) {
    await seedUser(t);
    return t.mutation(internal._devSeed.seedPortalFixtures, {
      email: SNAP_EMAIL,
    });
  }

  function namedOn(
    items: Awaited<ReturnType<typeof allItems>>,
    designId: string,
  ) {
    return items.filter(
      (i) =>
        i.designId === designId && i.name !== undefined && i.removedAt === undefined,
    );
  }

  it("should top the home design up to fifteen named items, the added ones Needs size", async () => {
    const t = convexTest(schema, modules);
    const base = await seedBase(t);

    const result = await t.mutation(internal._devSeed.seedLargeRoster, {
      email: SNAP_EMAIL,
    });

    expect(result.total).toBe(15);
    expect(result.designId).toBe(base.designIds[0]);

    const onDesign = namedOn(await allItems(t), result.designId);
    expect(onDesign).toHaveLength(15);
    expect(onDesign.every((i) => i.orderId === base.orderWithRunId)).toBe(true);

    // The added players must be unsized, or the card photographs as fully
    // filled and the muted treatment never appears.
    expect(onDesign.filter((i) => i.size === undefined).length).toBeGreaterThanOrEqual(
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

  it("should leave the existing items alone, and the away design's roster as it was", async () => {
    const t = convexTest(schema, modules);
    const base = await seedBase(t);
    const before = await allItems(t);

    await t.mutation(internal._devSeed.seedLargeRoster, { email: SNAP_EMAIL });

    const after = await allItems(t);
    const byId = new Map(after.map((i) => [i._id, i]));
    for (const item of before) expect(byId.get(item._id)).toEqual(item);
    expect(namedOn(after, base.designIds[1])).toHaveLength(
      namedOn(before, base.designIds[1]).length,
    );
  });

  it("should refuse before the base fixtures exist", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    await expect(
      t.mutation(internal._devSeed.seedLargeRoster, { email: SNAP_EMAIL }),
    ).rejects.toThrow(/seedPortalFixtures/i);
  });
});
