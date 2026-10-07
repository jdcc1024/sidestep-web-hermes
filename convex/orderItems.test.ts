// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// L-01 acceptance tests (initiative 0004, phase 1), narrowed by R2-02 to what
// `convex/orderItems.ts` still holds: the `orderItems` table and the two
// reads over it, `listForOrder` (players since R2-02) and
// `affectedByDesignRemoval`, with their ownership and lock rules. The flat
// item mutations were deleted in R2-02; the player API that replaced them is
// covered by `rosterEntries.r201.test.ts`.
// Spec: backlog/L-01-order-items-table-and-api.md,
// backlog/R2-02-order-list-players.md, docs/architecture/0004-roster-sizes.md.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

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
// `seedRun` is called: the list works without an order form.
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
  opts: { namesMode?: "open" | "fixed" } = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("orderForms", {
      orderId,
      captainId,
      sizeOptions: ["S", "M", "L"],
      namesMode: opts.namesMode ?? "open",
      customQuestions: [{ id: "q1", label: "Pronouns?" }],
      deadline: Date.now() + 7 * ONE_DAY,
      status: "open",
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

// A player-submitted ("fan") size line under its own player, inserted
// directly: only the public form may set submitter fields, so tests can't
// create one through the captain API.
async function insertFanItem(
  t: T,
  orderId: Id<"orders">,
  designId: Id<"designs">,
  overrides: Partial<{
    name: string;
    number: string;
    size: string;
    qty: number;
    submitterName: string;
    submitterEmail: string;
    customAnswers: Record<string, string>;
    orderFormId: Id<"orderForms">;
  }> = {},
) {
  const now = Date.now();
  const line = {
    name: "Riley Park",
    number: "7",
    size: "M",
    qty: 1,
    submitterName: "Riley",
    submitterEmail: "riley@example.com",
    customAnswers: { q1: "they/them" },
    ...overrides,
  };
  return t.run(async (ctx) => {
    const rosterEntryId = await ctx.db.insert("rosterEntries", {
      orderId,
      designId,
      name: line.name,
      number: line.number,
      source: "fan",
      createdAt: now,
      updatedAt: now,
    });
    return ctx.db.insert("orderItems", {
      orderId,
      designId,
      rosterEntryId,
      source: "fan",
      ...line,
      createdAt: now,
      updatedAt: now,
    });
  });
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
  const data: unknown = (caught as ConvexError<string>).data;
  expect(typeof data).toBe("string");
  return data as string;
}

// ── criteria ───────────────────────────────────────────────────────────────

describe("orderItems table and indexes exist (§7.1)", () => {
  it("accepts a full item and reads it back through by_order and by_submitterEmail", async () => {
    const t = convexTest(schema, modules);
    const { orderId, designId } = await seedWorld(t);
    const id = await insertFanItem(t, orderId, designId);

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
});

describe("A captain can add a player to an order with no run and it appears in listForOrder as one row with its sizes (§7.3, R2-02)", () => {
  it("adds 'Sidestep #72' in S, M×3, XL with no run and lists one player", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);

    const { entryId } = await captain.as.mutation(api.rosterEntries.add, {
      orderId,
      designId,
      name: "Sidestep",
      number: "72",
      sizes: [
        { size: "S", qty: 1 },
        { size: "M", qty: 3 },
        { size: "XL", qty: 1 },
      ],
    });

    const list = await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    });
    expect(list).not.toBeNull();
    expect(list!.form).toBeNull();
    expect(list!.locked).toBe(false);
    expect(list!.canEdit).toBe(true);
    expect(list!.designs).toHaveLength(1);
    const home = list!.designs[0];
    expect(home.designId).toBe(designId);
    expect(home.title).toBe("Home");
    expect(home.players).toHaveLength(1);
    expect(home.players[0]).toMatchObject({
      entryId,
      name: "Sidestep",
      number: "72",
      sizes: [
        { size: "S", qty: 1 },
        { size: "M", qty: 3 },
        { size: "XL", qty: 1 },
      ],
      jerseyCount: 5,
      needsSizes: false,
    });
    // The CSV's flattened lines carry the player's values.
    expect(home.items).toHaveLength(3);
    expect(home.items.every((i) => i.name === "Sidestep")).toBe(true);
    expect(home.summary).toMatchObject({
      jerseyCount: 5,
      playerCount: 1,
      needsSizes: 0,
    });
    expect(list!.summary.jerseyCount).toBe(5);
  });

  it("counts a named player with no sizes as needing sizes, adding no jerseys", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    await captain.as.mutation(api.rosterEntries.add, {
      orderId,
      designId,
      name: "Jordan Lee",
      number: "4",
      sizes: [],
    });
    const list = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(list.designs[0].players[0].needsSizes).toBe(true);
    expect(list.summary).toMatchObject({
      jerseyCount: 0,
      playerCount: 1,
      needsSizes: 1,
    });
  });

  it("hides a removed player and its sizes", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId, designId } = await seedWorld(t);
    const { entryId } = await captain.as.mutation(api.rosterEntries.add, {
      orderId,
      designId,
      name: "Sidestep",
      number: "72",
      sizes: [{ size: "M", qty: 2 }],
    });
    await captain.as.mutation(api.rosterEntries.remove, { entryId });
    const list = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(list.designs[0].players).toEqual([]);
    expect(list.designs[0].items).toEqual([]);
    expect(list.summary.jerseyCount).toBe(0);
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

describe("Captain of order X cannot read order Y's list (each rejected)", () => {
  async function seedTwoCaptains(t: T) {
    const x = await seedUser(t, "captain_x");
    const y = await seedUser(t, "captain_y");
    await seedOrder(t, x.userId, ["X Home"]);
    const orderY = await seedOrder(t, y.userId, ["Y Home", "Y Away"]);
    await insertFanItem(t, orderY.orderId, orderY.designIds[0]);
    return { x, orderY };
  }

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
});

describe("listForOrder returns canEdit: false, locked: true to a captain on a locked order and canEdit: true to an admin", () => {
  it("reports the lock and edit rights per caller", async () => {
    const t = convexTest(schema, modules);
    const { captain, admin, orderId, designId } = await seedWorld(t);
    const orderFormId = await seedRun(t, orderId, captain.userId, {
      namesMode: "fixed",
    });
    await confirmOrderSize(t, orderId);
    await insertFanItem(t, orderId, designId, { orderFormId });

    const asCaptain = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(asCaptain.locked).toBe(true);
    expect(asCaptain.canEdit).toBe(false);
    expect(asCaptain.form).toEqual({ orderFormId, namesMode: "fixed" });

    const asAdmin = (await admin.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(asAdmin.locked).toBe(true);
    expect(asAdmin.canEdit).toBe(true);
    expect(asAdmin.designs[0].players).toHaveLength(1);
  });

  it("reports canEdit: true, locked: false to the captain of an unlocked order with a form", async () => {
    const t = convexTest(schema, modules);
    const { captain, orderId } = await seedWorld(t);
    const orderFormId = await seedRun(t, orderId, captain.userId);

    const list = (await captain.as.query(api.orderItems.listForOrder, {
      orderId,
    }))!;
    expect(list.locked).toBe(false);
    expect(list.canEdit).toBe(true);
    expect(list.form).toEqual({ orderFormId, namesMode: "open" });
  });

  it("shows the captain and admin each line's submitter email and answers", async () => {
    const t = convexTest(schema, modules);
    const { captain, admin, orderId, designId } = await seedWorld(t);
    await insertFanItem(t, orderId, designId);

    for (const who of [captain, admin]) {
      const list = (await who.as.query(api.orderItems.listForOrder, {
        orderId,
      }))!;
      expect(list.designs[0].players[0].lines[0]).toMatchObject({
        submitterName: "Riley",
        submitterEmail: "riley@example.com",
        customAnswers: { q1: "they/them" },
      });
    }
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

describe("orderItems.ts holds only the two reads since R2-02; neither takes identity args", () => {
  // Reads each exported function's arg validator (the JSON Convex itself
  // exports) and walks every nested object.
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

  it("exposes listForOrder and affectedByDesignRemoval only, none taking identity args", async () => {
    const mod = (await import("./orderItems")) as Record<
      string,
      { exportArgs?: () => string; isPublic?: boolean }
    >;
    const publicFns = Object.entries(mod).filter(
      ([, fn]) => typeof fn?.exportArgs === "function" && fn.isPublic,
    );
    expect(publicFns.map(([name]) => name).sort()).toEqual([
      "affectedByDesignRemoval",
      "listForOrder",
    ]);

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
