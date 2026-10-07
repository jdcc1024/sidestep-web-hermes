// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// R2-02 acceptance tests (initiative 0004, phase 1b): the public form and the
// confirm gate write and read PLAYERS (rosterEntries), not flat items.
// Spec: backlog/R2-02-order-list-players.md (## Logic), design note
// docs/architecture/0004-roster-sizes.md. Written before the build.
//
// Covers: orderEntries.submitOrder, orderForms.getPublic,
// _orderItems.confirmBlocker (through admin.updateOrderStages, its caller).
// Messages are not pinned; rejections are asserted as ConvexError.
// Written to fail for the right reason: today submitOrder takes `itemId`, fills
// or inserts flat rows with no entry, and getPublic/confirmBlocker read items.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { confirmBlocker } from "./_orderItems";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;
const CONFIRMED = "Order Size Confirmed";

type T = TestConvex<typeof schema>;

// ── seeding ────────────────────────────────────────────────────────────────

async function seedWorld(
  t: T,
  opts: { namesMode?: "open" | "fixed"; confirmed?: boolean } = {},
) {
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const mkUser = (subject: string, isAdmin = false) =>
      ctx.db.insert("users", {
        clerkId: subject,
        email: `${subject}@example.com`,
        name: subject,
        isAdmin,
        createdAt: now,
      });
    const captainId = await mkUser("captain_x");
    const otherId = await mkUser("captain_y");
    await mkUser("admin", true);
    const mkOrder = async (ownerId: Id<"users">, team: string, confirmed = false) => {
      const designIds: Id<"designs">[] = [];
      for (const title of ["Home", "Away"])
        designIds.push(
          await ctx.db.insert("designs", {
            ownerId,
            title,
            blocks: overviewBlocks(`${title} kit`),
            createdAt: now,
            updatedAt: now,
          }),
        );
      const orderId = await ctx.db.insert("orders", {
        captainId: ownerId,
        teamName: team,
        sport: "Soccer",
        estimatedQuantity: 12,
        hasOwnDesign: false,
        designIds,
        internalStages: [
          { name: "Inquiry", completedAt: now },
          ...(confirmed ? [{ name: CONFIRMED, completedAt: now }] : []),
        ],
        createdAt: now,
        updatedAt: now,
      });
      const orderFormId = await ctx.db.insert("orderForms", {
        orderId,
        captainId: ownerId,
        sizeOptions: ["S", "M", "L", "XL"],
        namesMode: opts.namesMode ?? "open",
        customQuestions: [],
        deadline: now + 7 * ONE_DAY,
        status: "open",
        createdAt: now,
      });
      return { orderId, designIds, orderFormId };
    };
    const mine = await mkOrder(captainId, "Falcons", opts.confirmed);
    const theirs = await mkOrder(otherId, "Hawks");
    return { mine, theirs };
  });
  return {
    t,
    orderId: ids.mine.orderId,
    homeId: ids.mine.designIds[0],
    awayId: ids.mine.designIds[1],
    orderFormId: ids.mine.orderFormId,
    otherOrderId: ids.theirs.orderId,
    otherHomeId: ids.theirs.designIds[0],
    otherFormId: ids.theirs.orderFormId,
    captain: t.withIdentity({
      subject: "captain_x",
      email: "captain_x@example.com",
      name: "captain_x",
    }),
    admin: t.withIdentity({
      subject: "admin",
      email: "admin@example.com",
      name: "admin",
    }),
  };
}
type World = Awaited<ReturnType<typeof seedWorld>>;

// An entry (and its size lines) written straight into the tables.
async function seedEntry(
  t: T,
  w: { orderId: Id<"orders">; designId: Id<"designs"> },
  o: {
    name?: string;
    number?: string;
    removedAt?: number;
    lines?: { size: string; qty?: number; removedAt?: number }[];
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const entryId = await ctx.db.insert("rosterEntries", {
      orderId: w.orderId,
      designId: w.designId,
      name: o.name,
      number: o.number,
      source: "captain",
      removedAt: o.removedAt,
      createdAt: now,
      updatedAt: now,
    });
    for (const [i, l] of (o.lines ?? []).entries())
      await ctx.db.insert("orderItems", {
        orderId: w.orderId,
        rosterEntryId: entryId,
        size: l.size,
        qty: l.qty ?? 1,
        source: "captain",
        removedAt: l.removedAt,
        createdAt: now + i,
        updatedAt: now,
      });
    return entryId;
  });
}

const entriesOf = (t: T, orderId: Id<"orders">) =>
  t.run((ctx) =>
    ctx.db
      .query("rosterEntries")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );

const itemsOf = (t: T, orderId: Id<"orders">) =>
  t.run((ctx) =>
    ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );

async function rejection(fn: () => Promise<unknown>): Promise<ConvexError<string>> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected the call to be rejected").toBeInstanceOf(ConvexError);
  return caught as ConvexError<string>;
}

const pat = { submitterName: "Pat Fan", submitterEmail: "pat@example.com" };
const riley = { submitterName: "Riley", submitterEmail: "riley@example.com" };

// ── orderEntries.submitOrder ───────────────────────────────────────────────

describe("orderEntries.submitOrder: open-mode lines write items under a player", () => {
  it("a line for an existing player adds an item under that entry; no second entry", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const entryId = await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      { name: "Sidestep", number: "72", lines: [{ size: "M", qty: 3 }] },
    );

    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: w.orderFormId,
      ...pat,
      customAnswers: {},
      lines: [
        // typed with different case/spacing: still the same player
        { designId: w.homeId, name: " sidestep ", number: "72", size: "L", qty: 1 },
      ],
    });

    const entries = (await entriesOf(t, w.orderId)).filter((e) => !e.removedAt);
    expect(entries).toHaveLength(1);
    expect(entries[0]._id).toBe(entryId);
    const items = (await itemsOf(t, w.orderId)).filter((i) => !i.removedAt);
    expect(items.filter((i) => i.rosterEntryId === entryId)).toHaveLength(2);
    const fanItem = items.find((i) => i.size === "L")!;
    expect(fanItem.source).toBe("fan");
    expect(fanItem.rosterEntryId).toBe(entryId);
    expect(fanItem.submitterEmail).toBe("pat@example.com");
  });

  it("two different emails, same name + number on one design: one entry, two items, each keeps its own submitterEmail", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    for (const who of [pat, riley])
      await t.mutation(api.orderEntries.submitOrder, {
        orderFormId: w.orderFormId,
        ...who,
        customAnswers: {},
        lines: [
          { designId: w.homeId, name: "Sidestep", number: "72", size: "M", qty: 1 },
        ],
      });

    const entries = (await entriesOf(t, w.orderId)).filter((e) => !e.removedAt);
    expect(entries).toHaveLength(1);
    const items = (await itemsOf(t, w.orderId)).filter((i) => !i.removedAt);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.rosterEntryId === entries[0]._id)).toBe(true);
    expect(items.map((i) => i.submitterEmail).sort()).toEqual([
      "pat@example.com",
      "riley@example.com",
    ]);
  });

  it("does not fill a captain's sizeless player in place: it inserts a fan item under the entry", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const entryId = await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      { name: "Jordan Lee", number: "4" },
    );
    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: w.orderFormId,
      ...pat,
      customAnswers: {},
      lines: [{ designId: w.homeId, name: "Jordan Lee", number: "4", size: "M", qty: 1 }],
    });
    expect((await entriesOf(t, w.orderId)).filter((e) => !e.removedAt)).toHaveLength(1);
    const items = (await itemsOf(t, w.orderId)).filter((i) => !i.removedAt);
    expect(items).toHaveLength(1);
    expect(items[0].rosterEntryId).toBe(entryId);
    expect(items[0].source).toBe("fan");
  });

  it("the result names rosterEntryId per line and carries no collision flags", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const res = await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: w.orderFormId,
      ...pat,
      customAnswers: {},
      lines: [{ designId: w.homeId, name: "Sidestep", number: "72", size: "M", qty: 2 }],
    });
    const json = JSON.stringify(res);
    expect(json).not.toMatch(/collision/i);
    expect(json).not.toMatch(/itemId/);
    const entries = (await entriesOf(t, w.orderId)).filter((e) => !e.removedAt);
    expect(
      (res as { items: { rosterEntryId: string }[] }).items[0].rosterEntryId,
    ).toBe(entries[0]._id);
  });
});

describe("orderEntries.submitOrder: fixed-mode lines pick a player by rosterEntryId", () => {
  it("adds items under the picked entry, one per line, even when the entry already has sizes", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { namesMode: "fixed" });
    const entryId = await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      { name: "Gretzky", number: "99", lines: [{ size: "M" }] },
    );
    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: w.orderFormId,
      ...pat,
      customAnswers: {},
      lines: [
        { designId: w.homeId, rosterEntryId: entryId, size: "L", qty: 1 },
        { designId: w.homeId, rosterEntryId: entryId, size: "XL", qty: 2 },
      ],
    });
    expect((await entriesOf(t, w.orderId)).filter((e) => !e.removedAt)).toHaveLength(1);
    const items = (await itemsOf(t, w.orderId)).filter(
      (i) => !i.removedAt && i.rosterEntryId === entryId,
    );
    expect(items.map((i) => `${i.size}x${i.qty}`).sort()).toEqual(["Lx1", "Mx1", "XLx2"]);
  });

  it("rejects an entry from another order", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { namesMode: "fixed" });
    const foreign = await seedEntry(
      t,
      { orderId: w.otherOrderId, designId: w.otherHomeId },
      { name: "Stranger", number: "1", lines: [{ size: "M" }] },
    );
    await rejection(() =>
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: w.orderFormId,
        ...pat,
        customAnswers: {},
        lines: [{ designId: w.homeId, rosterEntryId: foreign, size: "M", qty: 1 }],
      }),
    );
    expect(await itemsOf(t, w.orderId)).toHaveLength(0);
  });

  it("rejects a removed entry, an unnamed entry and an entry on another design", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { namesMode: "fixed" });
    const at = { orderId: w.orderId, designId: w.homeId };
    const removed = await seedEntry(t, at, { name: "Gone", number: "2", removedAt: Date.now() });
    const unnamed = await seedEntry(t, at, { number: "3" });
    const awayEntry = await seedEntry(
      t,
      { orderId: w.orderId, designId: w.awayId },
      { name: "Away Guy", number: "5" },
    );
    for (const id of [removed, unnamed, awayEntry])
      await rejection(() =>
        t.mutation(api.orderEntries.submitOrder, {
          orderFormId: w.orderFormId,
          ...pat,
          customAnswers: {},
          lines: [{ designId: w.homeId, rosterEntryId: id, size: "M", qty: 1 }],
        }),
      );
    expect(await itemsOf(t, w.orderId)).toHaveLength(0);
  });
});

describe("orderEntries.submitOrder: a locked list rejects", () => {
  it("refuses an open-mode line once the order size is confirmed, and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { confirmed: true });
    await rejection(() =>
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: w.orderFormId,
        ...pat,
        customAnswers: {},
        lines: [{ designId: w.homeId, name: "Sidestep", number: "72", size: "M", qty: 1 }],
      }),
    );
    expect(await entriesOf(t, w.orderId)).toHaveLength(0);
    expect(await itemsOf(t, w.orderId)).toHaveLength(0);
  });
});

// ── orderForms.getPublic ───────────────────────────────────────────────────

describe("orderForms.getPublic: the picker is the live named entries", () => {
  it("lists each live named entry once, as exactly { _id, name, number }; removed and unnamed entries are not listed", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { namesMode: "fixed" });
    const at = { orderId: w.orderId, designId: w.homeId };
    // Two size lines, a submitter on one: still one picker row, nothing leaked.
    const sidestep = await seedEntry(t, at, {
      name: "Sidestep",
      number: "72",
      lines: [{ size: "S" }, { size: "M", qty: 3 }],
    });
    await t.run(async (ctx) => {
      const [first] = await ctx.db
        .query("orderItems")
        .withIndex("by_entry", (q) => q.eq("rosterEntryId", sidestep))
        .collect();
      await ctx.db.patch(first._id, {
        submitterName: "Secret Mum",
        submitterEmail: "mum@example.com",
      });
    });
    await seedEntry(t, at, { name: "Gone", number: "2", removedAt: Date.now() });
    await seedEntry(t, at, { number: "3", lines: [{ size: "M" }] }); // blank name
    const needsSizes = await seedEntry(t, at, { name: "Jordan Lee", number: "4" });

    const data = await t.query(api.orderForms.getPublic, { orderFormId: w.orderFormId });
    const home = data!.designs.find((d) => d._id === w.homeId)!;
    expect([...home.roster].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { _id: needsSizes, name: "Jordan Lee", number: "4" },
      { _id: sidestep, name: "Sidestep", number: "72" },
    ]);
    for (const row of home.roster)
      expect(Object.keys(row).sort()).toEqual(["_id", "name", "number"]);
    expect(JSON.stringify(data)).not.toMatch(/mum@example\.com|Secret Mum/);
    expect(data!.designs.find((d) => d._id === w.awayId)!.roster).toHaveLength(0);
  });

  it("an entry with live items under a removed entry, or items alone with no entry, never appear", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { namesMode: "fixed" });
    await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      { name: "Removed", number: "9", removedAt: Date.now(), lines: [{ size: "M" }] },
    );
    const data = await t.query(api.orderForms.getPublic, { orderFormId: w.orderFormId });
    expect(data!.designs.find((d) => d._id === w.homeId)!.roster).toEqual([]);
  });

  it("unknown form is null, and another order's players never show up in this form's picker", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { namesMode: "fixed" });
    await seedEntry(
      t,
      { orderId: w.otherOrderId, designId: w.otherHomeId },
      { name: "Stranger", number: "1", lines: [{ size: "M" }] },
    );
    const data = await t.query(api.orderForms.getPublic, { orderFormId: w.orderFormId });
    expect(JSON.stringify(data!.designs)).not.toMatch(/Stranger/);
  });
});

// ── _orderItems.confirmBlocker (through the admin confirm gate) ────────────

describe("confirmBlocker: players with no live sizes block confirming", () => {
  const confirm = (w: World) =>
    w.admin.mutation(api.admin.updateOrderStages, {
      orderId: w.orderId,
      stages: [
        { name: "Inquiry", completedAt: Date.now() },
        { name: CONFIRMED, completedAt: Date.now() },
      ],
    });
  const stageNames = async (t: T, orderId: Id<"orders">) =>
    (await t.run((ctx) => ctx.db.get(orderId)))!.internalStages
      .filter((s) => s.completedAt !== undefined)
      .map((s) => s.name);

  it("happy path: every player has a live size, so confirming goes through", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      { name: "Sidestep", number: "72", lines: [{ size: "M", qty: 3 }] },
    );
    await confirm(w);
    expect(await stageNames(t, w.orderId)).toContain(CONFIRMED);
    const order = (await t.run((ctx) => ctx.db.get(w.orderId)))!;
    expect(await t.run((ctx) => confirmBlocker(ctx, order))).toBeNull();
  });

  it("a named player with no items blocks, is named, and the stage stays unchecked", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      { name: "Jordan Lee", number: "4" },
    );
    const err = await rejection(() => confirm(w));
    expect(err.data).toMatch(/Jordan Lee/);
    expect(err.data).toMatch(/#4/);
    expect(await stageNames(t, w.orderId)).not.toContain(CONFIRMED);
    const order = (await t.run((ctx) => ctx.db.get(w.orderId)))!;
    expect(await t.run((ctx) => confirmBlocker(ctx, order))).toMatch(/Jordan Lee/);
  });

  it("a player whose only line was lowered to 0 (soft-removed) blocks", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      {
        name: "Mo",
        number: "88",
        lines: [{ size: "M", removedAt: Date.now() }],
      },
    );
    const err = await rejection(() => confirm(w));
    expect(err.data).toMatch(/Mo/);
  });

  it("blank jerseys never block; neither does a removed player with no sizes", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const at = { orderId: w.orderId, designId: w.homeId };
    await seedEntry(t, at, { lines: [{ size: "L", qty: 4 }] }); // blank jerseys
    await seedEntry(t, at, { name: "Gone", number: "2", removedAt: Date.now() });
    await seedEntry(t, at, { name: "Sidestep", number: "72", lines: [{ size: "M" }] });
    await confirm(w);
    expect(await stageNames(t, w.orderId)).toContain(CONFIRMED);
  });

  it("a non-admin cannot confirm, so the gate is never the captain's to skip", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await seedEntry(
      t,
      { orderId: w.orderId, designId: w.homeId },
      { name: "Sidestep", number: "72", lines: [{ size: "M" }] },
    );
    await expect(
      w.captain.mutation(api.admin.updateOrderStages, {
        orderId: w.orderId,
        stages: [{ name: CONFIRMED, completedAt: Date.now() }],
      }),
    ).rejects.toThrow();
    expect(await stageNames(t, w.orderId)).not.toContain(CONFIRMED);
  });
});
