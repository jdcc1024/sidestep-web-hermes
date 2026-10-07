// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

async function seedCaptainWithOrder(
  t: ReturnType<typeof convexTest>,
  subject = "user_captain_clerk",
  opts: { isAdmin?: boolean } = {},
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email: "captain@example.com",
      name: "Cap",
      isAdmin: opts.isAdmin ?? false,
      createdAt: Date.now(),
    }),
  );
  const orderId = await t.run((ctx) =>
    ctx.db.insert("orders", {
      captainId: userId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [],
      internalStages: [{ name: "Inquiry", completedAt: Date.now() }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  return {
    userId,
    orderId,
    asUser: t.withIdentity({
      subject,
      email: "captain@example.com",
      name: "Cap",
    }),
  };
}

const ONE_DAY = 24 * 60 * 60 * 1000;

// JCC checks "Order Size Confirmed", which locks the list and, with it, the
// form's settings (L-06). Written directly, not through the confirm gate.
async function confirmOrderSize(
  t: ReturnType<typeof convexTest>,
  orderId: Id<"orders">,
) {
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

// An order item written straight into the table, under a player.
// Defaults to a sized fan jersey with no name.
async function insertItem(
  t: ReturnType<typeof convexTest>,
  orderId: Id<"orders">,
  designId: Id<"designs">,
  fields: Partial<{
    name: string;
    number: string;
    designation: "C" | "A";
    size: string;
    qty: number;
    source: "captain" | "fan";
    submitterName: string;
    submitterEmail: string;
    customAnswers: Record<string, string>;
    orderFormId: Id<"orderForms">;
    rosterEntryId: Id<"rosterEntries">;
    removedAt: number;
    createdAt: number;
  }> = {},
): Promise<Id<"orderItems"> | null> {
  // R2-03: an item is a size line under a player. Without `rosterEntryId`, the
  // values given make a player of their own; with no size, the player is all
  // there is (it needs sizes) and there is no item.
  const createdAt = fields.createdAt ?? Date.now();
  const { name, number, designation, size, rosterEntryId, ...line } = fields;
  const source = fields.source ?? "fan";
  return t.run(async (ctx) => {
    const entryId =
      rosterEntryId ??
      (await ctx.db.insert("rosterEntries", {
        orderId,
        designId,
        name,
        number,
        designation,
        source,
        createdAt,
        updatedAt: createdAt,
      }));
    if (size === undefined) return null;
    return ctx.db.insert("orderItems", {
      orderId,
      rosterEntryId: entryId,
      size,
      qty: 1,
      ...line,
      source,
      createdAt,
      updatedAt: createdAt,
    });
  });
}

// A player written straight into `rosterEntries` (R2-02: the picker and the
// captain's counts read players). Sizes are items under it, via `insertItem`
// with `rosterEntryId`; with none, a named player needs sizes.
async function insertPlayer(
  t: ReturnType<typeof convexTest>,
  orderId: Id<"orders">,
  designId: Id<"designs">,
  fields: Partial<{
    name: string;
    number: string;
    designation: "C" | "A";
    source: "captain" | "fan";
    removedAt: number;
    createdAt: number;
  }> = {},
): Promise<Id<"rosterEntries">> {
  const createdAt = fields.createdAt ?? Date.now();
  return t.run((ctx) =>
    ctx.db.insert("rosterEntries", {
      orderId,
      designId,
      source: "captain",
      ...fields,
      createdAt,
      updatedAt: createdAt,
    }),
  );
}

// "Start collecting" (M-05) takes a deadline and nothing else: sizes are a
// fixed catalog, names mode is switched afterwards on the order page, and
// custom questions are edited from /run/setup once the run exists.
function validRunArgs(orderId: Id<"orders">) {
  return {
    orderId,
    deadline: Date.now() + 7 * ONE_DAY,
  };
}

describe("orderForms.create", () => {
  it("creates an open run for the captain's order", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);

    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const row = await t.run((ctx) => ctx.db.get(orderFormId));
    expect(row).toMatchObject({
      orderId,
      captainId: userId,
      status: "open",
      namesMode: "open",
    });
  });

  // M-05: the captain is never asked which sizes to offer — every new run
  // carries the whole catalog, and the public form reads it back as-is.
  it("populates the full 8-size catalog with no size argument", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);

    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const row = await t.run((ctx) => ctx.db.get(orderFormId));
    expect(row?.sizeOptions).toEqual([
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "2XL",
      "3XL",
      "4XL",
    ]);
  });

  it("rejects a sizeOptions argument — sizes are no longer a captain choice", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);

    await expect(
      asUser.mutation(api.orderForms.create, {
        ...validRunArgs(orderId),
        // @ts-expect-error the argument is gone from the mutation's validator
        sizeOptions: ["S"],
      }),
    ).rejects.toThrow();
  });

  // PRD §5: no migration. A run created before the fixed catalog keeps the
  // narrower list it was created with, and submissions are still checked
  // against *its* sizes, not the new catalog.
  it("leaves a pre-existing run's narrower sizeOptions alone", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId } = await seedCaptainWithOrder(t);
    const { orderFormId, designId } = await t.run(async (ctx) => {
      const designId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(orderId, { designIds: [designId] });
      const orderFormId = await ctx.db.insert("orderForms", {
        orderId,
        captainId: userId,
        sizeOptions: ["S", "M", "L"],
        namesMode: "open",
        customQuestions: [],
        deadline: Date.now() + 7 * ONE_DAY,
        status: "open",
        createdAt: Date.now(),
      });
      return { orderFormId, designId };
    });

    const submit = (size: string) =>
      t.mutation(api.orderEntries.submitOrder, {
        orderFormId: orderFormId,
        submitterName: "Pat",
        submitterEmail: "pat@example.com",
        customAnswers: {},
        lines: [{ designId, size, qty: 1 }],
      });

    await expect(submit("4XL")).rejects.toThrow();
    await expect(submit("M")).resolves.toBeTruthy();
    expect((await t.run((ctx) => ctx.db.get(orderFormId)))?.sizeOptions).toEqual([
      "S",
      "M",
      "L",
    ]);
  });

  it("rejects creating a second run for the same order", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    await asUser.mutation(api.orderForms.create, validRunArgs(orderId));

    await expect(
      asUser.mutation(api.orderForms.create, validRunArgs(orderId)),
    ).rejects.toThrow(/already has a jersey run/);
  });

  // O-05: run creation is lazy — saving an order does not eagerly create a
  // run. The order detail page hands off to Run Setup, and only the first
  // "collect" (orderForms.create) brings a run into existence. This locks in
  // that contract: no run exists between order creation and the first collect.
  it("creates no run on order save; first collect creates exactly one", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);

    // Order exists, but no run has been set up yet.
    expect(await asUser.query(api.orderForms.getByOrder, { orderId })).toBeNull();

    // First collect lazily creates the single run for the order.
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const run = await asUser.query(api.orderForms.getByOrder, { orderId });
    expect(run?._id).toBe(orderFormId);
  });

  it("rejects creating a run on someone else's order", async () => {
    const t = convexTest(schema, modules);
    const { orderId } = await seedCaptainWithOrder(t, "user_captain_clerk");
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_other_clerk",
        email: "other@example.com",
        name: "Other",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );
    const asOther = t.withIdentity({
      subject: "user_other_clerk",
      email: "other@example.com",
      name: "Other",
    });

    await expect(
      asOther.mutation(api.orderForms.create, validRunArgs(orderId)),
    ).rejects.toThrow(/don't have access/);
  });
});

// M-05: `namesMode` used to be write-once at create. The control now lives on
// the order page beside the designs it affects, so it has to switch freely in
// both directions — open→fixed promotes fan-typed names into the picker list,
// fixed→open only loosens a constraint. Neither loses data.
describe("orderForms.setNamesMode", () => {
  it("switches open → fixed and back again", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );

    await asUser.mutation(api.orderForms.setNamesMode, {
      orderFormId: orderFormId,
      namesMode: "fixed",
    });
    expect((await t.run((ctx) => ctx.db.get(orderFormId)))?.namesMode).toBe("fixed");

    await asUser.mutation(api.orderForms.setNamesMode, {
      orderFormId: orderFormId,
      namesMode: "open",
    });
    expect((await t.run((ctx) => ctx.db.get(orderFormId)))?.namesMode).toBe("open");
  });

  // The end-to-end half of the switch: what the public form actually reads.
  // A name a fan typed is already a rosterEntry, so flipping to fixed turns
  // it into a slot on the picker list without any migration.
  it("promotes fan-typed names into the public picker list after a switch to fixed", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const designId = await t.run(async (ctx) => {
      const designId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(orderId, { designIds: [designId] });
      return designId;
    });

    // A fan orders under open mode, typing their own name.
    await t.mutation(api.orderEntries.submitOrder, {
      orderFormId: orderFormId,
      submitterName: "Pat",
      submitterEmail: "pat@example.com",
      customAnswers: {},
      lines: [{ designId, name: "Gretzky", number: "99", size: "M", qty: 1 }],
    });

    const before = await t.query(api.orderForms.getPublic, {
      orderFormId: orderFormId,
    });
    expect(before!.run.namesMode).toBe("open");

    await asUser.mutation(api.orderForms.setNamesMode, {
      orderFormId: orderFormId,
      namesMode: "fixed",
    });

    const after = await t.query(api.orderForms.getPublic, {
      orderFormId: orderFormId,
    });
    expect(after!.run.namesMode).toBe("fixed");
    expect(after!.designs[0].roster).toEqual([
      { _id: expect.anything(), name: "Gretzky", number: "99" },
    ]);
  });

  it("rejects a switch once the list is confirmed (L-06)", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    await confirmOrderSize(t, orderId);

    await expect(
      asUser.mutation(api.orderForms.setNamesMode, {
        orderFormId: orderFormId,
        namesMode: "fixed",
      }),
    ).rejects.toThrow(/locked/i);
  });

  it("rejects a switch from someone who doesn't own the order", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const { asUser: asStranger } = await seedCaptainWithOrder(
      t,
      "user_stranger_clerk",
    );

    await expect(
      asStranger.mutation(api.orderForms.setNamesMode, {
        orderFormId: orderFormId,
        namesMode: "fixed",
      }),
    ).rejects.toThrow(/access/i);
  });
});

// The other half of M-05's split: creation takes only a deadline, so the
// deadline and the custom questions are edited afterwards from /run/setup.
describe("orderForms.updateSettings", () => {
  const questions = [{ id: "q1", label: "How should we deliver?" }];

  it("updates the deadline and the custom questions", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );

    const deadline = Date.now() + 30 * ONE_DAY;
    await asUser.mutation(api.orderForms.updateSettings, {
      orderFormId: orderFormId,
      deadline,
      customQuestions: questions,
    });

    const run = await t.run((ctx) => ctx.db.get(orderFormId));
    expect(run?.deadline).toBe(deadline);
    expect(run?.customQuestions).toEqual(questions);
  });

  it("trims question labels and rejects a blank one", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const deadline = Date.now() + 30 * ONE_DAY;

    await asUser.mutation(api.orderForms.updateSettings, {
      orderFormId: orderFormId,
      deadline,
      customQuestions: [{ id: "q1", label: "  Allergies?  " }],
    });
    expect((await t.run((ctx) => ctx.db.get(orderFormId)))?.customQuestions).toEqual([
      { id: "q1", label: "Allergies?" },
    ]);

    await expect(
      asUser.mutation(api.orderForms.updateSettings, {
        orderFormId: orderFormId,
        deadline,
        customQuestions: [{ id: "q1", label: "   " }],
      }),
    ).rejects.toThrow(/label/i);
  });

  it("rejects a deadline in the past", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );

    await expect(
      asUser.mutation(api.orderForms.updateSettings, {
        orderFormId: orderFormId,
        deadline: Date.now() - 1000,
        customQuestions: [],
      }),
    ).rejects.toThrow(/future/i);
  });

  it("rejects edits once the list is confirmed (L-06) and from a non-owner", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const { asUser: asStranger } = await seedCaptainWithOrder(
      t,
      "user_stranger_clerk",
    );
    const deadline = Date.now() + 30 * ONE_DAY;

    await expect(
      asStranger.mutation(api.orderForms.updateSettings, {
        orderFormId: orderFormId,
        deadline,
        customQuestions: [],
      }),
    ).rejects.toThrow(/access/i);

    await confirmOrderSize(t, orderId);
    await expect(
      asUser.mutation(api.orderForms.updateSettings, {
        orderFormId: orderFormId,
        deadline,
        customQuestions: [],
      }),
    ).rejects.toThrow(/locked/i);
  });
});

describe("orderForms.closeFormByAdmin", () => {
  it("schedules a close when an admin calls it on an open run", async () => {
    const t = convexTest(schema, modules);
    // Captain creates the run.
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );

    // Separate admin identity.
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_admin_clerk",
        email: "admin@example.com",
        name: "Admin",
        isAdmin: true,
        createdAt: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({
      subject: "user_admin_clerk",
      email: "admin@example.com",
      name: "Admin",
    });

    const result = await asAdmin.mutation(api.orderForms.closeFormByAdmin, {
      orderFormId: orderFormId,
    });
    expect(result).toEqual({ alreadyClosed: false });
  });

  it("rejects closeFormByAdmin when caller is not an admin", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );

    // Same captain (non-admin) tries to close.
    await expect(
      asUser.mutation(api.orderForms.closeFormByAdmin, { orderFormId: orderFormId }),
    ).rejects.toThrow(/Admin access required/);
  });
});

describe("orderForms.getPublic", () => {
  it("returns the order's designs with seeded roster slots for the form", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { orderFormId, orderId, homeId, awayId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        clerkId: "cap",
        email: "cap@example.com",
        name: "Cap",
        isAdmin: false,
        createdAt: now,
      });
      const homeId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: now,
        updatedAt: now,
      });
      const awayId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Away",
        blocks: overviewBlocks("a"),
        createdAt: now,
        updatedAt: now,
      });
      const orderId = await ctx.db.insert("orders", {
        captainId: userId,
        teamName: "Wildcats",
        sport: "Hockey",
        estimatedQuantity: 10,
        hasOwnDesign: false,
        designIds: [homeId, awayId],
        internalStages: [],
        createdAt: now,
        updatedAt: now,
      });
      const orderFormId = await ctx.db.insert("orderForms", {
        orderId,
        captainId: userId,
        sizeOptions: ["M", "L"],
        namesMode: "fixed",
        customQuestions: [],
        deadline: now + 7 * ONE_DAY,
        status: "open",
        createdAt: now,
      });
      return { orderFormId, orderId, homeId, awayId };
    });
    // R2-02: the picker is the order's live named players (here a captain's
    // player who needs sizes).
    const gretzkyId = await insertPlayer(t, orderId, homeId, {
      name: "Gretzky",
      number: "99",
    });

    const data = await t.query(api.orderForms.getPublic, { orderFormId: orderFormId });
    expect(data).not.toBeNull();
    expect(data!.teamName).toBe("Wildcats");
    expect(data!.designs.map((d) => d.title)).toEqual(["Home", "Away"]);
    const home = data!.designs.find((d) => d._id === homeId);
    expect(home!.roster).toEqual([
      { _id: gretzkyId, name: "Gretzky", number: "99" },
    ]);
    const away = data!.designs.find((d) => d._id === awayId);
    expect(away!.roster).toHaveLength(0);
  });
});

// ─── L-02 (initiative 0004): getPublic reads the order's list (players since R2-02)

// The public chain: captain → Home + Away designs → order → open run.
async function seedPublicRun(
  t: ReturnType<typeof convexTest>,
  namesMode: "open" | "fixed" = "fixed",
) {
  const now = Date.now();
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "cap",
      email: "cap@example.com",
      name: "Cap",
      isAdmin: false,
      createdAt: now,
    });
    const homeId = await ctx.db.insert("designs", {
      ownerId: userId,
      title: "Home",
      blocks: overviewBlocks("h"),
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId: userId,
      teamName: "Wildcats",
      sport: "Hockey",
      estimatedQuantity: 10,
      hasOwnDesign: false,
      designIds: [homeId],
      internalStages: [],
      createdAt: now,
      updatedAt: now,
    });
    const orderFormId = await ctx.db.insert("orderForms", {
      orderId,
      captainId: userId,
      sizeOptions: ["M", "L"],
      namesMode,
      customQuestions: [{ id: "q1", label: "Pickup?" }],
      deadline: now + 7 * ONE_DAY,
      status: "open",
      createdAt: now,
    });
    return { userId, homeId, orderId, orderFormId };
  });
}

describe("getPublic exposes only _id, name, number per picker entry; removed and unnamed players are absent", () => {
  it("returns exactly { _id, name, number } for a named player, with no size, letter, submitter or answers", async () => {
    const t = convexTest(schema, modules);
    const { orderId, homeId, orderFormId } = await seedPublicRun(t);
    const id = await insertPlayer(t, orderId, homeId, {
      name: "Jordan Lee",
      number: "4",
      designation: "C",
    });
    await insertItem(t, orderId, homeId, {
      rosterEntryId: id,
      name: "Jordan Lee",
      number: "4",
      designation: "C",
      size: "M",
      qty: 2,
      submitterName: "Jordan's Mum",
      submitterEmail: "mum@example.com",
      customAnswers: { q1: "Gym" },
      orderFormId,
    });

    const data = await t.query(api.orderForms.getPublic, { orderFormId: orderFormId });
    const roster = data!.designs[0].roster;
    expect(roster).toEqual([{ _id: id, name: "Jordan Lee", number: "4" }]);
    expect(Object.keys(roster[0]).sort()).toEqual(["_id", "name", "number"]);
    expect(JSON.stringify(data)).not.toMatch(/mum@example\.com|Jordan's Mum|Gym/);
  });

  it("leaves out removed players and players with no name", async () => {
    const t = convexTest(schema, modules);
    const { orderId, homeId, orderFormId } = await seedPublicRun(t);
    const kept = await insertPlayer(t, orderId, homeId, {
      name: "Kept",
      number: "1",
    });
    await insertPlayer(t, orderId, homeId, {
      name: "Removed",
      number: "2",
      removedAt: Date.now(),
    });
    // A number-only player, and blank jerseys (neither) with a size.
    await insertPlayer(t, orderId, homeId, { number: "3", source: "fan" });
    const blank = await insertPlayer(t, orderId, homeId, { source: "fan" });
    await insertItem(t, orderId, homeId, { rosterEntryId: blank, size: "L", qty: 4 });

    const data = await t.query(api.orderForms.getPublic, { orderFormId: orderFormId });
    expect(data!.designs[0].roster).toEqual([
      { _id: kept, name: "Kept", number: "1" },
    ]);
  });

  it("lists Lee #4 and Lee #9 as two separate picks (same name, different number)", async () => {
    const t = convexTest(schema, modules);
    const { orderId, homeId, orderFormId } = await seedPublicRun(t);
    const lee4 = await insertPlayer(t, orderId, homeId, {
      name: "Lee",
      number: "4",
      createdAt: 1_000,
    });
    const lee9 = await insertPlayer(t, orderId, homeId, {
      name: "Lee",
      number: "9",
      createdAt: 2_000,
    });

    const data = await t.query(api.orderForms.getPublic, { orderFormId: orderFormId });
    expect(data!.designs[0].roster).toEqual([
      { _id: lee4, name: "Lee", number: "4" },
      { _id: lee9, name: "Lee", number: "9" },
    ]);
  });

  it("offers players the captain added before the form existed, and nobody from another order", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, homeId, orderFormId } = await seedPublicRun(t);
    // No orderFormId: added on the order page before "Make an order form".
    const early = await insertPlayer(t, orderId, homeId, {
      name: "Early",
      number: "7",
      createdAt: 1,
    });
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
    await insertPlayer(t, otherOrderId, homeId, {
      name: "Stranger",
      number: "8",
    });

    const data = await t.query(api.orderForms.getPublic, { orderFormId: orderFormId });
    expect(data!.designs[0].roster).toEqual([
      { _id: early, name: "Early", number: "7" },
    ]);
  });
});

describe("orderForms.listOrderEntries (R-07)", () => {
  it("returns the order's sized items as entries, joined with design title and name/number, newest first (L-02)", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );

    const designId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));

    const now = Date.now();
    // A named fan jersey that filled a captain's player…
    const gretzkyId = await insertItem(t, orderId, designId, {
      name: "Gretzky",
      number: "99",
      designation: "C",
      size: "L",
      qty: 2,
      source: "captain",
      submitterName: "Sam",
      submitterEmail: "sam@example.com",
      customAnswers: { q1: "Gym" },
      orderFormId,
      createdAt: now,
    });
    // …and a later blank/bulk line.
    const blankId = await insertItem(t, orderId, designId, {
      size: "M",
      qty: 3,
      source: "captain",
      createdAt: now + 1,
    });

    const data = await asUser.query(api.orderForms.listOrderEntries, {
      orderFormId: orderFormId,
    });
    expect(data).not.toBeNull();
    expect(data!.entries).toHaveLength(2);
    // Newest first: the blank captain line leads and carries no name/number.
    expect(data!.entries[0]).toMatchObject({
      _id: blankId,
      designTitle: "Home",
      size: "M",
      qty: 3,
    });
    expect(data!.entries[0].name).toBeUndefined();
    expect(data!.entries[0].number).toBeUndefined();
    // `_id` is the item id; name/number/letter come off the item itself.
    expect(data!.entries[1]).toMatchObject({
      _id: gretzkyId,
      name: "Gretzky",
      number: "99",
      designation: "C",
      designId,
      designTitle: "Home",
      size: "L",
      qty: 2,
      source: "captain",
      submitterName: "Sam",
      submitterEmail: "sam@example.com",
      customAnswers: { q1: "Gym" },
    });
  });

  it("excludes removed items, and Needs-size items (an entry is a sized jersey)", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const designId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));
    const live = await insertItem(t, orderId, designId, { size: "M" });
    await insertItem(t, orderId, designId, {
      size: "L",
      qty: 5,
      removedAt: Date.now(),
    });
    await insertItem(t, orderId, designId, { name: "Bure", source: "captain" });

    const data = await asUser.query(api.orderForms.listOrderEntries, {
      orderFormId: orderFormId,
    });
    expect(data!.entries.map((e) => e._id)).toEqual([live]);
  });

  it("rejects a caller who is neither the captain nor an admin", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const { asUser: asStranger } = await seedCaptainWithOrder(
      t,
      "user_stranger_clerk",
    );

    await expect(
      asStranger.query(api.orderForms.listOrderEntries, { orderFormId: orderFormId }),
    ).rejects.toThrow(/access/i);
  });
});

describe("orderForms.listMyResponses (R-07)", () => {
  it("returns only the signed-in user's own items, joined with run + team (L-02)", async () => {
    const t = convexTest(schema, modules);
    // seedCaptainWithOrder signs in as captain@example.com.
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const designId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));

    const mineId = await insertItem(t, orderId, designId, {
      name: "Gretzky",
      number: "99",
      size: "M",
      submitterName: "Cap",
      submitterEmail: "captain@example.com",
      orderFormId,
    });
    // A different fan's item on the same order — must not leak into my list.
    await insertItem(t, orderId, designId, {
      size: "L",
      submitterName: "Other",
      submitterEmail: "other@example.com",
      orderFormId,
    });

    const mine = await asUser.query(api.orderForms.listMyResponses, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].teamName).toBe("Falcons");
    expect(mine[0].run._id).toBe(orderFormId);
    expect(mine[0].entry).toMatchObject({
      _id: mineId,
      size: "M",
      designTitle: "Home",
      name: "Gretzky",
      number: "99",
    });
  });

  it("leaves out an item the captain removed", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const designId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));
    const kept = await insertItem(t, orderId, designId, {
      size: "M",
      submitterName: "Cap",
      submitterEmail: "captain@example.com",
      orderFormId,
    });
    await insertItem(t, orderId, designId, {
      size: "L",
      submitterName: "Cap",
      submitterEmail: "captain@example.com",
      orderFormId,
      removedAt: Date.now(),
    });

    const mine = await asUser.query(api.orderForms.listMyResponses, {});
    expect(mine.map((m) => m.entry._id)).toEqual([kept]);
  });

  it("returns [] for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.orderForms.listMyResponses, {})).toEqual([]);
  });
});

// L-02: the closure email's count is the order's production total, the same
// `summary.jerseyCount` the captain's list shows (players since R2-02).
describe("orderForms._closeForm counts order items (L-02)", () => {
  it("reports responseCount = listForOrder summary.jerseyCount, excluding removed jerseys, removed players and players who need sizes", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const orderFormId = await asUser.mutation(
      api.orderForms.create,
      validRunArgs(orderId),
    );
    const [homeId, awayId] = await t.run(async (ctx) => {
      const ids = [];
      for (const title of ["Home", "Away"])
        ids.push(
          await ctx.db.insert("designs", {
            ownerId: userId,
            title,
            blocks: overviewBlocks(title),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        );
      await ctx.db.patch(orderId, { designIds: ids });
      return ids;
    });
    // Counted: 2 + 3 (one added before the form, with no orderFormId).
    const fanBlank = await insertPlayer(t, orderId, homeId, { source: "fan" });
    await insertItem(t, orderId, homeId, {
      rosterEntryId: fanBlank,
      size: "M",
      qty: 2,
      orderFormId,
    });
    const captainBlank = await insertPlayer(t, orderId, awayId);
    await insertItem(t, orderId, awayId, {
      rosterEntryId: captainBlank,
      size: "L",
      qty: 3,
      source: "captain",
    });
    // Not counted: a removed jersey, a removed player's jersey, and a player
    // who needs sizes.
    await insertItem(t, orderId, homeId, {
      rosterEntryId: fanBlank,
      size: "XL",
      qty: 4,
      removedAt: Date.now(),
    });
    const gone = await insertPlayer(t, orderId, homeId, {
      name: "Gone",
      number: "0",
      removedAt: Date.now(),
    });
    await insertItem(t, orderId, homeId, {
      rosterEntryId: gone,
      name: "Gone",
      number: "0",
      size: "S",
      qty: 6,
      source: "captain",
    });
    await insertPlayer(t, orderId, homeId, { name: "Bure" });

    const live = await asUser.query(api.orderItems.listForOrder, { orderId });
    const closed = await t.mutation(internal.orderForms._closeForm, {
      orderFormId: orderFormId,
    });

    expect(closed?.responseCount).toBe(5);
    expect(closed?.responseCount).toBe(live!.summary.jerseyCount);
  });
});
