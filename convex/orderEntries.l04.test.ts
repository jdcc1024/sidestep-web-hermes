// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// L-04 §2, server half: the run-keyed removal queries are deleted, and the
// order-keyed ones answer for an order with NO order form (the case the
// run-keyed pair warned nobody about).
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as orderEntries from "./orderEntries";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

describe("the two run-keyed queries are deleted from convex/orderEntries.ts", () => {
  it("affectedByDesignRemoval and removedDesigns are no longer exported", () => {
    const exported = orderEntries as Record<string, unknown>;
    expect(exported.affectedByDesignRemoval).toBeUndefined();
    expect(exported.removedDesigns).toBeUndefined();
  });

  it("submitOrder and the other order-entry functions are still there (no collateral deletion)", () => {
    expect(orderEntries.submitOrder).toBeDefined();
  });
});

describe("a form-less order: unlinking Away Kit warns about 2 captain items; afterwards they're listed as removed", () => {
  async function seed() {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const subject = "captain_l04";
    const ids = await t.run(async (ctx) => {
      const captainId = await ctx.db.insert("users", {
        clerkId: subject,
        email: "cap@example.com",
        name: "Cap",
        isAdmin: false,
        createdAt: now,
      });
      const mk = (title: string) =>
        ctx.db.insert("designs", {
          ownerId: captainId,
          title,
          blocks: overviewBlocks(`${title} kit`),
          createdAt: now,
          updatedAt: now,
        });
      const home = await mk("Home Kit");
      const away = await mk("Away Kit");
      const orderId = await ctx.db.insert("orders", {
        captainId,
        teamName: "Falcons",
        sport: "Soccer",
        estimatedQuantity: 12,
        hasOwnDesign: false,
        designIds: [home, away],
        internalStages: [{ name: "Inquiry", completedAt: now }],
        createdAt: now,
        updatedAt: now,
      });
      return { orderId, home, away };
    });
    const as = t.withIdentity({
      subject,
      email: "cap@example.com",
      name: "Cap",
    });
    return { t, as, ...ids };
  }

  it("affectedByDesignRemoval counts the 2 captain items with no run and no submitters", async () => {
    const { t, as, orderId, away } = await seed();
    await as.mutation(api.orderItems.addMany, {
      orderId,
      designId: away,
      rows: [
        { name: "Lemieux", number: "66", size: "M" },
        { name: "Bure", number: "10" },
      ],
    });
    // No jerseyRuns row exists at all.
    const runs = await t.run((ctx) => ctx.db.query("jerseyRuns").collect());
    expect(runs).toHaveLength(0);

    const affected = await as.query(api.orderItems.affectedByDesignRemoval, {
      orderId,
      designId: away,
    });
    expect(affected.itemCount).toBe(2);
    expect(affected.submitters).toEqual([]);
  });

  it("after the design is unlinked, listForOrder().removedDesigns lists Away Kit with its 2 items", async () => {
    const { t, as, orderId, home, away } = await seed();
    await as.mutation(api.orderItems.addMany, {
      orderId,
      designId: away,
      rows: [
        { name: "Lemieux", number: "66", size: "M" },
        { name: "Bure", number: "10" },
      ],
    });
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [home] }));

    const list = await as.query(api.orderItems.listForOrder, { orderId });
    expect(list).not.toBeNull();
    expect(list!.removedDesigns).toHaveLength(1);
    expect(list!.removedDesigns[0]).toMatchObject({
      designId: away as Id<"designs">,
      title: "Away Kit",
    });
    // Same count the warning gave before the save: nobody is lost silently.
    expect(list!.removedDesigns[0].itemCount).toBe(2);
  });
});
