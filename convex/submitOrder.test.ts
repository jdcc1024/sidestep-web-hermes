// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// The public order form's write path (R-02), moved onto order items by L-02
// (initiative 0004). Spec: backlog/L-02-switch-readers-and-order-form-to-items.md,
// docs/architecture/0004-order-items.md "Must answer 3", UX §7.6 / §7.10.
//
// The first describe is the R-02 regression suite, kept scenario for scenario.
// The describes after it are the L-02 acceptance criteria, one per criterion
// and named after it. Since R2-02 the form writes players
// (docs/architecture/0004-roster-sizes.md, "Write: the public form"): each
// line resolves a roster entry and inserts a `fan` item under it. The fill
// path and the collision flag are gone, so their tests became the
// "joins the existing player" rules; the line's id is `rosterEntryId` again.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;

// TestConvex<typeof schema>, not ReturnType<typeof convexTest>: the bare
// ReturnType widens the data model away, so custom indexes don't typecheck.
type T = TestConvex<typeof schema>;

// Seeds a captain, two designs they own (Home + Away), an order linking
// both, and a run on the order — the chain the multi-design public form
// (R-02) submits against. `namesMode`/`customQuestions` are overridable so
// the same helper covers open, fixed, and custom-question runs.
async function seedRun(
  t: T,
  opts: {
    namesMode?: "open" | "fixed";
    customQuestions?: { id: string; label: string }[];
    status?: "open" | "closed";
    deadlineOffset?: number;
    // JCC has checked "Order Size Confirmed": the list is locked (L-06).
    confirmed?: boolean;
  } = {},
) {
  const now = Date.now();
  const { userId, homeId, awayId, orderId, orderFormId } = await t.run(
    async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "captain_clerk",
        email: "captain@example.com",
        name: "Cap",
        isAdmin: false,
        createdAt: now,
      });
      const homeId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("home kit"),
        createdAt: now,
        updatedAt: now,
      });
      const awayId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Away",
        blocks: overviewBlocks("away kit"),
        createdAt: now,
        updatedAt: now,
      });
      const orderId = await ctx.db.insert("orders", {
        captainId: userId,
        teamName: "Wildcats",
        sport: "Hockey",
        estimatedQuantity: 12,
        hasOwnDesign: false,
        designIds: [homeId, awayId],
        internalStages: [
          { name: "Inquiry", completedAt: now },
          ...(opts.confirmed
            ? [{ name: "Order Size Confirmed", completedAt: now }]
            : []),
        ],
        createdAt: now,
        updatedAt: now,
      });
      const orderFormId = await ctx.db.insert("orderForms", {
        orderId,
        captainId: userId,
        sizeOptions: ["S", "M", "L", "XL"],
        namesMode: opts.namesMode ?? "open",
        customQuestions: opts.customQuestions ?? [],
        deadline: now + (opts.deadlineOffset ?? 7 * ONE_DAY),
        status: opts.status ?? "open",
        createdAt: now,
      });
      return { userId, homeId, awayId, orderId, orderFormId };
    },
  );
  return {
    userId,
    homeId,
    awayId,
    orderId,
    orderFormId,
    asCaptain: t.withIdentity({
      subject: "captain_clerk",
      email: "captain@example.com",
      name: "Cap",
    }),
  };
}

const fan = {
  submitterName: "Pat Fan",
  submitterEmail: "pat@example.com",
};

// Every item on the order, removed ones included, in the order they were
// written. Tests that care about "live" filter `removedAt` themselves.
async function allItems(t: T, orderId: Id<"orders">) {
  const rows = await t.run((ctx) =>
    ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );
  return rows.sort(
    (a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime,
  );
}

async function liveItems(t: T, orderId: Id<"orders">) {
  return (await allItems(t, orderId)).filter((i) => i.removedAt === undefined);
}

async function liveEntries(t: T, orderId: Id<"orders">) {
  const rows = await t.run((ctx) =>
    ctx.db
      .query("rosterEntries")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );
  return rows.filter((e) => e.removedAt === undefined);
}

// A player written straight into the table, for the states no public API can
// reach in one step (a removed player, an unnamed one, one on another order).
// No items: a named player with none "needs sizes".
async function insertEntry(
  t: T,
  orderId: Id<"orders">,
  designId: Id<"designs">,
  fields: Partial<Omit<Doc<"rosterEntries">, "_id" | "_creationTime">> = {},
) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("rosterEntries", {
      orderId,
      designId,
      source: "captain",
      createdAt: now,
      updatedAt: now,
      ...fields,
    }),
  );
}

// A rejection a customer could read: a ConvexError carrying a string. Tells
// "refused by the rule" apart from "crashed" or "function missing".
async function expectUserError(fn: () => Promise<unknown>): Promise<string> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected a ConvexError rejection").toBeInstanceOf(ConvexError);
  const data: unknown = (caught as ConvexError<string>).data;
  expect(typeof data).toBe("string");
  return data as string;
}

// ─── R-02 regression suite (id rename only, §7.10) ─────────────────────────

describe("orderEntries.submitOrder", () => {
  it("creates one order entry per line across designs, grouped by submitter", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, awayId } = await seedRun(t);

    const result = await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [
        { designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 },
        { designId: awayId, name: "Luongo", number: "1", size: "M", qty: 1 },
        { designId: awayId, name: "Sosa", number: "25", size: "XL", qty: 1 },
      ],
    });

    expect(result.created).toBe(3);

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(3);
    // All three group back to the one submitter by email.
    expect(new Set(items.map((i) => i.submitterEmail))).toEqual(
      new Set(["pat@example.com"]),
    );
    expect(items.every((i) => i.source === "fan")).toBe(true);
    // Each line is its own named, sized item stamped with the run.
    expect(
      items.map((i) => [i.designId, i.name, i.number, i.size, i.qty]),
    ).toEqual([
      [homeId, "Gretzky", "99", "L", 1],
      [awayId, "Luongo", "1", "M", 1],
      [awayId, "Sosa", "25", "XL", 1],
    ]);
    expect(items.every((i) => i.orderFormId === orderFormId)).toBe(true);
  });

  it("groups a returning same-email submission with the first", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 }],
    });
    // Second session, same email typed with different casing.
    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: "Pat Fan",
      submitterEmail: "PAT@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, name: "Howe", number: "9", size: "M", qty: 1 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(2);
    // Normalized to one lowercase email — both join the same group.
    expect(new Set(items.map((i) => i.submitterEmail))).toEqual(
      new Set(["pat@example.com"]),
    );
  });

  it("attaches to an existing captain-seeded slot instead of duplicating it", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t);
    const { entryId: seededId } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Gretzky",
      number: "99",
      sizes: [],
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      // Different casing/whitespace — still the same player.
      lines: [{ designId: homeId, name: "  gretzky ", number: "99", size: "L", qty: 1 }],
    });

    const entries = await liveEntries(t, orderId);
    expect(entries.map((e) => e._id)).toEqual([seededId]); // no duplicate player
    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0].rosterEntryId).toBe(seededId);
    expect(items[0].size).toBe("L");
  });

  // R-02 reused one slot for both lines. Under items (JCC Q7) the same name +
  // number twice is one player wearing two jerseys: two items, never merged.
  it("reuses one new slot for two lines with the same name+number", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [
        { designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 },
        { designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 },
      ],
    });

    const items = await liveItems(t, orderId);
    expect(items.map((i) => [i.name, i.number, i.size])).toEqual([
      ["Gretzky", "99", "L"],
      ["Gretzky", "99", "M"],
    ]);
  });

  // Gate 1b Q5: no collision flag. The captain's list shows one player whose
  // lines keep each sender.
  it("joins a different fan's same name + number to one player, each line keeping its sender", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "open",
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: "Pat",
      submitterEmail: "pat@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 }],
    });
    const second = await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: "Sam",
      submitterEmail: "sam@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 }],
    });
    expect(second.created).toBe(1);

    const view = await asCaptain.query(api.orderItems.listForOrder, { orderId });
    const gretzkys = view!.designs
      .flatMap((d) => d.players)
      .filter((p) => p.name === "Gretzky");
    expect(gretzkys).toHaveLength(1);
    expect(
      gretzkys[0].lines.map((l) => [l.size, l.submitterEmail]),
    ).toEqual([
      ["L", "pat@example.com"],
      ["M", "sam@example.com"],
    ]);
  });

  it("creates a blank/bulk line with no roster entry", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, size: "M", qty: 5 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBeUndefined();
    expect(items[0].number).toBeUndefined();
    expect(items[0]).toMatchObject({ size: "M", qty: 5, source: "fan" });
  });

  it("stores custom answers for known questions and drops unknown ones", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t, {
      customQuestions: [{ id: "q1", label: "Allergies?" }],
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: { q1: "None", bogus: "ignored" },
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 }],
    });

    const [item] = await liveItems(t, orderId);
    expect(item?.customAnswers).toEqual({ q1: "None" });
  });

  it("rejects a submission to a closed run", async () => {
    const t = convexTest(schema, modules);
    const { orderFormId, homeId } = await seedRun(t, { status: "closed" });
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        ...fan,
        customAnswers: {},
        lines: [{ designId: homeId, name: "X", size: "M", qty: 1 }],
      }),
    ).rejects.toThrow(/closed/i);
  });

  it("rejects a submission once the deadline has passed", async () => {
    const t = convexTest(schema, modules);
    const { orderFormId, homeId } = await seedRun(t, { deadlineOffset: -ONE_DAY });
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        ...fan,
        customAnswers: {},
        lines: [{ designId: homeId, name: "X", size: "M", qty: 1 }],
      }),
    ).rejects.toThrow();
  });

  it("rejects a line on a design that isn't part of the order", async () => {
    const t = convexTest(schema, modules);
    const { orderFormId, userId } = await seedRun(t);
    const strayDesign = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Stray",
        blocks: overviewBlocks("x"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        ...fan,
        customAnswers: {},
        lines: [{ designId: strayDesign, name: "X", size: "M", qty: 1 }],
      }),
    ).rejects.toThrow(/isn't part of this order/i);
  });

  it("rejects an empty submission", async () => {
    const t = convexTest(schema, modules);
    const { orderFormId } = await seedRun(t);
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        ...fan,
        customAnswers: {},
        lines: [],
      }),
    ).rejects.toThrow(/at least one/i);
  });
});

// ─── L-02 acceptance criteria ──────────────────────────────────────────────

describe("Open mode: a player line matching an existing player adds a fan item under it; a non-matching line creates a new player (§7.6, R2-02)", () => {
  it("adds an item under the existing player (same entry, no second entry), with size, qty, submitter, answers and orderFormId", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      customQuestions: [{ id: "q1", label: "Pickup?" }],
    });
    const { entryId: seededId } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      sizes: [],
    });

    const result = await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: "Jordan's Mum",
      submitterEmail: "Mum@Example.com ",
      customAnswers: { q1: "Gym" },
      // Case and spacing differ from the captain's row: still the same player.
      lines: [{ designId: homeId, name: " jordan LEE ", number: " 4", size: "M", qty: 2 }],
    });
    expect(result.created).toBe(1);
    expect(result.items).toEqual([{ rosterEntryId: seededId, designId: homeId }]);

    const entries = await liveEntries(t, orderId);
    expect(entries.map((e) => e._id)).toEqual([seededId]);
    // The captain's spelling and letter stand: the form never sets either.
    expect(entries[0]).toMatchObject({
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      source: "captain",
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      rosterEntryId: seededId,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "M",
      qty: 2,
      source: "fan",
      submitterName: "Jordan's Mum",
      submitterEmail: "mum@example.com",
      customAnswers: { q1: "Gym" },
      orderFormId,
    });
  });

  it("creates a new player when no player matches the design + name + number", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, awayId, asCaptain } = await seedRun(t);
    const { entryId: seededId } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      sizes: [],
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [
        // Same player, other design: the Home row is not on this design.
        { designId: awayId, name: "Jordan Lee", number: "4", size: "S", qty: 1 },
        // Same design, different player.
        { designId: homeId, name: "Sam Ruiz", number: "12", size: "L", qty: 1 },
      ],
    });

    // The seeded player still has no sizes; each line made its own player.
    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.rosterEntryId === seededId)).toBe(false);
    expect(items.every((i) => i.source === "fan")).toBe(true);
    expect(items.map((i) => [i.designId, i.name, i.size])).toEqual([
      [awayId, "Jordan Lee", "S"],
      [homeId, "Sam Ruiz", "L"],
    ]);
    const entries = await liveEntries(t, orderId);
    expect(entries).toHaveLength(3);
    expect(new Set(items.map((i) => i.rosterEntryId)).size).toBe(2);
    expect(
      entries.filter((e) => e._id !== seededId).every((e) => e.source === "fan"),
    ).toBe(true);
  });

  it("never joins a removed player, and never changes a line the player already has", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t);
    const removed = await insertEntry(t, orderId, homeId, {
      name: "Gretzky",
      number: "99",
      removedAt: Date.now(),
    });
    const { entryId: live } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Gretzky",
      number: "99",
      sizes: [{ size: "XL", qty: 1 }],
    });
    const [captainLine] = await liveItems(t, orderId);

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 }],
    });

    const removedEntry = await t.run((ctx) => ctx.db.get(removed));
    expect(removedEntry?.removedAt).toBeDefined();
    const all = await allItems(t, orderId);
    expect(all.some((i) => i.rosterEntryId === removed)).toBe(false);
    expect(all.find((i) => i._id === captainLine._id)).toEqual(captainLine);
    const fresh = all.filter((i) => i._id !== captainLine._id);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({
      rosterEntryId: live,
      size: "M",
      source: "fan",
    });
  });

  it("keeps the typed number on a line with a blank name", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "   ", number: "12", size: "L", qty: 1 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBeUndefined();
    expect(items[0].number).toBe("12");
  });
});

describe("Fixed mode: picking a player adds a fan item under that player, whether or not it already has sizes; nothing is merged or overwritten (§7.6, R2-02)", () => {
  it("adds an item under the picked player who needs sizes", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "fixed",
    });
    const { entryId } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      designation: "A",
      sizes: [],
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, rosterEntryId: entryId, size: "L", qty: 1 }],
    });

    expect((await liveEntries(t, orderId)).map((e) => e._id)).toEqual([entryId]);
    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      rosterEntryId: entryId,
      name: "Jordan Lee",
      number: "4",
      designation: "A",
      size: "L",
      source: "fan",
      submitterEmail: "pat@example.com",
      orderFormId,
    });
  });

  it("adds an item with the same name, number and letter when the picked player already has a size", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "fixed",
    });
    // The race in the design note: the captain sized the player before the
    // fan pressed Submit.
    const { entryId } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      sizes: [{ size: "M", qty: 1 }],
    });
    const [captainLine] = await liveItems(t, orderId);

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, rosterEntryId: entryId, size: "L", qty: 1 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(2);
    // The captain's line is never overwritten by the public form.
    expect(items.find((i) => i._id === captainLine._id)).toEqual(captainLine);
    const added = items.find((i) => i._id !== captainLine._id)!;
    expect(added).toMatchObject({
      rosterEntryId: entryId,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "L",
      source: "fan",
      submitterEmail: "pat@example.com",
    });
  });

  it("picking one player in two sizes in one submission adds two items under that player", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "fixed",
    });
    const { entryId } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      sizes: [],
    });

    const result = await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [
        { designId: homeId, rosterEntryId: entryId, size: "M", qty: 2 },
        { designId: homeId, rosterEntryId: entryId, size: "L", qty: 1 },
      ],
    });
    expect(result.created).toBe(2);

    expect(await liveEntries(t, orderId)).toHaveLength(1);
    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(2);
    expect(items.map((i) => [i.name, i.number, i.size, i.qty])).toEqual([
      ["Jordan Lee", "4", "M", 2],
      ["Jordan Lee", "4", "L", 1],
    ]);
    expect(items.every((i) => i.rosterEntryId === entryId)).toBe(true);
  });

  it("rejects a picked player that is removed, unnamed, on another design or on another order", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, awayId, userId } = await seedRun(t, {
      namesMode: "fixed",
    });
    const removed = await insertEntry(t, orderId, homeId, {
      name: "Gone",
      number: "1",
      removedAt: Date.now(),
    });
    const unnamed = await insertEntry(t, orderId, homeId, { number: "2" });
    const onAway = await insertEntry(t, orderId, awayId, { name: "Away", number: "3" });
    const otherOrderId = await t.run((ctx) =>
      ctx.db.insert("orders", {
        captainId: userId,
        teamName: "Other",
        sport: "Hockey",
        estimatedQuantity: 1,
        hasOwnDesign: false,
        designIds: [homeId],
        internalStages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const foreign = await insertEntry(t, otherOrderId, homeId, {
      name: "Foreign",
      number: "4",
    });

    for (const rosterEntryId of [removed, unnamed, onAway, foreign]) {
      await expectUserError(() =>
        t.mutation(api.orderEntries.submitOrder, {
          orderFormId: orderFormId,
          ...fan,
          customAnswers: {},
          lines: [{ designId: homeId, rosterEntryId, size: "M", qty: 1 }],
        }),
      );
    }
    // Nothing was written by any of the refused submissions, on either order.
    expect(await allItems(t, orderId)).toEqual([]);
    expect(await allItems(t, otherOrderId)).toEqual([]);
  });
});

describe("Open mode, same print from two emails: two different emails on the same design + name + number give one entry with two items, each keeping its own submitterEmail; the line is never refused (Gate 1b Q5)", () => {
  async function submit(
    t: T,
    orderFormId: Id<"orderForms">,
    email: string,
    line: { designId: Id<"designs">; name?: string; number?: string },
    size = "M",
  ) {
    return t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: email.split("@")[0],
      submitterEmail: email,
      customAnswers: {},
      lines: [{ ...line, size, qty: 1 }],
    });
  }

  it("two different emails, same name + number on one design: one entry, two items, each keeps its own submitterEmail", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t, {
      namesMode: "open",
    });
    const line = { designId: homeId, name: "Gretzky", number: "99" };
    const first = await submit(t, orderFormId, "pat@example.com", line);
    // Never a block: the second sender's line is written too.
    const second = await submit(t, orderFormId, "sam@example.com", line, "L");
    expect(second.created).toBe(1);
    expect(second).not.toHaveProperty("collisions");

    const entries = await liveEntries(t, orderId);
    expect(entries).toHaveLength(1);
    expect(first.items[0].rosterEntryId).toBe(entries[0]._id);
    expect(second.items[0].rosterEntryId).toBe(entries[0]._id);

    const items = await liveItems(t, orderId);
    expect(
      items.map((i) => [i.rosterEntryId, i.size, i.submitterEmail]),
    ).toEqual([
      [entries[0]._id, "M", "pat@example.com"],
      [entries[0]._id, "L", "sam@example.com"],
    ]);
  });
});

describe("Same name, different number (Lee #4, Lee #9): two separate players; neither line joins the other player, in either mode", () => {
  for (const namesMode of ["open", "fixed"] as const) {
    it(`keeps Lee #4 and Lee #9 apart in ${namesMode} mode`, async () => {
      const t = convexTest(schema, modules);
      const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
        namesMode,
      });
      const { entryId: lee4 } = await asCaptain.mutation(api.rosterEntries.add, {
        orderId,
        designId: homeId,
        name: "Lee",
        number: "4",
        sizes: [],
      });
      const { entryId: lee9 } = await asCaptain.mutation(api.rosterEntries.add, {
        orderId,
        designId: homeId,
        name: "Lee",
        number: "9",
        sizes: [],
      });

      // Two different people, one for each Lee.
      const lineFor = (id: Id<"rosterEntries">, number: string) =>
        namesMode === "fixed"
          ? { designId: homeId, rosterEntryId: id, size: "M", qty: 1 }
          : { designId: homeId, name: "Lee", number, size: "M", qty: 1 };
      const first = await t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        submitterName: "Pat",
        submitterEmail: "pat@example.com",
        customAnswers: {},
        lines: [lineFor(lee9, "9")],
      });
      const second = await t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        submitterName: "Sam",
        submitterEmail: "sam@example.com",
        customAnswers: {},
        lines: [lineFor(lee4, "4")],
      });
      expect(first.items[0].rosterEntryId).toBe(lee9);
      expect(second.items[0].rosterEntryId).toBe(lee4);

      // Each line went under its own player; no third player, no cross-join.
      expect(await liveEntries(t, orderId)).toHaveLength(2);
      const items = await liveItems(t, orderId);
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.rosterEntryId === lee9)).toMatchObject({
        number: "9",
        submitterEmail: "pat@example.com",
      });
      expect(items.find((i) => i.rosterEntryId === lee4)).toMatchObject({
        number: "4",
        submitterEmail: "sam@example.com",
      });

      const view = await asCaptain.query(api.orderItems.listForOrder, {
        orderId,
      });
      expect(
        view!.designs[0].players.map((p) => [p.number, p.jerseyCount]),
      ).toEqual([
        ["4", 1],
        ["9", 1],
      ]);
    });
  }

  it("an open-mode Lee #9 line does not join a Lee #4 who needs sizes", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t);
    const { entryId: lee4 } = await asCaptain.mutation(api.rosterEntries.add, {
      orderId,
      designId: homeId,
      name: "Lee",
      number: "4",
      sizes: [],
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "Lee", number: "9", size: "M", qty: 1 }],
    });

    expect(await liveEntries(t, orderId)).toHaveLength(2);
    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0].rosterEntryId).not.toBe(lee4);
    expect(items[0]).toMatchObject({
      name: "Lee",
      number: "9",
      size: "M",
    });
  });
});

describe("Same name + number submitted twice (same or different email, either mode) produces two items on one player; nothing is merged or rejected", () => {
  const cases = [
    { namesMode: "open", second: "pat@example.com" },
    { namesMode: "open", second: "sam@example.com" },
    { namesMode: "fixed", second: "pat@example.com" },
    { namesMode: "fixed", second: "sam@example.com" },
  ] as const;

  for (const { namesMode, second } of cases) {
    it(`${namesMode} mode, second submission from ${second}`, async () => {
      const t = convexTest(schema, modules);
      const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
        namesMode,
      });
      // Fixed mode needs a player to pick; open mode starts from nothing.
      const rosterEntryId =
        namesMode === "fixed"
          ? (
              await asCaptain.mutation(api.rosterEntries.add, {
                orderId,
                designId: homeId,
                name: "Gretzky",
                number: "99",
                sizes: [],
              })
            ).entryId
          : undefined;
      const line = rosterEntryId
        ? { designId: homeId, rosterEntryId, size: "M", qty: 1 }
        : { designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 };

      for (const email of ["pat@example.com", second]) {
        const result = await t.mutation(api.orderEntries.submitOrder, {
          orderFormId: orderFormId,
          submitterName: email,
          submitterEmail: email,
          customAnswers: {},
          lines: [line],
        });
        expect(result.created).toBe(1);
      }

      const items = await liveItems(t, orderId);
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.name === "Gretzky" && i.number === "99")).toBe(
        true,
      );
      expect(items.every((i) => i.size === "M" && i.qty === 1)).toBe(true);
      expect(await liveEntries(t, orderId)).toHaveLength(1);
      expect(new Set(items.map((i) => i.rosterEntryId)).size).toBe(1);
    });
  }
});

describe("submitOrder is rejected when isListLocked, and when the form is closed", () => {
  const line = (homeId: Id<"designs">) => ({
    designId: homeId,
    name: "Gretzky",
    number: "99",
    size: "M",
    qty: 1,
  });

  it("rejects a confirmed (locked) list with customer copy and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t, { confirmed: true });
    const seeded = await insertEntry(t, orderId, homeId, {
      name: "Gretzky",
      number: "99",
    });

    const message = await expectUserError(() =>
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        ...fan,
        customAnswers: {},
        lines: [line(homeId)],
      }),
    );
    expect(message).toMatch(/locked/i);
    expect(message).not.toMatch(/convex|request id|\.ts\b/i);

    // The player is untouched and still has no sizes.
    expect((await liveEntries(t, orderId)).map((e) => e._id)).toEqual([seeded]);
    expect(await allItems(t, orderId)).toEqual([]);
  });

  it("rejects a form that closed lazily past its deadline", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t, {
      deadlineOffset: -ONE_DAY,
    });
    await expectUserError(() =>
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        ...fan,
        customAnswers: {},
        lines: [line(homeId)],
      }),
    );
    expect(await allItems(t, orderId)).toEqual([]);
  });

  it("rejects a closed form with customer copy and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t, { status: "closed" });
    const message = await expectUserError(() =>
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        ...fan,
        customAnswers: {},
        lines: [line(homeId)],
      }),
    );
    expect(message).toMatch(/closed/i);
    expect(await allItems(t, orderId)).toEqual([]);
  });
});
