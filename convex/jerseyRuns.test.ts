// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
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

// "Start collecting" (M-05) takes a deadline and nothing else: sizes are a
// fixed catalog, names mode is switched afterwards on the order page, and
// custom questions are edited from /run/setup once the run exists.
function validRunArgs(orderId: Id<"orders">) {
  return {
    orderId,
    deadline: Date.now() + 7 * ONE_DAY,
  };
}

describe("jerseyRuns.create", () => {
  it("creates an open run for the captain's order", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);

    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const row = await t.run((ctx) => ctx.db.get(runId));
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

    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const row = await t.run((ctx) => ctx.db.get(runId));
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
      asUser.mutation(api.jerseyRuns.create, {
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
    const { runId, designId } = await t.run(async (ctx) => {
      const designId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("h"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(orderId, { designIds: [designId] });
      const runId = await ctx.db.insert("jerseyRuns", {
        orderId,
        captainId: userId,
        sizeOptions: ["S", "M", "L"],
        namesMode: "open",
        customQuestions: [],
        deadline: Date.now() + 7 * ONE_DAY,
        status: "open",
        createdAt: Date.now(),
      });
      return { runId, designId };
    });

    const submit = (size: string) =>
      t.mutation(api.orderEntries.submitOrder, {
        jerseyRunId: runId,
        submitterName: "Pat",
        submitterEmail: "pat@example.com",
        customAnswers: {},
        lines: [{ designId, size, qty: 1 }],
      });

    await expect(submit("4XL")).rejects.toThrow();
    await expect(submit("M")).resolves.toBeTruthy();
    expect((await t.run((ctx) => ctx.db.get(runId)))?.sizeOptions).toEqual([
      "S",
      "M",
      "L",
    ]);
  });

  it("rejects creating a second run for the same order", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    await asUser.mutation(api.jerseyRuns.create, validRunArgs(orderId));

    await expect(
      asUser.mutation(api.jerseyRuns.create, validRunArgs(orderId)),
    ).rejects.toThrow(/already has a jersey run/);
  });

  // O-05: run creation is lazy — saving an order does not eagerly create a
  // run. The order detail page hands off to Run Setup, and only the first
  // "collect" (jerseyRuns.create) brings a run into existence. This locks in
  // that contract: no run exists between order creation and the first collect.
  it("creates no run on order save; first collect creates exactly one", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);

    // Order exists, but no run has been set up yet.
    expect(await asUser.query(api.jerseyRuns.getByOrder, { orderId })).toBeNull();

    // First collect lazily creates the single run for the order.
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const run = await asUser.query(api.jerseyRuns.getByOrder, { orderId });
    expect(run?._id).toBe(runId);
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
      asOther.mutation(api.jerseyRuns.create, validRunArgs(orderId)),
    ).rejects.toThrow(/don't have access/);
  });
});

// M-05: `namesMode` used to be write-once at create. The control now lives on
// the order page beside the designs it affects, so it has to switch freely in
// both directions — open→fixed promotes fan-typed names into the picker list,
// fixed→open only loosens a constraint. Neither loses data.
describe("jerseyRuns.setNamesMode", () => {
  it("switches open → fixed and back again", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    await asUser.mutation(api.jerseyRuns.setNamesMode, {
      jerseyRunId: runId,
      namesMode: "fixed",
    });
    expect((await t.run((ctx) => ctx.db.get(runId)))?.namesMode).toBe("fixed");

    await asUser.mutation(api.jerseyRuns.setNamesMode, {
      jerseyRunId: runId,
      namesMode: "open",
    });
    expect((await t.run((ctx) => ctx.db.get(runId)))?.namesMode).toBe("open");
  });

  // The end-to-end half of the switch: what the public form actually reads.
  // A name a fan typed is already a rosterEntry, so flipping to fixed turns
  // it into a slot on the picker list without any migration.
  it("promotes fan-typed names into the public picker list after a switch to fixed", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
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
      jerseyRunId: runId,
      submitterName: "Pat",
      submitterEmail: "pat@example.com",
      customAnswers: {},
      lines: [{ designId, name: "Gretzky", number: "99", size: "M", qty: 1 }],
    });

    const before = await t.query(api.jerseyRuns.getPublic, {
      jerseyRunId: runId,
    });
    expect(before!.run.namesMode).toBe("open");

    await asUser.mutation(api.jerseyRuns.setNamesMode, {
      jerseyRunId: runId,
      namesMode: "fixed",
    });

    const after = await t.query(api.jerseyRuns.getPublic, {
      jerseyRunId: runId,
    });
    expect(after!.run.namesMode).toBe("fixed");
    expect(after!.designs[0].roster).toEqual([
      { _id: expect.anything(), name: "Gretzky", number: "99" },
    ]);
  });

  it("rejects a switch on a locked run", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    await expect(
      asUser.mutation(api.jerseyRuns.setNamesMode, {
        jerseyRunId: runId,
        namesMode: "fixed",
      }),
    ).rejects.toThrow(/locked/i);
  });

  it("rejects a switch from someone who doesn't own the order", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const { asUser: asStranger } = await seedCaptainWithOrder(
      t,
      "user_stranger_clerk",
    );

    await expect(
      asStranger.mutation(api.jerseyRuns.setNamesMode, {
        jerseyRunId: runId,
        namesMode: "fixed",
      }),
    ).rejects.toThrow(/access/i);
  });
});

// The other half of M-05's split: creation takes only a deadline, so the
// deadline and the custom questions are edited afterwards from /run/setup.
describe("jerseyRuns.updateSettings", () => {
  const questions = [{ id: "q1", label: "How should we deliver?" }];

  it("updates the deadline and the custom questions", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    const deadline = Date.now() + 30 * ONE_DAY;
    await asUser.mutation(api.jerseyRuns.updateSettings, {
      jerseyRunId: runId,
      deadline,
      customQuestions: questions,
    });

    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.deadline).toBe(deadline);
    expect(run?.customQuestions).toEqual(questions);
  });

  it("trims question labels and rejects a blank one", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const deadline = Date.now() + 30 * ONE_DAY;

    await asUser.mutation(api.jerseyRuns.updateSettings, {
      jerseyRunId: runId,
      deadline,
      customQuestions: [{ id: "q1", label: "  Allergies?  " }],
    });
    expect((await t.run((ctx) => ctx.db.get(runId)))?.customQuestions).toEqual([
      { id: "q1", label: "Allergies?" },
    ]);

    await expect(
      asUser.mutation(api.jerseyRuns.updateSettings, {
        jerseyRunId: runId,
        deadline,
        customQuestions: [{ id: "q1", label: "   " }],
      }),
    ).rejects.toThrow(/label/i);
  });

  it("rejects a deadline in the past", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    await expect(
      asUser.mutation(api.jerseyRuns.updateSettings, {
        jerseyRunId: runId,
        deadline: Date.now() - 1000,
        customQuestions: [],
      }),
    ).rejects.toThrow(/future/i);
  });

  it("rejects edits to a locked run and from a non-owner", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const { asUser: asStranger } = await seedCaptainWithOrder(
      t,
      "user_stranger_clerk",
    );
    const deadline = Date.now() + 30 * ONE_DAY;

    await expect(
      asStranger.mutation(api.jerseyRuns.updateSettings, {
        jerseyRunId: runId,
        deadline,
        customQuestions: [],
      }),
    ).rejects.toThrow(/access/i);

    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });
    await expect(
      asUser.mutation(api.jerseyRuns.updateSettings, {
        jerseyRunId: runId,
        deadline,
        customQuestions: [],
      }),
    ).rejects.toThrow(/locked/i);
  });
});

describe("jerseyRuns.closeRunByAdmin", () => {
  it("schedules a close when an admin calls it on an open run", async () => {
    const t = convexTest(schema, modules);
    // Captain creates the run.
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
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

    const result = await asAdmin.mutation(api.jerseyRuns.closeRunByAdmin, {
      jerseyRunId: runId,
    });
    expect(result).toEqual({ alreadyClosed: false });
  });

  it("rejects closeRunByAdmin when caller is not an admin", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    // Same captain (non-admin) tries to close.
    await expect(
      asUser.mutation(api.jerseyRuns.closeRunByAdmin, { jerseyRunId: runId }),
    ).rejects.toThrow(/Admin access required/);
  });
});

describe("jerseyRuns.lock / unlock (R-06)", () => {
  async function seedAdmin(t: ReturnType<typeof convexTest>) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "user_admin_clerk",
        email: "admin@example.com",
        name: "Admin",
        isAdmin: true,
        createdAt: Date.now(),
      }),
    );
    return t.withIdentity({
      subject: "user_admin_clerk",
      email: "admin@example.com",
      name: "Admin",
    });
  }

  it("captain locks an open run: status becomes locked and a count snapshot is stored", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    const designId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("b"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));
    await t.run((ctx) =>
      ctx.db.insert("orderEntries", {
        runId,
        designId,
        size: "M",
        qty: 3,
        source: "captain",
        submitterName: "Sam",
        submitterEmail: "sam@example.com",
        createdAt: Date.now(),
      }),
    );

    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("locked");
    expect(run?.lockSnapshot?.total).toBe(3);
    expect(run?.lockSnapshot?.byDesign).toEqual([
      { designId, title: "Home", total: 3 },
    ]);
    expect(run?.lockSnapshot?.lockedAt).toBeTypeOf("number");
  });

  it("freezes exactly the live count: lockSnapshot total/byDesign equals a prior countsByRun (A-08)", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    // Two designs so the per-design rollup has something to split across.
    const [homeId, awayId] = await t.run(async (ctx) => {
      const home = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home",
        blocks: overviewBlocks("home"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const away = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Away",
        blocks: overviewBlocks("away"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(orderId, { designIds: [home, away] });
      return [home, away];
    });
    await t.run(async (ctx) => {
      for (const [designId, qty] of [
        [homeId, 2],
        [homeId, 3],
        [awayId, 4],
      ] as const) {
        await ctx.db.insert("orderEntries", {
          runId,
          designId,
          size: "M",
          qty,
          source: "captain",
          submitterName: "Sam",
          submitterEmail: "sam@example.com",
          createdAt: Date.now(),
        });
      }
    });

    // The number the captain sees live, right before locking.
    const live = await asUser.query(api.orderEntries.countsByRun, { runId });

    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });
    const run = await t.run((ctx) => ctx.db.get(runId));

    // One source of arithmetic, so the frozen basis is the live count exactly.
    expect(run?.lockSnapshot?.total).toBe(live.total);
    expect(run?.lockSnapshot?.byDesign).toEqual(live.byDesign);
  });

  it("admin can lock a captain's run", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const asAdmin = await seedAdmin(t);

    await asAdmin.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("locked");
  });

  it("rejects locking from a stranger (not the captain, not an admin)", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const { asUser: asStranger } = await seedCaptainWithOrder(
      t,
      "user_stranger_clerk",
    );

    await expect(
      asStranger.mutation(api.jerseyRuns.lock, { jerseyRunId: runId }),
    ).rejects.toThrow(/access/i);
  });

  it("rejects locking an already-locked run", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    await expect(
      asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId }),
    ).rejects.toThrow(/already locked/i);
  });

  it("a past-deadline run can still be locked explicitly (materializes the snapshot)", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    await t.run((ctx) =>
      ctx.db.patch(runId, { deadline: Date.now() - 1000 }),
    );

    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("locked");
    expect(run?.lockSnapshot).toBeTruthy();
  });

  it("admin unlocks a still-pre-deadline locked run back to open", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });
    const asAdmin = await seedAdmin(t);

    await asAdmin.mutation(api.jerseyRuns.unlock, { jerseyRunId: runId });
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("open");
    expect(run?.lockSnapshot).toBeUndefined();
  });

  it("admin unlocks a past-deadline locked run to closed, not open (so it doesn't instantly re-lock)", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    await t.run((ctx) =>
      ctx.db.patch(runId, {
        status: "locked",
        deadline: Date.now() - 1000,
        lockSnapshot: { lockedAt: Date.now(), total: 0, byDesign: [] },
      }),
    );
    const asAdmin = await seedAdmin(t);

    await asAdmin.mutation(api.jerseyRuns.unlock, { jerseyRunId: runId });
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.status).toBe("closed");
  });

  it("captain can unlock their own run while the deadline hasn't passed", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    await asUser.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    await asUser.mutation(api.jerseyRuns.unlock, { jerseyRunId: runId });
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("open");
  });

  it("rejects a captain unlocking after the deadline has passed — admin only", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    await t.run((ctx) =>
      ctx.db.patch(runId, {
        status: "locked",
        deadline: Date.now() - 1000,
        lockSnapshot: { lockedAt: Date.now(), total: 0, byDesign: [] },
      }),
    );

    await expect(
      asUser.mutation(api.jerseyRuns.unlock, { jerseyRunId: runId }),
    ).rejects.toThrow(/deadline/i);
  });

  it("rejects unlocking a run that isn't locked", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    await expect(
      asUser.mutation(api.jerseyRuns.unlock, { jerseyRunId: runId }),
    ).rejects.toThrow(/not locked/i);
  });
});

describe("jerseyRuns.getPublic", () => {
  it("returns the order's designs with seeded roster slots for the form", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { runId, homeId, awayId } = await t.run(async (ctx) => {
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
      const runId = await ctx.db.insert("jerseyRuns", {
        orderId,
        captainId: userId,
        sizeOptions: ["M", "L"],
        namesMode: "fixed",
        customQuestions: [],
        deadline: now + 7 * ONE_DAY,
        status: "open",
        createdAt: now,
      });
      await ctx.db.insert("rosterEntries", {
        runId,
        orderId,
        designId: homeId,
        name: "Gretzky",
        number: "99",
        source: "captain",
        createdAt: now,
      });
      return { runId, homeId, awayId };
    });

    const data = await t.query(api.jerseyRuns.getPublic, { jerseyRunId: runId });
    expect(data).not.toBeNull();
    expect(data!.teamName).toBe("Wildcats");
    expect(data!.designs.map((d) => d.title)).toEqual(["Home", "Away"]);
    const home = data!.designs.find((d) => d._id === homeId);
    expect(home!.roster).toEqual([
      { _id: expect.anything(), name: "Gretzky", number: "99" },
    ]);
    const away = data!.designs.find((d) => d._id === awayId);
    expect(away!.roster).toHaveLength(0);
  });
});

describe("jerseyRuns.listOrderEntries (R-07)", () => {
  it("returns the run's order entries joined with design title and slot name/number, newest first", async () => {
    const t = convexTest(schema, modules);
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
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
    const rosterId = await t.run((ctx) =>
      ctx.db.insert("rosterEntries", {
        runId,
        orderId,
        designId,
        name: "Gretzky",
        number: "99",
        source: "captain",
        createdAt: now,
      }),
    );
    // A named fan line attached to the slot…
    await t.run((ctx) =>
      ctx.db.insert("orderEntries", {
        runId,
        designId,
        rosterEntryId: rosterId,
        size: "L",
        qty: 2,
        source: "fan",
        submitterName: "Sam",
        submitterEmail: "sam@example.com",
        createdAt: now,
      }),
    );
    // …and a later blank/bulk line with no slot.
    await t.run((ctx) =>
      ctx.db.insert("orderEntries", {
        runId,
        designId,
        size: "M",
        qty: 3,
        source: "captain",
        submitterName: "Cap",
        submitterEmail: "captain@example.com",
        createdAt: now + 1,
      }),
    );

    const data = await asUser.query(api.jerseyRuns.listOrderEntries, {
      jerseyRunId: runId,
    });
    expect(data).not.toBeNull();
    expect(data!.entries).toHaveLength(2);
    // Newest first: the blank captain line leads and carries no name/number.
    expect(data!.entries[0]).toMatchObject({
      designTitle: "Home",
      size: "M",
      qty: 3,
    });
    expect(data!.entries[0].name).toBeUndefined();
    expect(data!.entries[0].number).toBeUndefined();
    const gretzky = data!.entries.find((e) => e.name === "Gretzky");
    expect(gretzky).toMatchObject({
      number: "99",
      designTitle: "Home",
      size: "L",
      qty: 2,
    });
  });

  it("rejects a caller who is neither the captain nor an admin", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );
    const { asUser: asStranger } = await seedCaptainWithOrder(
      t,
      "user_stranger_clerk",
    );

    await expect(
      asStranger.query(api.jerseyRuns.listOrderEntries, { jerseyRunId: runId }),
    ).rejects.toThrow(/access/i);
  });
});

describe("jerseyRuns.listMyResponses (R-07)", () => {
  it("returns only the signed-in user's own order entries, joined with run + team", async () => {
    const t = convexTest(schema, modules);
    // seedCaptainWithOrder signs in as captain@example.com.
    const { userId, orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
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

    await t.run((ctx) =>
      ctx.db.insert("orderEntries", {
        runId,
        designId,
        size: "M",
        qty: 1,
        source: "fan",
        submitterName: "Cap",
        submitterEmail: "captain@example.com",
        createdAt: Date.now(),
      }),
    );
    // A different fan's entry on the same run — must not leak into my list.
    await t.run((ctx) =>
      ctx.db.insert("orderEntries", {
        runId,
        designId,
        size: "L",
        qty: 1,
        source: "fan",
        submitterName: "Other",
        submitterEmail: "other@example.com",
        createdAt: Date.now(),
      }),
    );

    const mine = await asUser.query(api.jerseyRuns.listMyResponses, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].teamName).toBe("Falcons");
    expect(mine[0].entry).toMatchObject({ size: "M", designTitle: "Home" });
  });

  it("returns [] for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.jerseyRuns.listMyResponses, {})).toEqual([]);
  });
});
