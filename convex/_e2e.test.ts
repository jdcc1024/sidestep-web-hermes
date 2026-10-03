// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// The E2E seed/cleanup helpers must only ever touch their own tagged rows —
// they run against the shared dev deployment.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");
const EMAIL = "snap@example.com";

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "user_snap",
      email: EMAIL,
      name: "Snap",
      isAdmin: false,
      createdAt: Date.now(),
    }),
  );
  return { t, userId };
}

describe("_e2e seed + cleanup", () => {
  it("seeds an order with one design and no order form", async () => {
    const { t } = await setup();
    const r = await t.mutation(internal._e2e.seedOrder, { email: EMAIL, tag: "e2e-abc123" });
    expect(r.teamName).toBe("E2E e2e-abc123");
    const runs = await t.run((ctx) => ctx.db.query("jerseyRuns").collect());
    expect(runs).toHaveLength(0);
  });

  it("deletes the tagged run's rows, including its order form and items, and nothing else", async () => {
    const { t, userId } = await setup();
    const mine = await t.mutation(internal._e2e.seedOrder, { email: EMAIL, tag: "e2e-mine01" });
    const other = await t.mutation(internal._e2e.seedOrder, { email: EMAIL, tag: "e2e-other1" });
    const realOrderId = await t.run((ctx) =>
      ctx.db.insert("orders", {
        captainId: userId,
        teamName: "Westside FC",
        sport: "Soccer",
        estimatedQuantity: 10,
        hasOwnDesign: false,
        designIds: [],
        internalStages: [],
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("jerseyRuns", {
        orderId: mine.orderId,
        captainId: userId,
        sizeOptions: ["M"],
        namesMode: "open",
        customQuestions: [],
        deadline: Date.now() + 1e9,
        status: "open",
        createdAt: Date.now(),
      });
      await ctx.db.insert("orderItems", {
        orderId: mine.orderId,
        designId: mine.designId,
        qty: 1,
        source: "fan",
        runId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const res = await t.mutation(internal._e2e.cleanup, { email: EMAIL, tag: "e2e-mine01" });
    expect(res).toMatchObject({ orders: 1, designs: 1 });

    const left = await t.run(async (ctx) => ({
      orders: (await ctx.db.query("orders").collect()).map((o) => o._id),
      runs: await ctx.db.query("jerseyRuns").collect(),
      items: await ctx.db.query("orderItems").collect(),
    }));
    expect(left.orders.sort()).toEqual([other.orderId, realOrderId].sort());
    expect(left.runs).toHaveLength(0);
    expect(left.items).toHaveLength(0);
  });

  it("the stale sweep never touches an order without the E2E prefix, however old", async () => {
    const { t, userId } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("orders", {
        captainId: userId,
        teamName: "Old real order",
        sport: "Soccer",
        estimatedQuantity: 10,
        hasOwnDesign: false,
        designIds: [],
        internalStages: [],
        createdAt: 0,
        updatedAt: 0,
      }),
    );
    const res = await t.mutation(internal._e2e.cleanup, { email: EMAIL, olderThanMs: 0 });
    expect(res.orders).toBe(0);
  });

  it("refuses a malformed tag and a call with no scope", async () => {
    const { t } = await setup();
    await expect(t.mutation(internal._e2e.cleanup, { email: EMAIL, tag: "Westside" })).rejects.toThrow();
    await expect(t.mutation(internal._e2e.cleanup, { email: EMAIL })).rejects.toThrow();
  });
});
