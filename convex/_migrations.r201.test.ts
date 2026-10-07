// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// R2-01 acceptance tests (initiative 0004, phase 1b): the widen+group migration
// `_migrations:groupOrderItemsIntoRosterEntries`. Spec:
// backlog/R2-01-roster-entries-model.md (Logic: migration), design note
// "Migration of existing orderItems rows". Pre-migration rows are phase-1
// flat items with no `rosterEntryId`. Written before the build: fails because
// the table, the field and the migration don't exist yet.
// Internal only: it is called through `internal.*` and must not be on `api`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import realSchema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
// R2-03 narrowed `orderItems` to size lines, so the phase-1 flat rows this
// migration starts from are seeded through a local `v.any()` table (same
// indexes), as convex/_migrations.r203.test.ts does.
const schema = defineSchema({
  ...realSchema.tables,
  orderItems: defineTable(v.any())
    .index("by_order", ["orderId"])
    .index("by_entry", ["rosterEntryId"])
    .index("by_submitterEmail", ["submitterEmail"]),
});
type T = TestConvex<typeof schema>;

async function seedOrder(t: T) {
  const now = Date.now();
  return t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      clerkId: "cap",
      email: "cap@example.com",
      name: "Cap",
      isAdmin: false,
      createdAt: now,
    });
    const designIds: Id<"designs">[] = [];
    for (const title of ["Home", "Away"])
      designIds.push(
        await ctx.db.insert("designs", {
          ownerId,
          title,
          blocks: overviewBlocks(title),
          createdAt: now,
          updatedAt: now,
        }),
      );
    const orderId = await ctx.db.insert("orders", {
      captainId: ownerId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds,
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    return { orderId, designIds, ownerId };
  });
}
type Order = Awaited<ReturnType<typeof seedOrder>>;

type Row = {
  design?: 0 | 1;
  name?: string;
  number?: string;
  designation?: "C" | "A";
  size?: string;
  qty?: number;
  source?: "captain" | "fan";
  email?: string;
  createdAt: number;
  removedAt?: number;
};

async function seedRows(t: T, o: Order, rows: Row[]) {
  return t.run(async (ctx) => {
    const ids: Id<"orderItems">[] = [];
    for (const r of rows)
      ids.push(
        await ctx.db.insert("orderItems", {
          orderId: o.orderId,
          designId: o.designIds[r.design ?? 0],
          name: r.name,
          number: r.number,
          designation: r.designation,
          size: r.size,
          qty: r.qty ?? 1,
          source: r.source ?? "captain",
          submitterEmail: r.email,
          removedAt: r.removedAt,
          createdAt: r.createdAt,
          updatedAt: r.createdAt,
        }),
      );
    return ids;
  });
}

const run = (t: T) =>
  t.mutation(internal._migrations.groupOrderItemsIntoRosterEntries, {});
const entries = (t: T) => t.run((ctx) => ctx.db.query("rosterEntries").collect());
const items = (t: T) => t.run((ctx) => ctx.db.query("orderItems").collect());

describe("groupOrderItemsIntoRosterEntries: Sidestep #72 as S, M×3, XL plus a sizeless twin become 1 entry with 4 linked items", () => {
  it("groups by order + design + player key; Lee #4 and Lee #9 stay two entries", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    const ids = await seedRows(t, o, [
      { name: "Sidestep", number: "72", size: "S", createdAt: 100 },
      { name: "Sidestep", number: "72", size: "M", qty: 3, createdAt: 110 },
      { name: "Sidestep", number: "72", size: "XL", createdAt: 120 },
      { name: "sidestep ", number: " 72", createdAt: 130 }, // sizeless twin
      { name: "Lee", number: "4", size: "M", createdAt: 140 },
      { name: "Lee", number: "9", size: "M", createdAt: 150 },
    ]);
    const before = await items(t);
    const res = await run(t);

    const es = await entries(t);
    expect(es).toHaveLength(3);
    expect(res.entries).toBe(3);
    expect(res.itemsLinked).toBe(6);
    expect(res.sizelessRows).toBe(1);

    const sidestep = es.find((e) => e.name === "Sidestep")!; // oldest row's spelling
    expect(sidestep.number).toBe("72");
    expect(sidestep.designId).toBe(o.designIds[0]);
    expect(sidestep.orderId).toBe(o.orderId);
    expect(sidestep.removedAt).toBeUndefined();
    expect(sidestep.createdAt).toBe(100);

    const after = await items(t);
    const linked = after.filter((i) => i.rosterEntryId === sidestep._id);
    expect(linked.map((i) => i._id).sort()).toEqual(ids.slice(0, 4).sort());
    expect(es.filter((e) => e.name === "Lee")).toHaveLength(2);

    // every row keeps its own size, qty, source and timestamps
    for (const b of before) {
      const a = after.find((i) => i._id === b._id)!;
      expect(a).toMatchObject({
        qty: b.qty,
        source: b.source,
        createdAt: b.createdAt,
      });
      expect(a.size).toBe(b.size);
      expect(a.removedAt).toBe(b.removedAt);
      expect(a.rosterEntryId).toBeDefined();
    }
  });

  it("the same print on two designs makes two entries", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [
      { design: 0, name: "Sam", number: "9", size: "M", createdAt: 1 },
      { design: 1, name: "Sam", number: "9", size: "M", createdAt: 2 },
    ]);
    await run(t);
    expect(await entries(t)).toHaveLength(2);
  });

  it("carries the letter (first non-empty by createdAt) and counts conflicting letters", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [
      { name: "Sam", number: "9", size: "S", createdAt: 1 },
      { name: "Sam", number: "9", size: "M", designation: "C", createdAt: 2 },
      { name: "Sam", number: "9", size: "L", designation: "A", createdAt: 3 },
    ]);
    const res = await run(t);
    const [e] = await entries(t);
    expect(e.designation).toBe("C");
    expect(res.letterConflicts).toBe(1);
  });

  it("keeps each fan's own submitter on their line (nothing is rewritten)", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [
      { name: "Sam", number: "9", size: "M", source: "fan", email: "pat@example.com", createdAt: 1 },
      { name: "Sam", number: "9", size: "L", source: "fan", email: "sam@example.com", createdAt: 2 },
    ]);
    await run(t);
    expect(await entries(t)).toHaveLength(1);
    const after = await items(t);
    expect(after.map((i) => i.submitterEmail).sort()).toEqual([
      "pat@example.com",
      "sam@example.com",
    ]);
  });
});

describe("groupOrderItemsIntoRosterEntries: removed rows", () => {
  it("a group whose rows are all removed gives a removed entry; a group with one live row stays live", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [
      { name: "Gone", number: "1", size: "M", createdAt: 1, removedAt: 50 },
      { name: "Gone", number: "1", size: "L", createdAt: 2, removedAt: 60 },
      { name: "Mixed", number: "2", size: "M", createdAt: 3, removedAt: 70 },
      { name: "Mixed", number: "2", size: "L", createdAt: 4 },
    ]);
    await run(t);
    const es = await entries(t);
    expect(es.find((e) => e.name === "Gone")!.removedAt).toBe(60);
    expect(es.find((e) => e.name === "Mixed")!.removedAt).toBeUndefined();
    // the removed row keeps its own removal
    const mixedRemoved = (await items(t)).find((i) => i.size === "M" && i.createdAt === 3)!;
    expect(mixedRemoved.removedAt).toBe(70);
  });

  it("a blank group with no sized live row gets a removed entry; blank with a sized row stays live", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [
      { design: 0, createdAt: 1 }, // blank, sizeless
      { design: 1, size: "M", qty: 4, createdAt: 2 }, // blank jerseys, sized
    ]);
    await run(t);
    const es = await entries(t);
    expect(es).toHaveLength(2);
    const home = es.find((e) => e.designId === o.designIds[0])!;
    const away = es.find((e) => e.designId === o.designIds[1])!;
    expect(home.removedAt).toBeDefined();
    expect(away.removedAt).toBeUndefined();
  });
});

describe("groupOrderItemsIntoRosterEntries: a sizeless row with qty 3 is reported, not stored", () => {
  it("lists it in sizelessQtyOver1 and does not report qty-1 sizeless rows", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [
      { name: "Jordan Lee", number: "4", qty: 3, createdAt: 1 },
      { name: "Mo", number: "88", qty: 1, createdAt: 2 },
    ]);
    const res = await run(t);
    expect(res.sizelessRows).toBe(2);
    expect(res.sizelessQtyOver1).toHaveLength(1);
    expect(res.sizelessQtyOver1[0]).toMatchObject({ orderId: o.orderId, qty: 3 });
    expect(res.sizelessQtyOver1[0].label).toMatch(/jordan lee/i);
  });
});

describe("groupOrderItemsIntoRosterEntries: idempotent and internal only", () => {
  it("a second run returns zero new entries and changes nothing", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [
      { name: "Sam", number: "9", size: "M", createdAt: 1 },
      { name: "Sam", number: "9", createdAt: 2 },
      { name: "Lee", number: "4", size: "L", createdAt: 3 },
    ]);
    await run(t);
    const snapshot = { e: await entries(t), i: await items(t) };
    const second = await run(t);
    expect(second.entries).toBe(0);
    expect(second.itemsLinked).toBe(0);
    expect(await entries(t)).toEqual(snapshot.e);
    expect(await items(t)).toEqual(snapshot.i);
  });

  it("picks up rows written after the first run without duplicating players", async () => {
    const t = convexTest(schema, modules);
    const o = await seedOrder(t);
    await seedRows(t, o, [{ name: "Sam", number: "9", size: "M", createdAt: 1 }]);
    await run(t);
    await seedRows(t, o, [
      { name: "Sam", number: "9", size: "L", createdAt: 2 },
      { name: "New", number: "1", size: "S", createdAt: 3 },
    ]);
    const res = await run(t);
    expect(res.itemsLinked).toBe(2);
    expect(res.entries).toBe(1); // only "New"; the late Sam row joins the live Sam entry
    const es = await entries(t);
    expect(es).toHaveLength(2);
    expect((await items(t)).every((i) => i.rosterEntryId)).toBe(true);
  });

  it("is declared with internalMutation, never a public mutation (api is a Proxy, so read the source)", () => {
    const src = readFileSync(path.join(__dirname, "_migrations.ts"), "utf8");
    expect(src).toMatch(
      /export const groupOrderItemsIntoRosterEntries\s*=\s*internalMutation\(/,
    );
    expect(api).toBeDefined();
  });
});
