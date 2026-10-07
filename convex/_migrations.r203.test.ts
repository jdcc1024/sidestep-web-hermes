// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// R2-03 acceptance tests (initiative 0004, phase 1b): the strip migration
// `_migrations:stripFlatItemFields` and the narrowed `orderItems` schema.
// Spec: backlog/R2-03-retire-flat-item-fields.md (## Logic, item 1 and 3-4).
// Written before the build: fails because the migration doesn't exist and
// the schema still allows (and requires) the flat fields.
//
// Pre-migration rows are written through a local schema whose `orderItems` is
// `v.any()` (same indexes), so they can carry the flat fields whether or not
// the real schema has dropped them yet. The migration itself is internal only.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

const legacySchema = defineSchema({
  ...schema.tables,
  orderItems: defineTable(v.any())
    .index("by_order", ["orderId"])
    .index("by_entry", ["rosterEntryId"])
    .index("by_submitterEmail", ["submitterEmail"]),
});
// The migration's own types come from the real schema; the rows we seed don't.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type T = TestConvex<typeof legacySchema>;

const run = (t: T) =>
  (t as Any).mutation(internal._migrations.stripFlatItemFields, {}) as Promise<
    Record<string, unknown>
  >;

type World = {
  orderA: Id<"orders">;
  orderB: Id<"orders">;
  homeA: Id<"designs">;
  homeB: Id<"designs">;
  sidestepEntry: Id<"rosterEntries">;
};

async function seedWorld(t: T): Promise<World> {
  const now = Date.now();
  return t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      clerkId: "cap",
      email: "cap@example.com",
      name: "Cap",
      isAdmin: false,
      createdAt: now,
    });
    const mk = async (team: string) => {
      const designId = await ctx.db.insert("designs", {
        ownerId,
        title: "Home",
        blocks: overviewBlocks("Home"),
        createdAt: now,
        updatedAt: now,
      });
      const orderId = await ctx.db.insert("orders", {
        captainId: ownerId,
        teamName: team,
        sport: "Soccer",
        estimatedQuantity: 12,
        hasOwnDesign: false,
        designIds: [designId],
        internalStages: [{ name: "Inquiry", completedAt: now }],
        createdAt: now,
        updatedAt: now,
      });
      return { designId, orderId };
    };
    const a = await mk("Falcons");
    const b = await mk("Hawks");
    const sidestepEntry = await ctx.db.insert("rosterEntries", {
      orderId: a.orderId,
      designId: a.designId,
      name: "Sidestep",
      number: "72",
      designation: "C",
      source: "captain",
      createdAt: 100,
      updatedAt: 100,
    });
    return {
      orderA: a.orderId,
      orderB: b.orderId,
      homeA: a.designId,
      homeB: b.designId,
      sidestepEntry,
    };
  });
}

// A phase-1 / mirror-window item: still carries the flat fields.
async function seedFlat(
  t: T,
  w: World,
  rows: {
    order?: "A" | "B";
    entry?: Id<"rosterEntries">;
    name?: string;
    number?: string;
    size?: string;
    qty?: number;
    removedAt?: number;
    createdAt: number;
  }[],
) {
  return t.run(async (ctx) => {
    const ids: Id<"orderItems">[] = [];
    for (const r of rows) {
      const isB = r.order === "B";
      ids.push(
        await (ctx.db as Any).insert("orderItems", {
          orderId: isB ? w.orderB : w.orderA,
          designId: isB ? w.homeB : w.homeA,
          rosterEntryId: r.entry,
          name: r.name,
          number: r.number,
          designation: r.name === "Sidestep" ? "C" : undefined,
          size: r.size,
          qty: r.qty ?? 1,
          source: "captain",
          submitterEmail: "fan@example.com",
          removedAt: r.removedAt,
          createdAt: r.createdAt,
          updatedAt: r.createdAt,
        }),
      );
    }
    return ids;
  });
}

const allItems = (t: T) =>
  t.run((ctx) => (ctx.db as Any).query("orderItems").collect()) as Promise<
    Record<string, unknown>[]
  >;
const allEntries = (t: T) =>
  t.run((ctx) => ctx.db.query("rosterEntries").collect());

const FLAT = ["designId", "name", "number", "designation"];
const sizedQty = (items: Record<string, unknown>[], orderId: Id<"orders">) =>
  items
    .filter(
      (i) =>
        i.orderId === orderId &&
        i.size !== undefined &&
        i.removedAt === undefined,
    )
    .reduce((n, i) => n + (i.qty as number), 0);

// Every number in a result is 0 and every array is empty.
function isAllZero(x: unknown): boolean {
  if (typeof x === "number") return x === 0;
  if (Array.isArray(x)) return x.length === 0;
  if (x && typeof x === "object") return Object.values(x).every(isAllZero);
  return true;
}

describe("stripFlatItemFields: Sidestep #72 as S, M×3, XL survives the strip with its sizes", () => {
  it("leaves no flat fields, every item sized and linked, and the live jersey count per order unchanged", async () => {
    const t = convexTest(legacySchema, modules);
    const w = await seedWorld(t);
    await seedFlat(t, w, [
      { entry: w.sidestepEntry, name: "Sidestep", number: "72", size: "S", createdAt: 100 },
      { entry: w.sidestepEntry, name: "Sidestep", number: "72", size: "M", qty: 3, createdAt: 110 },
      { entry: w.sidestepEntry, name: "Sidestep", number: "72", size: "XL", createdAt: 120 },
      // another order, to prove the count is per order
      { order: "B", name: "Lee", number: "4", size: "L", qty: 2, createdAt: 130 },
    ]);
    const before = await allItems(t);
    const beforeA = sizedQty(before, w.orderA);
    const beforeB = sizedQty(before, w.orderB);
    expect(beforeA).toBe(5);

    const res = await run(t);
    expect(isAllZero(res), "first run reports what it changed").toBe(false);

    const after = await allItems(t);
    expect(after).toHaveLength(4);
    for (const item of after) {
      for (const f of FLAT) expect(item, `item still has ${f}`).not.toHaveProperty(f);
      expect(item.size).toBeDefined();
      expect(item.rosterEntryId).toBeDefined();
    }
    expect(sizedQty(after, w.orderA)).toBe(beforeA);
    expect(sizedQty(after, w.orderB)).toBe(beforeB);

    // The printed values now live only on the entry, unchanged.
    const sidestep = (await allEntries(t)).find((e) => e._id === w.sidestepEntry)!;
    expect(sidestep).toMatchObject({ name: "Sidestep", number: "72", designation: "C" });
    const bySize = Object.fromEntries(
      after
        .filter((i) => i.rosterEntryId === w.sidestepEntry)
        .map((i) => [i.size, i.qty]),
    );
    expect(bySize).toEqual({ S: 1, M: 3, XL: 1 });
  });

  it("a second run changes nothing and returns zeros", async () => {
    const t = convexTest(legacySchema, modules);
    const w = await seedWorld(t);
    await seedFlat(t, w, [
      { entry: w.sidestepEntry, name: "Sidestep", number: "72", size: "M", qty: 3, createdAt: 110 },
      { name: "Jordan", number: "9", createdAt: 140 }, // sizeless, unlinked
    ]);
    await run(t);
    const once = await allItems(t);
    const entriesOnce = await allEntries(t);

    const second = await run(t);
    expect(isAllZero(second)).toBe(true);
    expect(await allItems(t)).toEqual(once);
    expect(await allEntries(t)).toEqual(entriesOnce);
  });

  it("re-runs the grouping first: an unlinked sized flat item joins its player instead of being lost", async () => {
    const t = convexTest(legacySchema, modules);
    const w = await seedWorld(t);
    await seedFlat(t, w, [
      { entry: w.sidestepEntry, name: "Sidestep", number: "72", size: "M", createdAt: 110 },
      // written after the first grouping run, so it has no rosterEntryId yet
      { name: " sidestep", number: "72", size: "L", qty: 2, createdAt: 200 },
    ]);
    await run(t);

    const after = await allItems(t);
    expect(after).toHaveLength(2);
    for (const i of after) expect(i.rosterEntryId).toBe(w.sidestepEntry);
    expect(sizedQty(after, w.orderA)).toBe(3);
    expect((await allEntries(t)).filter((e) => e.removedAt === undefined)).toHaveLength(1);
  });

  it("key unhappy path: deletes sizeless items (even qty > 1), but never hard-deletes a sized one, removed or not", async () => {
    const t = convexTest(legacySchema, modules);
    const w = await seedWorld(t);
    const ids = await seedFlat(t, w, [
      { entry: w.sidestepEntry, name: "Sidestep", number: "72", size: "M", createdAt: 110 },
      { entry: w.sidestepEntry, name: "Sidestep", number: "72", size: "S", removedAt: 500, createdAt: 120 },
      { name: "Jordan", number: "9", qty: 4, createdAt: 130 }, // needs size, qty 4
      { name: "Riley", number: "7", createdAt: 140 }, // needs size
    ]);
    await run(t);

    const after = await allItems(t);
    const left = new Set(after.map((i) => i._id));
    expect(left.has(ids[0])).toBe(true);
    expect(left.has(ids[1]), "a removed but sized item stays").toBe(true);
    expect(left.has(ids[2])).toBe(false);
    expect(left.has(ids[3])).toBe(false);
    expect(after).toHaveLength(2);
    expect(after.find((i) => i._id === ids[1])!.removedAt).toBe(500);
    // The players who needed sizes are still on the list, with no items.
    const names = (await allEntries(t)).map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["Jordan", "Riley"]));
  });
});

describe("stripFlatItemFields is internal only", () => {
  it("is declared with internalMutation, not mutation", () => {
    // `api.x.y` is a Proxy and never undefined, so read the source.
    const src = readFileSync(path.join(__dirname, "_migrations.ts"), "utf8");
    expect(src).toMatch(/export const stripFlatItemFields = internalMutation\(/);
    expect(src).not.toMatch(/export const stripFlatItemFields = mutation\(/);
  });
});

describe("orderItems schema, narrowed (R2-03 item 4)", () => {
  async function realWorld() {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t as unknown as T);
    return { t, w };
  }
  const line = (w: World, extra: Record<string, unknown> = {}) => ({
    orderId: w.orderA,
    rosterEntryId: w.sidestepEntry,
    size: "M",
    qty: 1,
    source: "captain" as const,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  });

  it("accepts a size line with only an entry, a size and a qty (no design, name, number or letter)", async () => {
    const { t, w } = await realWorld();
    await expect(
      t.run((ctx) => ctx.db.insert("orderItems", line(w) as Any)),
    ).resolves.toBeDefined();
  });

  // The refusals are read from the table definition: a runtime insert of an
  // item with no size would also be refused today (for the missing designId),
  // so it couldn't tell the narrowed schema from the old one.
  it("declares size and rosterEntryId as required and drops designId, name, number and designation", () => {
    const src = readFileSync(path.join(__dirname, "schema.ts"), "utf8");
    const start = src.indexOf("orderItems: defineTable(");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf(".index(", start));
    for (const f of ["designId", "name", "number", "designation"])
      expect(block, `orderItems still declares ${f}`).not.toMatch(
        new RegExp(`^\\s*${f}:`, "m"),
      );
    expect(block).toMatch(/^\s*size:\s*v\.string\(\)/m);
    expect(block).toMatch(/^\s*rosterEntryId:\s*v\.id\("rosterEntries"\)/m);
  });
});
