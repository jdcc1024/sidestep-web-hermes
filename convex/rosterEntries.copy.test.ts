// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// R2-01: `rosterEntries.copyToDesign` and the blank-entry invariant, which the
// acceptance tests (rosterEntries.r201.test.ts) don't name. Design note:
// docs/architecture/0004-roster-sizes.md "Writes" + invariant 3.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { loadRoster } from "./_orderItems";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
type T = TestConvex<typeof schema>;

async function seed(t: T) {
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const mkUser = (clerkId: string) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@example.com`,
        name: clerkId,
        isAdmin: false,
        createdAt: now,
      });
    const captainId = await mkUser("captain");
    await mkUser("stranger");
    const designIds: Id<"designs">[] = [];
    for (const title of ["Home", "Away"])
      designIds.push(
        await ctx.db.insert("designs", {
          ownerId: captainId,
          title,
          blocks: overviewBlocks(title),
          createdAt: now,
          updatedAt: now,
        }),
      );
    const orderId = await ctx.db.insert("orders", {
      captainId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds,
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    return { orderId, home: designIds[0], away: designIds[1] };
  });
  const as = (subject: string) =>
    t.withIdentity({ subject, email: `${subject}@example.com`, name: subject });
  return { ...ids, captain: as("captain"), stranger: as("stranger") };
}

describe("rosterEntries.copyToDesign", () => {
  it("should copy players with their letter and no sizes, skip ones already there, and leave blank entries behind", async () => {
    const t = convexTest(schema, modules);
    const w = await seed(t);
    const add = (designId: Id<"designs">, o: object) =>
      w.captain.mutation(api.rosterEntries.add, {
        orderId: w.orderId,
        designId,
        sizes: [{ size: "M", qty: 1 }],
        ...o,
      });
    await add(w.home, { name: "Sam", number: "9", designation: "C" });
    await add(w.home, { name: "Lee", number: "4" });
    await add(w.home, {}); // blank jerseys
    await add(w.away, { name: " sam ", number: "9" });

    const res = await w.captain.mutation(api.rosterEntries.copyToDesign, {
      orderId: w.orderId,
      sourceDesignId: w.home,
      targetDesignId: w.away,
    });
    expect(res).toEqual({ copied: 1, skipped: 1 });

    const { entries, items } = await t.run((ctx) => loadRoster(ctx, w.orderId));
    const away = entries.filter((e) => e.designId === w.away);
    expect(away.map((e) => e.name).sort()).toEqual(["Lee", "sam"]);
    const lee = away.find((e) => e.name === "Lee")!;
    expect(items.filter((i) => i.rosterEntryId === lee._id)).toHaveLength(0);

    const again = await w.captain.mutation(api.rosterEntries.copyToDesign, {
      orderId: w.orderId,
      sourceDesignId: w.home,
      targetDesignId: w.away,
    });
    expect(again).toEqual({ copied: 0, skipped: 2 });
  });

  it("should carry the letter onto the copied player", async () => {
    const t = convexTest(schema, modules);
    const w = await seed(t);
    await w.captain.mutation(api.rosterEntries.add, {
      orderId: w.orderId,
      designId: w.home,
      name: "Sam",
      number: "9",
      designation: "C",
      sizes: [],
    });
    await w.captain.mutation(api.rosterEntries.copyToDesign, {
      orderId: w.orderId,
      sourceDesignId: w.home,
      targetDesignId: w.away,
    });
    const { entries } = await t.run((ctx) => loadRoster(ctx, w.orderId));
    expect(entries.find((e) => e.designId === w.away)).toMatchObject({
      name: "Sam",
      number: "9",
      designation: "C",
    });
  });

  it("should reject another captain", async () => {
    const t = convexTest(schema, modules);
    const w = await seed(t);
    await expect(
      w.stranger.mutation(api.rosterEntries.copyToDesign, {
        orderId: w.orderId,
        sourceDesignId: w.home,
        targetDesignId: w.away,
      }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});

describe("a blank entry is removed by the write that empties it", () => {
  it("should soft-remove blank jerseys when their last size is taken away", async () => {
    const t = convexTest(schema, modules);
    const w = await seed(t);
    const { entryId } = await w.captain.mutation(api.rosterEntries.add, {
      orderId: w.orderId,
      designId: w.home,
      sizes: [{ size: "L", qty: 2 }],
    });
    await w.captain.mutation(api.rosterEntries.update, {
      entryId,
      sizeDeltas: [{ size: "L", delta: -2 }],
    });
    const { entries } = await t.run((ctx) => loadRoster(ctx, w.orderId));
    expect(entries).toHaveLength(0);
  });
});
