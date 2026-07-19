// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

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

function validRunArgs(orderId: Id<"orders">) {
  return {
    orderId,
    sizeOptions: ["S", "M", "L"],
    namesMode: "open" as const,
    fixedRoster: [] as { name: string; number?: string }[],
    customQuestions: [],
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
    expect(row?.sizeOptions).toEqual(["S", "M", "L"]);
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

describe("jerseyRuns.submitResponse", () => {
  it("records a fan's response on an open run", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    // submitResponse is public — no identity required.
    const responseId = await t.mutation(api.jerseyRuns.submitResponse, {
      jerseyRunId: runId,
      respondentName: "Sam",
      respondentEmail: "SAM@Example.com",
      size: "M",
      customAnswers: {},
    });

    const row = await t.run((ctx) => ctx.db.get(responseId));
    expect(row).toMatchObject({
      jerseyRunId: runId,
      respondentName: "Sam",
      // Email is normalized to lowercase before persistence.
      respondentEmail: "sam@example.com",
      size: "M",
    });
  });

  it("rejects a response with a size that's not in the run's sizeOptions", async () => {
    const t = convexTest(schema, modules);
    const { orderId, asUser } = await seedCaptainWithOrder(t);
    const runId = await asUser.mutation(
      api.jerseyRuns.create,
      validRunArgs(orderId),
    );

    await expect(
      t.mutation(api.jerseyRuns.submitResponse, {
        jerseyRunId: runId,
        respondentName: "Sam",
        respondentEmail: "sam@example.com",
        size: "4XL",
        customAnswers: {},
      }),
    ).rejects.toThrow(/Pick a size/);
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
        brief: "b",
        fileIds: [],
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
        brief: "h",
        fileIds: [],
        createdAt: now,
        updatedAt: now,
      });
      const awayId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Away",
        brief: "a",
        fileIds: [],
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
