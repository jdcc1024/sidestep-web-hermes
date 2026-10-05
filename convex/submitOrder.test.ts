// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// The public order form's write path (R-02), moved onto order items by L-02
// (initiative 0004). Spec: backlog/L-02-switch-readers-and-order-form-to-items.md,
// docs/architecture/0004-order-items.md "Must answer 3", UX §7.6 / §7.10.
//
// The first describe is the R-02 regression suite, kept scenario for scenario.
// The player-facing args change only by the id rename (`rosterEntryId` →
// `itemId`, rule 10); the assertions read `orderItems`, because after L-02
// that is the only table the form writes. The describes after it are the
// L-02 acceptance criteria, one per criterion and named after it.
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

// An item written straight into the table, for the states no public API can
// reach in one step (a removed row, an unnamed captain row, a sized row with
// no submitter). Defaults to a captain's Needs-size player.
async function insertItem(
  t: T,
  orderId: Id<"orders">,
  designId: Id<"designs">,
  fields: Partial<Omit<Doc<"orderItems">, "_id" | "_creationTime">> = {},
) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("orderItems", {
      orderId,
      designId,
      qty: 1,
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
    const seededId = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Gretzky",
      number: "99",
      qty: 1,
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      // Different casing/whitespace — still the same player.
      lines: [{ designId: homeId, name: "  gretzky ", number: "99", size: "L", qty: 1 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1); // no duplicate row
    expect(items[0]._id).toBe(seededId);
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

  it("flags an open-mode collision when a different fan matches an existing slot", async () => {
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

    expect(second.collisions).toBe(1);

    // And the captain's list surfaces the collision on those rows.
    const view = await asCaptain.query(api.orderItems.listForOrder, { orderId });
    const gretzkys = view!.designs
      .flatMap((d) => d.items)
      .filter((i) => i.name === "Gretzky");
    expect(gretzkys).toHaveLength(2);
    expect(gretzkys.every((i) => i.collision)).toBe(true);
  });

  it("does not flag a collision in fixed mode", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "fixed",
    });
    const itemId = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Gretzky",
      number: "99",
      qty: 1,
    });

    // Two different fans pick the same seeded player — expected in fixed mode.
    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: "Pat",
      submitterEmail: "pat@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, itemId, size: "L", qty: 1 }],
    });
    const second = await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: "Sam",
      submitterEmail: "sam@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, itemId, size: "M", qty: 1 }],
    });
    expect(second.collisions).toBe(0);
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

describe("Open mode: a player line matching a captain's Needs-size item fills that item; a non-matching line inserts a fan item (§7.6)", () => {
  it("fills the matching Needs-size item in place: size, qty, submitter, answers and orderFormId set, same _id, source left alone", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      customQuestions: [{ id: "q1", label: "Pickup?" }],
    });
    const seededId = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      qty: 1,
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

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    const filled = items[0];
    expect(filled._id).toBe(seededId);
    expect(filled).toMatchObject({
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "M",
      qty: 2,
      source: "captain",
      submitterName: "Jordan's Mum",
      submitterEmail: "mum@example.com",
      customAnswers: { q1: "Gym" },
      orderFormId,
    });
  });

  it("inserts a new fan item when no Needs-size item matches the design + name + number", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, awayId, asCaptain } = await seedRun(t);
    const seededId = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      qty: 1,
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

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(3);
    const seeded = items.find((i) => i._id === seededId)!;
    expect(seeded.size).toBeUndefined();
    expect(seeded.submitterEmail).toBeUndefined();
    const inserted = items.filter((i) => i._id !== seededId);
    expect(inserted.every((i) => i.source === "fan")).toBe(true);
    expect(inserted.map((i) => [i.designId, i.name, i.size])).toEqual([
      [awayId, "Jordan Lee", "S"],
      [homeId, "Sam Ruiz", "L"],
    ]);
  });

  it("fills the oldest matching Needs-size item first, and two lines never fill the same row", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t);
    const older = await insertItem(t, orderId, homeId, {
      name: "Gretzky",
      number: "99",
      createdAt: 1_000,
    });
    const newer = await insertItem(t, orderId, homeId, {
      name: "Gretzky",
      number: "99",
      createdAt: 2_000,
    });

    // Three lines for two empty rows: the first two fill (oldest first), the
    // third has nothing left to fill and lands as its own item.
    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [
        { designId: homeId, name: "Gretzky", number: "99", size: "S", qty: 1 },
        { designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 },
        { designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 },
      ],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(3);
    expect(items.find((i) => i._id === older)?.size).toBe("S");
    expect(items.find((i) => i._id === newer)?.size).toBe("M");
    const extra = items.find((i) => i._id !== older && i._id !== newer)!;
    expect(extra).toMatchObject({ size: "L", source: "fan" });
  });

  it("does not fill an item that is removed, already sized, or already has a submitter", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t);
    const removed = await insertItem(t, orderId, homeId, {
      name: "Gretzky",
      number: "99",
      removedAt: Date.now(),
    });
    const sized = await insertItem(t, orderId, homeId, {
      name: "Gretzky",
      number: "99",
      size: "XL",
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 }],
    });

    const all = await allItems(t, orderId);
    // Convex stores no key for an undefined field, so check each field is
    // absent rather than toMatchObject({ size: undefined }), which needs the key.
    const removedItem = all.find((i) => i._id === removed);
    expect(removedItem?.removedAt).toBeDefined();
    expect(removedItem?.size).toBeUndefined();
    expect(removedItem?.submitterEmail).toBeUndefined();
    expect(all.find((i) => i._id === sized)?.size).toBe("XL");
    const fresh = all.filter((i) => i._id !== removed && i._id !== sized);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ size: "M", source: "fan" });
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

describe("Fixed mode: picking a Needs-size item fills it; picking an already-sized item, or one item in two sizes, inserts copies and nothing is merged (§7.6)", () => {
  it("fills the picked Needs-size item in place", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "fixed",
    });
    const itemId = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      designation: "A",
      qty: 1,
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, itemId, size: "L", qty: 1 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      _id: itemId,
      name: "Jordan Lee",
      number: "4",
      designation: "A",
      size: "L",
      submitterEmail: "pat@example.com",
      orderFormId,
    });
  });

  it("inserts a copy with the same name, number and letter when the picked item is already sized", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t, { namesMode: "fixed" });
    // The race in the design note: the captain sized the row before the
    // player pressed Submit.
    const itemId = await insertItem(t, orderId, homeId, {
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "M",
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, itemId, size: "L", qty: 1 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(2);
    // The captain's size is never overwritten by the public form.
    expect(items.find((i) => i._id === itemId)?.size).toBe("M");
    const copy = items.find((i) => i._id !== itemId)!;
    expect(copy).toMatchObject({
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "L",
      source: "fan",
      submitterEmail: "pat@example.com",
    });
  });

  it("picking one item in two sizes in one submission fills it once and inserts one copy", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "fixed",
    });
    const itemId = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Jordan Lee",
      number: "4",
      qty: 1,
    });

    const result = await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [
        { designId: homeId, itemId, size: "M", qty: 2 },
        { designId: homeId, itemId, size: "L", qty: 1 },
      ],
    });
    expect(result.created).toBe(2);

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(2);
    expect(items.map((i) => [i.name, i.number, i.size, i.qty])).toEqual([
      ["Jordan Lee", "4", "M", 2],
      ["Jordan Lee", "4", "L", 1],
    ]);
    expect(items[0]._id).toBe(itemId);
  });

  it("rejects a picked item that is removed, unnamed, on another design or on another order", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, awayId, userId } = await seedRun(t, {
      namesMode: "fixed",
    });
    const removed = await insertItem(t, orderId, homeId, {
      name: "Gone",
      number: "1",
      removedAt: Date.now(),
    });
    const unnamed = await insertItem(t, orderId, homeId, { number: "2" });
    const onAway = await insertItem(t, orderId, awayId, { name: "Away", number: "3" });
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
    const foreign = await insertItem(t, otherOrderId, homeId, {
      name: "Foreign",
      number: "4",
    });

    for (const itemId of [removed, unnamed, onAway, foreign]) {
      await expectUserError(() =>
        t.mutation(api.orderEntries.submitOrder, {
          orderFormId: orderFormId,
          ...fan,
          customAnswers: {},
          lines: [{ designId: homeId, itemId, size: "M", qty: 1 }],
        }),
      );
    }
    // Nothing was filled or written by any of the refused submissions.
    const fresh = (await allItems(t, orderId)).filter(
      (i) => i.submitterEmail !== undefined,
    );
    expect(fresh).toEqual([]);
  });
});

describe("Open mode collision: two different emails on the same design + name + number flag both items; same email twice does not; fixed mode never does (§7.6, JCC Q7 = A)", () => {
  async function submit(
    t: T,
    orderFormId: Id<"orderForms">,
    email: string,
    line: { designId: Id<"designs">; name?: string; number?: string; itemId?: Id<"orderItems"> },
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

  it("flags both items when two different emails send the same player in open mode", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "open",
    });
    const line = { designId: homeId, name: "Gretzky", number: "99" };
    expect((await submit(t, orderFormId, "pat@example.com", line)).collisions).toBe(0);
    expect((await submit(t, orderFormId, "sam@example.com", line, "L")).collisions).toBe(1);

    const view = await asCaptain.query(api.orderItems.listForOrder, { orderId });
    const items = view!.designs[0].items;
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.collision)).toEqual([true, true]);
  });

  it("does not flag the same email sending the same player twice", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "open",
    });
    const line = { designId: homeId, name: "Gretzky", number: "99" };
    await submit(t, orderFormId, "pat@example.com", line);
    const second = await submit(t, orderFormId, "PAT@example.com", line, "L");
    expect(second.collisions).toBe(0);

    const view = await asCaptain.query(api.orderItems.listForOrder, { orderId });
    expect(view!.designs[0].items.map((i) => i.collision)).toEqual([false, false]);
  });

  it("never flags in fixed mode, even when two emails pick the same player", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
      namesMode: "fixed",
    });
    const itemId = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Gretzky",
      number: "99",
      qty: 1,
    });
    await submit(t, orderFormId, "pat@example.com", { designId: homeId, itemId });
    const second = await submit(
      t,
      orderFormId,
      "sam@example.com",
      { designId: homeId, itemId },
      "L",
    );
    expect(second.collisions).toBe(0);

    const view = await asCaptain.query(api.orderItems.listForOrder, { orderId });
    const items = view!.designs[0].items;
    expect(items).toHaveLength(2);
    expect(items.every((i) => !i.collision)).toBe(true);
  });

  it("is a row warning, never a block: the colliding line is still written", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId } = await seedRun(t, { namesMode: "open" });
    const line = { designId: homeId, name: "Gretzky", number: "99" };
    await submit(t, orderFormId, "pat@example.com", line);
    const second = await submit(t, orderFormId, "sam@example.com", line);
    expect(second.created).toBe(1);
    expect(await liveItems(t, orderId)).toHaveLength(2);
  });
});

describe("Same name, different number (Lee #4, Lee #9): two separate items; neither fills the other's Needs-size item; no collision in either mode", () => {
  for (const namesMode of ["open", "fixed"] as const) {
    it(`keeps Lee #4 and Lee #9 apart in ${namesMode} mode`, async () => {
      const t = convexTest(schema, modules);
      const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t, {
        namesMode,
      });
      const lee4 = await asCaptain.mutation(api.orderItems.add, {
        orderId,
        designId: homeId,
        name: "Lee",
        number: "4",
        qty: 1,
      });
      const lee9 = await asCaptain.mutation(api.orderItems.add, {
        orderId,
        designId: homeId,
        name: "Lee",
        number: "9",
        qty: 1,
      });

      // Two different people, one for each Lee.
      const lineFor = (id: Id<"orderItems">, number: string) =>
        namesMode === "fixed"
          ? { designId: homeId, itemId: id, size: "M", qty: 1 }
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
      expect(first.collisions + second.collisions).toBe(0);

      const items = await liveItems(t, orderId);
      // Each line filled its own player; no third row, no cross-fill.
      expect(items).toHaveLength(2);
      expect(items.find((i) => i._id === lee9)).toMatchObject({
        number: "9",
        submitterEmail: "pat@example.com",
      });
      expect(items.find((i) => i._id === lee4)).toMatchObject({
        number: "4",
        submitterEmail: "sam@example.com",
      });

      const view = await asCaptain.query(api.orderItems.listForOrder, {
        orderId,
      });
      expect(view!.designs[0].items.every((i) => !i.collision)).toBe(true);
    });
  }

  it("an open-mode Lee #9 line does not fill a Needs-size Lee #4", async () => {
    const t = convexTest(schema, modules);
    const { orderId, orderFormId, homeId, asCaptain } = await seedRun(t);
    const lee4 = await asCaptain.mutation(api.orderItems.add, {
      orderId,
      designId: homeId,
      name: "Lee",
      number: "4",
      qty: 1,
    });

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "Lee", number: "9", size: "M", qty: 1 }],
    });

    const items = await liveItems(t, orderId);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i._id === lee4)?.size).toBeUndefined();
    expect(items.find((i) => i._id !== lee4)).toMatchObject({
      name: "Lee",
      number: "9",
      size: "M",
    });
  });
});

describe("Same name + number submitted twice (same or different email, either mode) produces two items; nothing is merged or rejected", () => {
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
      const itemId =
        namesMode === "fixed"
          ? await asCaptain.mutation(api.orderItems.add, {
              orderId,
              designId: homeId,
              name: "Gretzky",
              number: "99",
              qty: 1,
            })
          : undefined;
      const line = itemId
        ? { designId: homeId, itemId, size: "M", qty: 1 }
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
    const seeded = await insertItem(t, orderId, homeId, {
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

    const items = await allItems(t, orderId);
    expect(items).toHaveLength(1);
    expect(items[0]._id).toBe(seeded);
    expect(items[0].size).toBeUndefined();
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
