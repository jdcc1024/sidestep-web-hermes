// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// L-01 acceptance tests (initiative 0004, phase 1): the `orderItems` table,
// the captain/admin API over it, and the lock/ownership matrix.
// Spec: backlog/L-01-order-items-table-and-api.md, docs/architecture/0004-order-items.md,
// docs/ux/0004-order-items.md §7/§8. One `describe` per acceptance criterion,
// named after it. Written before the build: every test here should fail only
// because `convex/orderItems.ts` / the `orderItems` table don't exist yet.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";
import { ROSTER_PASTE_MAX_ROWS } from "../lib/orderItem/paste";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;

// TestConvex<typeof schema>, not ReturnType<typeof convexTest>: the bare
// ReturnType widens the data model away, so custom indexes don't typecheck.
type T = TestConvex<typeof schema>;

// ── seeding ────────────────────────────────────────────────────────────────

async function seedUser(
  t: T,
  subject: string,
  opts: { isAdmin?: boolean; email?: string; name?: string } = {},
) {
  const email = opts.email ?? `${subject}@example.com`;
  const name = opts.name ?? subject;
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email,
      name,
      isAdmin: opts.isAdmin ?? false,
      createdAt: Date.now(),
    }),
  );
  return { userId, as: t.withIdentity({ subject, email, name }) };
}

// An order owned by `captainId` linking one design per title. No run unless
// `seedRun` is called: L-01's whole point is items without an order form.
async function seedOrder(
  t: T,
  captainId: Id<"users">,
  titles: string[] = ["Home"],
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const designIds: Id<"designs">[] = [];
    for (const title of titles) {
      designIds.push(
        await ctx.db.insert("designs", {
          ownerId: captainId,
          title,
          blocks: overviewBlocks(`${title} kit`),
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
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
    return { orderId, designIds };
  });
}

async function seedRun(
  t: T,
  orderId: Id<"orders">,
  captainId: Id<"users">,
  opts: {
    status?: "open" | "closed";
    namesMode?: "open" | "fixed";
    deadline?: number;
  } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("jerseyRuns", {
      orderId,
      captainId,
      sizeOptions: ["S", "M", "L"],
      namesMode: opts.namesMode ?? "open",
      customQuestions: [{ id: "q1", label: "Pronouns?" }],
      deadline: opts.deadline ?? Date.now() + 7 * ONE_DAY,
      status: opts.status ?? "open",
      createdAt: Date.now(),
    }),
  );
}

// JCC checks "Order Size Confirmed", which locks the list (L-06). Written
// directly, not through the admin confirm gate.
async function confirmOrderSize(t: T, orderId: Id<"orders">) {
  await t.run(async (ctx) => {
    const order = await ctx.db.get(orderId);
    await ctx.db.patch(orderId, {
      internalStages: [
        ...(order?.internalStages ?? []),
        { name: "Order Size Confirmed", completedAt: Date.now() },
      ],
    });
  });
}

// A captain (non-admin) with their own order, plus an admin, in one world.
async function seedWorld(t: T, titles: string[] = ["Home"]) {
  const captain = await seedUser(t, "captain_x", { name: "Cap X" });
  const admin = await seedUser(t, "admin", { isAdmin: true, name: "Admin" });
  const { orderId, designIds } = await seedOrder(t, captain.userId, titles);
  return { captain, admin, orderId, designIds, designId: designIds[0] };
}

// A player-submitted ("fan") item, inserted directly: only the public form
// (L-02) may set submitter fields, so tests can't create one through the API.
async function insertFanItem(
  t: T,
  orderId: Id<"orders">,
  designId: Id<"designs">,
  overrides: Partial<{
    name: string;
    number: string;
    designation: "C" | "A";
    size: string;
    qty: number;
    submitterName: string;
    submitterEmail: string;
    customAnswers: Record<string, string>;
    runId: Id<"jerseyRuns">;
    createdAt: number;
  }> = {},
) {
  const createdAt = overrides.createdAt ?? Date.now();
  return t.run((ctx) =>
    ctx.db.insert("orderItems", {
      orderId,
      designId,
      name: "Riley Park",
      number: "7",
      size: "M",
      qty: 1,
      source: "fan",
      submitterName: "Riley",
      submitterEmail: "riley@example.com",
      customAnswers: { q1: "they/them" },
      ...overrides,
      createdAt,
      updatedAt: createdAt,
    }),
  );
}

async function getItem(t: T, id: Id<"orderItems">) {
  return t.run((ctx) => ctx.db.get(id));
}

async function countItems(t: T, orderId: Id<"orders">) {
  return t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", orderId))
          .collect()
      ).length,
  );
}

// A rejection a customer could read: a ConvexError carrying a string (the
// Convex guideline for user-facing failures). Distinguishes "refused by the
// rule" from "function missing" or "crashed", which a bare toThrow() can't.
async function expectUserError(fn: () => Promise<unknown>): Promise<string> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected a ConvexError rejection").toBeInstanceOf(ConvexError);
  // Typed as string for the compiler only; the runtime check below is real.
  const data: unknown = (caught as ConvexError<string>).data;
  expect(typeof data).toBe("string");
  return data as string;
}

// ── criteria ───────────────────────────────────────────────────────────────

describe("orderItems table and indexes exist (§7.1)", () => {
  it("accepts a full item and reads it back through by_order and by_submitterEmail", async () => {
    const t = convexTest(schema, modules);
    const { orderId, designId } = await seedWorld(t);
    const id = await insertFanItem(t, orderId, designId, {
      designation: "C",
      submitterEmail: "riley@example.com",
    });

    const viaOrder = await t.run((ctx) =>
      ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .collect(),
    );
    expect(viaOrder.map((i) => i._id)).toEqual([id]);

    const viaEmail = await t.run((ctx) =>
      ctx.db
        .query("orderItems")
        .withIndex("by_submitterEmail", (q) =>
          q.eq("submitterEmail", "riley@example.com"),
        )
        .collect(),
    );
    expect(viaEmail.map((i) => i._id)).toEqual([id]);
  });

  it("stores a bare item: no name, number, letter, size or submitter", async () => {
    const t = convexTest(schema, modules);
    const { orderId, designId } = await seedWorld(t);
    const now = Date.now();
    const id = await t.run((ctx) =>
      ctx.db.insert("orderItems", {
        orderId,
        designId,
        qty: 1,
        source: "captain",
        createdAt: now,
        updatedAt: now,
      }),
    );
    const item = (
      await t.run((ctx) =>
        ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", orderId))
          .collect(),
      )
    ).find((i) => i._id === id);
    expect(item?.qty).toBe(1);
    expect(item?.name).toBeUndefined();
    expect(item?.size).toBeUndefined();
  });
});

describe("A captain can add an item to an order with no run (no deadline, no form) and it appears in listForOrder (§7.3, §8.6)", () => {
  it("adds 'Sidestep #72, M, ×1' with no run and lists it", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);

    const id = await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId,
      name: "Sidestep",
      number: "72",
      size: "M",
      qty: 1,
    });

    const stored = await getItem(t, id);
    expect(stored?.source).toBe("captain");
    expect(stored?.orderId).toBe(orderId);
    expect(stored?.runId).toBeUndefined();
    expect(stored?.submitterName).toBeUndefined();
    expect(stored?.submitterEmail).toBeUndefined();

    const list = await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    });
    expect(list).not.toBeNull();
    expect(list!.form).toBeNull();
    expect(list!.locked).toBe(false);
    expect(list!.canEdit).toBe(true);
    expect(list!.designs).toHaveLength(1);
    expect(list!.designs[0].designId).toBe(designId);
    expect(list!.designs[0].title).toBe("Home");
    expect(list!.designs[0].items).toHaveLength(1);
    expect(list!.designs[0].items[0]).toMatchObject({
      _id: id,
      designId,
      name: "Sidestep",
      number: "72",
      size: "M",
      qty: 1,
      source: "captain",
    });
    expect(list!.summary.itemCount).toBe(1);
  });

  it("rejects a design that isn't on the order", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId } = await seedWorld(t);
    const other = await seedOrder(t, captain.userId, ["Other"]);

    await expectUserError(() =>
      captain.as.mutation(api.orderItems.add, {
        orderId,
        designId: other.designIds[0],
        qty: 1,
      }),
    );
    expect(await countItems(t, orderId)).toBe(0);
  });

  it("rejects a size outside SIZE_OPTIONS and a qty under 1", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);

    await expectUserError(() =>
      captain.as.mutation(api.orderItems.add, {
        orderId,
        designId,
        size: "XXXXL",
        qty: 1,
      }),
    );
    await expectUserError(() =>
      captain.as.mutation(api.orderItems.add, { orderId, designId, qty: 0 }),
    );
    expect(await countItems(t, orderId)).toBe(0);
  });

  it("returns null to a signed-out caller and for a missing order", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId } = await seedWorld(t);

    expect(await t.query(api.orderItems.listForOrder, { orderId })).toBeNull();

    const goneOrderId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("orders", {
        captainId: captain.userId,
        teamName: "Gone",
        sport: "Soccer",
        estimatedQuantity: 1,
        hasOwnDesign: false,
        designIds: [],
        internalStages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });
    expect(
      await captain.as.query(api.orderItems.listForOrder, {
        orderId: goneOrderId,
      }),
    ).toBeNull();
  });
});

describe("add with no size stores no size; summarize counts it in needsSize, not itemCount, per design and overall (§7.5, §8.7)", () => {
  it("stores no size field and counts the item as needing a size", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designIds } = await seedWorld(t, [
      "Home",
      "Away",
    ]);
    const [home, away] = designIds;

    const unsized = await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: home,
      name: "Jordan Lee",
      number: "4",
      qty: 1,
    });
    await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: home,
      name: "Sam",
      size: "M",
      qty: 2,
    });
    await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: away,
      size: "L",
      qty: 3,
    });

    const stored = await getItem(t, unsized);
    expect(stored).not.toBeNull();
    expect(stored!.size).toBeUndefined();
    expect("size" in stored!).toBe(false);

    const list = await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    });
    const homeView = list!.designs.find((d) => d.designId === home)!;
    const awayView = list!.designs.find((d) => d.designId === away)!;
    expect(homeView.summary.itemCount).toBe(2);
    expect(homeView.summary.needsSize).toBe(1);
    expect(homeView.summary.bySize).toEqual([{ size: "M", qty: 2 }]);
    expect(awayView.summary.itemCount).toBe(3);
    expect(awayView.summary.needsSize).toBe(0);
    expect(list!.summary.itemCount).toBe(5);
    expect(list!.summary.needsSize).toBe(1);
    expect(list!.summary.bySize).toEqual([
      { size: "M", qty: 2 },
      { size: "L", qty: 3 },
    ]);
    const unsizedView = homeView.items.find((i) => i._id === unsized)!;
    expect(unsizedView.size).toBeUndefined();
  });

  it("treats a blank size string as no size", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const id = await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId,
      size: "",
      qty: 1,
    });
    expect((await getItem(t, id))?.size).toBeUndefined();
  });
});

describe("update changes every editable field of a fan-sourced item (name, number, letter, size, qty) and leaves submitterName, submitterEmail, customAnswers, source, createdAt unchanged (§7.2)", () => {
  it("edits all five fields and preserves the player's identity and answers", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const runId = await seedRun(t, orderId, captain.userId);
    const createdAt = Date.now() - ONE_DAY;
    const id = await insertFanItem(t, orderId, designId, {
      runId,
      createdAt,
    });
    const before = (await getItem(t, id))!;

    await captain.as.mutation(api.orderItems.update, {
      itemId: id,
      name: "Riley Parker",
      number: "17",
      designation: "A",
      size: "L",
      qty: 2,
    });

    const after = (await getItem(t, id))!;
    expect(after.name).toBe("Riley Parker");
    expect(after.number).toBe("17");
    expect(after.designation).toBe("A");
    expect(after.size).toBe("L");
    expect(after.qty).toBe(2);

    expect(after.submitterName).toBe(before.submitterName);
    expect(after.submitterEmail).toBe(before.submitterEmail);
    expect(after.customAnswers).toEqual(before.customAnswers);
    expect(after.source).toBe("fan");
    expect(after.createdAt).toBe(createdAt);
    expect(after.designId).toBe(designId);
    expect(after.runId).toBe(runId);
    expect(after.updatedBy).toBe(captain.userId);
    expect(after.updatedAt).toBeGreaterThan(createdAt);
  });

  it("is a full replace: omitted optional fields are cleared", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const id = await insertFanItem(t, orderId, designId, {
      designation: "C",
    });

    await captain.as.mutation(api.orderItems.update, { itemId: id, qty: 1 });

    const after = (await getItem(t, id))!;
    expect(after.name).toBeUndefined();
    expect(after.number).toBeUndefined();
    expect(after.designation).toBeUndefined();
    expect(after.size).toBeUndefined();
    expect(after.submitterEmail).toBe("riley@example.com");
  });

  it("keeps a legacy size (XXL) that is the item's current value, but won't set it fresh", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const legacy = await insertFanItem(t, orderId, designId, { size: "XXL" });
    const modern = await insertFanItem(t, orderId, designId, { size: "M" });

    await captain.as.mutation(api.orderItems.update, {
      itemId: legacy,
      name: "Renamed",
      size: "XXL",
      qty: 1,
    });
    expect((await getItem(t, legacy))?.size).toBe("XXL");
    expect((await getItem(t, legacy))?.name).toBe("Renamed");

    await expectUserError(() =>
      captain.as.mutation(api.orderItems.update, {
        itemId: modern,
        size: "XXL",
        qty: 1,
      }),
    );
    expect((await getItem(t, modern))?.size).toBe("M");
  });
});

describe("update passing a submitter field is rejected by the validator (arg not accepted)", () => {
  // Cast through `never`: these calls are deliberately outside the arg type,
  // which is the point. The server's validator must refuse them.
  const forbidden: Array<[string, unknown]> = [
    ["submitterName", "Forged"],
    ["submitterEmail", "forged@example.com"],
    ["customAnswers", { q1: "forged" }],
    ["source", "captain"],
    ["designId", "placeholder"],
    ["isAdmin", true],
  ];

  for (const [field, value] of forbidden) {
    it(`rejects \`${field}\` and leaves the item untouched`, async () => {
      const t = convexTest(schema, modules);
      const { captain, orderId, designId } = await seedWorld(t);
      const id = await insertFanItem(t, orderId, designId);
      const before = await getItem(t, id);
      const args: Record<string, unknown> = {
        itemId: id,
        name: "Riley Park",
        number: "7",
        size: "M",
        qty: 1,
        [field]: field === "designId" ? designId : value,
      };

      await expect(
        captain.as.mutation(api.orderItems.update, args as never),
      ).rejects.toThrow(/Unexpected field/);
      expect(await getItem(t, id)).toEqual(before);
    });
  }

  it("rejects submitter fields on add and addMany too", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);

    await expect(
      captain.as.mutation(api.orderItems.add, {
        orderId,
        designId,
        qty: 1,
        submitterEmail: "forged@example.com",
      } as never),
    ).rejects.toThrow(/Unexpected field/);
    await expect(
      captain.as.mutation(api.orderItems.addMany, {
        orderId,
        designId,
        rows: [{ name: "A", submitterName: "Forged" }],
      } as never),
    ).rejects.toThrow(/Unexpected field/);
    expect(await countItems(t, orderId)).toBe(0);
  });
});

describe("remove on a sized, player-submitted item succeeds; listForOrder no longer returns it and the totals drop; restore brings back the same _id with identical name, number, size, qty, letter, submitter and position (§7.4, §8.5)", () => {
  it("soft-removes and restores the exact item in its original place", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const base = Date.now() - 3 * ONE_DAY;
    const first = await insertFanItem(t, orderId, designId, {
      name: "Ana",
      number: "1",
      size: "S",
      submitterEmail: "ana@example.com",
      submitterName: "Ana",
      createdAt: base,
    });
    const middle = await insertFanItem(t, orderId, designId, {
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "L",
      qty: 2,
      submitterName: "Jordan",
      submitterEmail: "jordan@example.com",
      createdAt: base + 1000,
    });
    const last = await insertFanItem(t, orderId, designId, {
      name: "Zed",
      number: "99",
      size: "M",
      submitterEmail: "zed@example.com",
      submitterName: "Zed",
      createdAt: base + 2000,
    });

    const before = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(before.designs[0].items.map((i) => i._id)).toEqual([
      first,
      middle,
      last,
    ]);
    expect(before.summary.itemCount).toBe(4);
    const middleBefore = before.designs[0].items[1];

    await captain.as.mutation(api.orderItems.remove, { itemId: middle });

    const removed = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(removed.designs[0].items.map((i) => i._id)).toEqual([first, last]);
    expect(removed.summary.itemCount).toBe(2);
    expect(removed.designs[0].summary.itemCount).toBe(2);
    expect(removed.summary.bySize).toEqual([
      { size: "S", qty: 1 },
      { size: "M", qty: 1 },
    ]);
    // Soft delete: the row is still there, marked.
    expect((await getItem(t, middle))?.removedAt).toEqual(expect.any(Number));

    await captain.as.mutation(api.orderItems.restore, { itemId: middle });

    const restored = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(restored.designs[0].items.map((i) => i._id)).toEqual([
      first,
      middle,
      last,
    ]);
    const middleAfter = restored.designs[0].items[1];
    expect(middleAfter).toMatchObject({
      _id: middle,
      name: middleBefore.name,
      number: middleBefore.number,
      designation: middleBefore.designation,
      size: middleBefore.size,
      qty: middleBefore.qty,
      submitterName: middleBefore.submitterName,
      submitterEmail: middleBefore.submitterEmail,
      customAnswers: middleBefore.customAnswers,
      createdAt: middleBefore.createdAt,
    });
    expect(restored.summary.itemCount).toBe(4);
    expect((await getItem(t, middle))?.removedAt).toBeUndefined();
  });

  it("restore on an item that isn't removed is a no-op", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const id = await insertFanItem(t, orderId, designId);
    const before = await getItem(t, id);

    await captain.as.mutation(api.orderItems.restore, { itemId: id });

    const after = await getItem(t, id);
    expect(after?.removedAt).toBeUndefined();
    expect(after?.name).toBe(before?.name);
    expect(after?.size).toBe(before?.size);
  });
});

describe("Captain of order X cannot add/update/remove/restore/copyToDesign/listForOrder on order Y (each rejected)", () => {
  async function seedTwoCaptains(t: T) {
    const x = await seedUser(t, "captain_x");
    const y = await seedUser(t, "captain_y");
    await seedOrder(t, x.userId, ["X Home"]);
    const orderY = await seedOrder(t, y.userId, ["Y Home", "Y Away"]);
    const itemY = await insertFanItem(
      t,
      orderY.orderId,
      orderY.designIds[0],
    );
    const removedY = await insertFanItem(
      t,
      orderY.orderId,
      orderY.designIds[0],
      { name: "Gone", number: "0" },
    );
    await t.run((ctx) => ctx.db.patch(removedY, { removedAt: Date.now() }));
    return { x, orderY, itemY, removedY };
  }

  it("rejects add", async () => {
    const t = convexTest(schema, modules);
    const { x, orderY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      x.as.mutation(api.orderItems.add, {
        orderId: orderY.orderId,
        designId: orderY.designIds[0],
        qty: 1,
      }),
    );
    expect(await countItems(t, orderY.orderId)).toBe(2);
  });

  it("rejects addMany", async () => {
    const t = convexTest(schema, modules);
    const { x, orderY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      x.as.mutation(api.orderItems.addMany, {
        orderId: orderY.orderId,
        designId: orderY.designIds[0],
        rows: [{ name: "Intruder" }],
      }),
    );
    expect(await countItems(t, orderY.orderId)).toBe(2);
  });

  it("rejects update", async () => {
    const t = convexTest(schema, modules);
    const { x, itemY } = await seedTwoCaptains(t);
    const before = await getItem(t, itemY);
    await expectUserError(() =>
      x.as.mutation(api.orderItems.update, {
        itemId: itemY,
        name: "Hijacked",
        qty: 9,
      }),
    );
    expect(await getItem(t, itemY)).toEqual(before);
  });

  it("rejects remove", async () => {
    const t = convexTest(schema, modules);
    const { x, itemY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      x.as.mutation(api.orderItems.remove, { itemId: itemY }),
    );
    expect((await getItem(t, itemY))?.removedAt).toBeUndefined();
  });

  it("rejects restore", async () => {
    const t = convexTest(schema, modules);
    const { x, removedY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      x.as.mutation(api.orderItems.restore, { itemId: removedY }),
    );
    expect((await getItem(t, removedY))?.removedAt).toEqual(
      expect.any(Number),
    );
  });

  it("rejects copyToDesign", async () => {
    const t = convexTest(schema, modules);
    const { x, orderY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      x.as.mutation(api.orderItems.copyToDesign, {
        orderId: orderY.orderId,
        sourceDesignId: orderY.designIds[0],
        targetDesignId: orderY.designIds[1],
      }),
    );
    expect(await countItems(t, orderY.orderId)).toBe(2);
  });

  it("rejects listForOrder", async () => {
    const t = convexTest(schema, modules);
    const { x, orderY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      x.as.query(api.orderItems.listForOrder, { orderId: orderY.orderId }),
    );
  });

  it("rejects affectedByDesignRemoval", async () => {
    const t = convexTest(schema, modules);
    const { x, orderY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      x.as.query(api.orderItems.affectedByDesignRemoval, {
        orderId: orderY.orderId,
        designId: orderY.designIds[0],
      }),
    );
  });

  it("rejects a signed-out caller on every write", async () => {
    const t = convexTest(schema, modules);
    const { orderY, itemY } = await seedTwoCaptains(t);
    await expectUserError(() =>
      t.mutation(api.orderItems.add, {
        orderId: orderY.orderId,
        designId: orderY.designIds[0],
        qty: 1,
      }),
    );
    await expectUserError(() =>
      t.mutation(api.orderItems.update, { itemId: itemY, qty: 1 }),
    );
    await expectUserError(() =>
      t.mutation(api.orderItems.remove, { itemId: itemY }),
    );
  });
});

describe('When isListLocked is true: captain writes are rejected with a message containing no "jersey run"/"roster"; admin add/update/remove/restore succeed (§7.8)', () => {
  // The rule since L-06 (Q1 = A): JCC has checked "Order Size Confirmed".
  // The order's form stays open, so nothing here leans on the form.
  async function seedLocked(t: T) {
    const world = await seedWorld(t, ["Home", "Away"]);
    const runId = await seedRun(t, world.orderId, world.captain.userId, {
      deadline: Date.now() + ONE_DAY,
    });
    await confirmOrderSize(t, world.orderId);
    const item = await insertFanItem(t, world.orderId, world.designId, {
      runId,
    });
    const removed = await insertFanItem(t, world.orderId, world.designId, {
      name: "Gone",
      number: "0",
      runId,
    });
    await t.run((ctx) => ctx.db.patch(removed, { removedAt: Date.now() }));
    return { ...world, runId, item, removed };
  }

  function expectCustomerCopy(message: string) {
    expect(message).not.toMatch(/jersey run/i);
    expect(message).not.toMatch(/roster/i);
    expect(message).toMatch(/locked/i);
  }

  it("rejects every captain write with customer copy", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designIds, item, removed } =
      await seedLocked(t);
    const [home, away] = designIds;

    const calls: Array<[string, () => Promise<unknown>]> = [
      [
        "add",
        () =>
          captain.as.mutation(api.orderItems.add, {
            orderId,
            designId: home,
            qty: 1,
          }),
      ],
      [
        "addMany",
        () =>
          captain.as.mutation(api.orderItems.addMany, {
            orderId,
            designId: home,
            rows: [{ name: "Late" }],
          }),
      ],
      [
        "update",
        () =>
          captain.as.mutation(api.orderItems.update, {
            itemId: item,
            size: "L",
            qty: 1,
          }),
      ],
      [
        "remove",
        () => captain.as.mutation(api.orderItems.remove, { itemId: item }),
      ],
      [
        "restore",
        () => captain.as.mutation(api.orderItems.restore, { itemId: removed }),
      ],
      [
        "copyToDesign",
        () =>
          captain.as.mutation(api.orderItems.copyToDesign, {
            orderId,
            sourceDesignId: home,
            targetDesignId: away,
          }),
      ],
    ];

    for (const [name, call] of calls) {
      const message = await expectUserError(call);
      expect(message, `${name} message`).toBeTruthy();
      expectCustomerCopy(message);
    }
    expect((await getItem(t, item))?.size).toBe("M");
    expect((await getItem(t, item))?.removedAt).toBeUndefined();
    expect((await getItem(t, removed))?.removedAt).toEqual(expect.any(Number));
    expect(await countItems(t, orderId)).toBe(2);
  });

  it("does not lock when only the form's deadline has passed (L-06: the deadline closes the form)", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    await seedRun(t, orderId, captain.userId, {
      deadline: Date.now() - ONE_DAY,
    });
    const id = await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId,
      qty: 1,
    });
    expect((await getItem(t, id))?.orderId).toBe(orderId);
  });

  it("lets an admin add, update, remove and restore on the locked order", async () => {
    const t = convexTest(schema, modules);
    const { admin, orderId, designId, item, removed } = await seedLocked(t);

    const added = await admin.as.mutation(api.orderItems.add, {
      orderId,
      designId,
      name: "Late Add",
      size: "S",
      qty: 1,
    });
    expect((await getItem(t, added))?.source).toBe("captain");

    await admin.as.mutation(api.orderItems.update, {
      itemId: item,
      name: "Riley Park",
      number: "7",
      size: "L",
      qty: 3,
    });
    const updated = await getItem(t, item);
    expect(updated?.size).toBe("L");
    expect(updated?.qty).toBe(3);
    expect(updated?.updatedBy).toBe(admin.userId);
    expect(updated?.submitterEmail).toBe("riley@example.com");

    await admin.as.mutation(api.orderItems.restore, { itemId: removed });
    expect((await getItem(t, removed))?.removedAt).toBeUndefined();

    await admin.as.mutation(api.orderItems.remove, { itemId: item });
    expect((await getItem(t, item))?.removedAt).toEqual(expect.any(Number));
  });

  it("lets an admin write to any order, including one with no run", async () => {
    const t = convexTest(schema, modules);
    const { admin, orderId, designId } = await seedWorld(t);
    const id = await admin.as.mutation(api.orderItems.add, {
      orderId,
      designId,
      qty: 1,
    });
    expect((await getItem(t, id))?.orderId).toBe(orderId);
  });
});

describe("listForOrder returns canEdit: false, locked: true to a captain on a locked order and canEdit: true to an admin", () => {
  it("reports the lock and edit rights per caller", async () => {
    const t = convexTest(schema, modules);
    const { captain, admin, orderId, designId } = await seedWorld(t);
    const runId = await seedRun(t, orderId, captain.userId, {
      namesMode: "fixed",
    });
    await confirmOrderSize(t, orderId);
    await insertFanItem(t, orderId, designId, { runId });

    const asCaptain = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(asCaptain.locked).toBe(true);
    expect(asCaptain.canEdit).toBe(false);
    expect(asCaptain.form).toEqual({ runId, namesMode: "fixed" });

    const asAdmin = (await admin.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(asAdmin.locked).toBe(true);
    expect(asAdmin.canEdit).toBe(true);
    expect(asAdmin.designs[0].items).toHaveLength(1);
  });

  it("reports canEdit: true, locked: false to the captain of an unlocked order with a form", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId } = await seedWorld(t);
    const runId = await seedRun(t, orderId, captain.userId);

    const list = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(list.locked).toBe(false);
    expect(list.canEdit).toBe(true);
    expect(list.form).toEqual({ runId, namesMode: "open" });
  });

  it("shows the captain and admin the submitter email and answers", async () => {
    const t = convexTest(schema, modules);
    const { captain, admin, orderId, designId } = await seedWorld(t);
    await insertFanItem(t, orderId, designId);

    for (const who of [captain, admin]) {
      const list = (await who.as.query(api.orderItems.listForOrder, {
        orderId,
      }))!;
      expect(list.designs[0].items[0]).toMatchObject({
        submitterName: "Riley",
        submitterEmail: "riley@example.com",
        customAnswers: { q1: "they/them" },
      });
    }
  });
});

describe("addMany stores the size per row when given, none when not; rejects 0 or > 200 rows; one bad row rejects the batch (§7.7 server half)", () => {
  it("stores each row's size, or none", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);

    await captain.as.mutation(api.orderItems.addMany, {
      orderId,
      designId,
      rows: [
        { name: "Ana", number: "1", size: "M" },
        { name: "Ben" },
        { number: "5", size: "XL" },
      ],
    });

    // Read back in insertion order (by_order is ordered by _creationTime);
    // the return value of addMany isn't part of the contract.
    const items = await t.run((ctx) =>
      ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .collect(),
    );
    expect(items).toHaveLength(3);
    expect(items.map((i) => i?.size)).toEqual(["M", undefined, "XL"]);
    expect(items.map((i) => i?.name)).toEqual(["Ana", "Ben", undefined]);
    expect(items.map((i) => i?.number)).toEqual(["1", undefined, "5"]);
    for (const item of items) {
      expect(item?.source).toBe("captain");
      expect(item?.qty).toBe(1);
      expect(item?.designId).toBe(designId);
      expect(item?.submitterEmail).toBeUndefined();
    }

    const list = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(list.summary.itemCount).toBe(2);
    expect(list.summary.needsSize).toBe(1);
  });

  it("does not dedupe: the same name and number twice is two items (Q7)", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId,
      name: "Jordan Lee",
      number: "4",
      qty: 1,
    });
    await captain.as.mutation(api.orderItems.addMany, {
      orderId,
      designId,
      rows: [
        { name: "Jordan Lee", number: "4", size: "M" },
        { name: "Jordan Lee", number: "4", size: "L" },
      ],
    });
    expect(await countItems(t, orderId)).toBe(3);
  });

  it("rejects an empty batch", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    await expectUserError(() =>
      captain.as.mutation(api.orderItems.addMany, {
        orderId,
        designId,
        rows: [],
      }),
    );
    expect(await countItems(t, orderId)).toBe(0);
  });

  it(`accepts exactly ${ROSTER_PASTE_MAX_ROWS} rows and rejects ${ROSTER_PASTE_MAX_ROWS + 1}`, async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `P${i}`, number: `${i}` }));

    await expectUserError(() =>
      captain.as.mutation(api.orderItems.addMany, {
        orderId,
        designId,
        rows: rows(ROSTER_PASTE_MAX_ROWS + 1),
      }),
    );
    expect(await countItems(t, orderId)).toBe(0);

    await captain.as.mutation(api.orderItems.addMany, {
      orderId,
      designId,
      rows: rows(ROSTER_PASTE_MAX_ROWS),
    });
    expect(await countItems(t, orderId)).toBe(ROSTER_PASTE_MAX_ROWS);
  });

  it("rejects the whole batch when one row has a bad number", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    await expectUserError(() =>
      captain.as.mutation(api.orderItems.addMany, {
        orderId,
        designId,
        rows: [{ name: "Ok", size: "M" }, { name: "Bad", number: "123456789" }],
      }),
    );
    expect(await countItems(t, orderId)).toBe(0);
  });

  it("rejects the whole batch when one row has a size outside SIZE_OPTIONS", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    await expectUserError(() =>
      captain.as.mutation(api.orderItems.addMany, {
        orderId,
        designId,
        rows: [{ name: "Ok", size: "M" }, { name: "Bad", size: "Huge" }],
      }),
    );
    expect(await countItems(t, orderId)).toBe(0);
  });

  it("rejects the whole batch when one row's name is over 80 characters", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    await expectUserError(() =>
      captain.as.mutation(api.orderItems.addMany, {
        orderId,
        designId,
        rows: [{ name: "Ok" }, { name: "x".repeat(81) }],
      }),
    );
    expect(await countItems(t, orderId)).toBe(0);
  });
});

describe("copyToDesign copies name / number / letter only, skips existing keys, lands items as Needs size, returns accurate counts", () => {
  it("copies named items, skips keys already on the target, and lands them unsized", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designIds } = await seedWorld(t, [
      "Home",
      "Away",
    ]);
    const [home, away] = designIds;
    const base = Date.now() - ONE_DAY;

    // Source (home): a fan item with a size/qty/submitter, a captain item with
    // a letter, a duplicate of an away key, an unnamed item, and a removed one.
    await insertFanItem(t, orderId, home, {
      name: "Riley Park",
      number: "7",
      size: "L",
      qty: 2,
      createdAt: base,
    });
    await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: home,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "M",
      qty: 1,
    });
    await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: home,
      name: "Kim",
      number: "9",
      size: "S",
      qty: 1,
    });
    await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: home,
      number: "33",
      size: "XL",
      qty: 1,
    });
    const removedSource = await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: home,
      name: "Removed Person",
      number: "50",
      qty: 1,
    });
    await captain.as.mutation(api.orderItems.remove, { itemId: removedSource });

    // Target (away) already has Kim #9, typed differently.
    await captain.as.mutation(api.orderItems.add, {
      orderId,
      designId: away,
      name: "  kim ",
      number: "9",
      size: "M",
      qty: 1,
    });

    const result = await captain.as.mutation(api.orderItems.copyToDesign, {
      orderId,
      sourceDesignId: home,
      targetDesignId: away,
    });
    expect(result).toEqual({ copied: 2, skipped: 1 });

    const list = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    const awayItems = list.designs.find((d) => d.designId === away)!.items;
    expect(awayItems).toHaveLength(3);
    const riley = awayItems.find((i) => i.name === "Riley Park")!;
    const jordan = awayItems.find((i) => i.name === "Jordan Lee")!;
    expect(riley).toBeDefined();
    expect(jordan).toBeDefined();

    expect(riley.number).toBe("7");
    expect(riley.size).toBeUndefined();
    expect(riley.qty).toBe(1);
    expect(riley.source).toBe("captain");
    expect(riley.submitterName).toBeUndefined();
    expect(riley.submitterEmail).toBeUndefined();
    expect(jordan.designation).toBe("C");
    expect(jordan.size).toBeUndefined();

    expect(awayItems.some((i) => i.name === "Removed Person")).toBe(false);
    expect(awayItems.some((i) => i.number === "33" && !i.name)).toBe(false);

    const awaySummary = list.designs.find((d) => d.designId === away)!.summary;
    expect(awaySummary.needsSize).toBe(2);
    expect(awaySummary.itemCount).toBe(1);

    // Running it again copies nothing: it means "make sure they're on that kit".
    const again = await captain.as.mutation(api.orderItems.copyToDesign, {
      orderId,
      sourceDesignId: home,
      targetDesignId: away,
    });
    expect(again).toEqual({ copied: 0, skipped: 3 });
  });

  it("rejects copying a design onto itself or from a design not on the order", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const stranger = await seedOrder(t, captain.userId, ["Elsewhere"]);
    await expectUserError(() =>
      captain.as.mutation(api.orderItems.copyToDesign, {
        orderId,
        sourceDesignId: designId,
        targetDesignId: designId,
      }),
    );
    await expectUserError(() =>
      captain.as.mutation(api.orderItems.copyToDesign, {
        orderId,
        sourceDesignId: stranger.designIds[0],
        targetDesignId: designId,
      }),
    );
  });
});

describe("affectedByDesignRemoval: submitters + qty of live items on that design", () => {
  it("names each submitter with their summed qty, ignoring removed items and other designs", async () => {
    const t = convexTest(schema, modules);
    const { captain, admin, orderId, designIds } = await seedWorld(t, [
      "Home",
      "Away",
    ]);
    const [home, away] = designIds;
    await insertFanItem(t, orderId, home, {
      submitterName: "Ana",
      submitterEmail: "ana@example.com",
      qty: 2,
    });
    await insertFanItem(t, orderId, home, {
      name: "Ana Two",
      submitterName: "Ana",
      submitterEmail: "ana@example.com",
      qty: 1,
    });
    await insertFanItem(t, orderId, home, {
      submitterName: "Ben",
      submitterEmail: "ben@example.com",
      qty: 1,
    });
    const gone = await insertFanItem(t, orderId, home, {
      submitterName: "Gone",
      submitterEmail: "gone@example.com",
      qty: 5,
    });
    await t.run((ctx) => ctx.db.patch(gone, { removedAt: Date.now() }));
    await insertFanItem(t, orderId, away, {
      submitterName: "Cy",
      submitterEmail: "cy@example.com",
    });

    for (const who of [captain, admin]) {
      const affected = await who.as.query(
        api.orderItems.affectedByDesignRemoval,
        { orderId, designId: home },
      );
      const submitters = [...affected.submitters].sort((a, b) =>
        a.email.localeCompare(b.email),
      );
      expect(submitters).toEqual([
        expect.objectContaining({ name: "Ana", email: "ana@example.com", qty: 3 }),
        expect.objectContaining({ name: "Ben", email: "ben@example.com", qty: 1 }),
      ]);
    }
  });
});

describe("No function accepts isAdmin, a user id, source, submitterName, submitterEmail or customAnswers", () => {
  // Reads each exported function's arg validator (the JSON Convex itself
  // exports) and walks every nested object, so a forbidden field hidden in
  // `addMany`'s row shape is caught too.
  type ValidatorJson = {
    type: string;
    value?: unknown;
    tableName?: string;
  };
  const FORBIDDEN = [
    "isAdmin",
    "source",
    "submitterName",
    "submitterEmail",
    "customAnswers",
  ];

  function walk(
    node: ValidatorJson,
    path: string,
    out: { fields: string[]; userIds: string[] },
  ) {
    if (node.type === "id" && node.tableName === "users") out.userIds.push(path);
    if (node.type === "object" && node.value && typeof node.value === "object") {
      for (const [key, field] of Object.entries(
        node.value as Record<string, { fieldType: ValidatorJson }>,
      )) {
        out.fields.push(key);
        walk(field.fieldType, `${path}.${key}`, out);
      }
    }
    if (node.type === "array" && node.value)
      walk(node.value as ValidatorJson, `${path}[]`, out);
    if (node.type === "union" && Array.isArray(node.value))
      for (const member of node.value as ValidatorJson[])
        walk(member, path, out);
  }

  it("exposes the eight API functions the issue names, none taking identity args", async () => {
    const mod = (await import("./orderItems")) as Record<
      string,
      { exportArgs?: () => string; isPublic?: boolean }
    >;
    const publicFns = Object.entries(mod).filter(
      ([, fn]) => typeof fn?.exportArgs === "function" && fn.isPublic,
    );
    expect(publicFns.map(([name]) => name).sort()).toEqual(
      expect.arrayContaining([
        "add",
        "addMany",
        "affectedByDesignRemoval",
        "copyToDesign",
        "listForOrder",
        "remove",
        "restore",
        "update",
      ]),
    );

    for (const [name, fn] of publicFns) {
      const out = { fields: [] as string[], userIds: [] as string[] };
      walk(JSON.parse(fn.exportArgs!()) as ValidatorJson, name, out);
      expect(
        out.fields.filter((f) => FORBIDDEN.includes(f)),
        `${name} forbidden args`,
      ).toEqual([]);
      expect(out.userIds, `${name} user-id args`).toEqual([]);
    }
  });
});
