// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;

// Seeds a captain, two designs they own (Home + Away), an order linking
// both, and a run on the order — the chain the multi-design public form
// (R-02) submits against. `namesMode`/`customQuestions` are overridable so
// the same helper covers open, fixed, and custom-question runs.
async function seedRun(
  t: ReturnType<typeof convexTest>,
  opts: {
    namesMode?: "open" | "fixed";
    customQuestions?: { id: string; label: string }[];
    status?: "open" | "closed" | "locked";
    deadlineOffset?: number;
  } = {},
) {
  const now = Date.now();
  const { userId, homeId, awayId, orderId, runId } = await t.run(
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
        brief: "home kit",
        createdAt: now,
        updatedAt: now,
      });
      const awayId = await ctx.db.insert("designs", {
        ownerId: userId,
        title: "Away",
        brief: "away kit",
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
        internalStages: [{ name: "Inquiry", completedAt: now }],
        createdAt: now,
        updatedAt: now,
      });
      const runId = await ctx.db.insert("jerseyRuns", {
        orderId,
        captainId: userId,
        sizeOptions: ["S", "M", "L", "XL"],
        namesMode: opts.namesMode ?? "open",
        customQuestions: opts.customQuestions ?? [],
        deadline: now + (opts.deadlineOffset ?? 7 * ONE_DAY),
        status: opts.status ?? "open",
        createdAt: now,
      });
      return { userId, homeId, awayId, orderId, runId };
    },
  );
  return {
    userId,
    homeId,
    awayId,
    orderId,
    runId,
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

describe("orderEntries.submitOrder", () => {
  it("creates one order entry per line across designs, grouped by submitter", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId, awayId } = await seedRun(t);

    const result = await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      ...fan,
      customAnswers: {},
      lines: [
        { designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 },
        { designId: awayId, name: "Luongo", number: "1", size: "M", qty: 1 },
        { designId: awayId, name: "Sosa", number: "25", size: "XL", qty: 1 },
      ],
    });

    expect(result.created).toBe(3);

    const entries = await t.run((ctx) =>
      ctx.db
        .query("orderEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect(),
    );
    expect(entries).toHaveLength(3);
    // All three group back to the one submitter by email.
    expect(new Set(entries.map((e) => e.submitterEmail))).toEqual(
      new Set(["pat@example.com"]),
    );
    expect(entries.every((e) => e.source === "fan")).toBe(true);
    // Each line minted its own roster slot.
    expect(
      entries.every((e) => e.rosterEntryId != null),
    ).toBe(true);
  });

  it("groups a returning same-email submission with the first", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 }],
    });
    // Second session, same email typed with different casing.
    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      submitterName: "Pat Fan",
      submitterEmail: "PAT@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, name: "Howe", number: "9", size: "M", qty: 1 }],
    });

    const entries = await t.run((ctx) =>
      ctx.db
        .query("orderEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect(),
    );
    expect(entries).toHaveLength(2);
    // Normalized to one lowercase email — both join the same group.
    expect(new Set(entries.map((e) => e.submitterEmail))).toEqual(
      new Set(["pat@example.com"]),
    );
  });

  it("attaches to an existing captain-seeded slot instead of duplicating it", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId, asCaptain } = await seedRun(t);
    const slotId = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId: homeId,
      name: "Gretzky",
      number: "99",
    });

    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      ...fan,
      customAnswers: {},
      // Different casing/whitespace — still the same slot.
      lines: [{ designId: homeId, name: "  gretzky ", number: "99", size: "L", qty: 1 }],
    });

    const roster = await t.run((ctx) =>
      ctx.db
        .query("rosterEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect(),
    );
    expect(roster).toHaveLength(1); // no duplicate slot
    const entry = await t.run((ctx) =>
      ctx.db
        .query("orderEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .first(),
    );
    expect(entry?.rosterEntryId).toBe(slotId);
  });

  it("reuses one new slot for two lines with the same name+number", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      ...fan,
      customAnswers: {},
      lines: [
        { designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 },
        { designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 },
      ],
    });

    const roster = await t.run((ctx) =>
      ctx.db
        .query("rosterEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect(),
    );
    expect(roster).toHaveLength(1);
  });

  it("flags an open-mode collision when a different fan matches an existing slot", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t, { namesMode: "open" });

    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      submitterName: "Pat",
      submitterEmail: "pat@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 }],
    });
    const second = await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      submitterName: "Sam",
      submitterEmail: "sam@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "M", qty: 1 }],
    });

    expect(second.collisions).toBe(1);

    // And the captain's roster view surfaces the collision on that slot.
    const { asCaptain } = await seedRunCaptainHandle(t);
    const view = await asCaptain.query(api.rosterEntries.listForRun, { runId });
    const slot = view?.designs
      .flatMap((d) => d.entries)
      .find((e) => e.name === "Gretzky");
    expect(slot?.collision).toBe(true);
  });

  it("does not flag a collision in fixed mode", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId, asCaptain } = await seedRun(t, { namesMode: "fixed" });
    const slotId = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId: homeId,
      name: "Gretzky",
      number: "99",
    });

    // Two different fans pick the same seeded slot — expected in fixed mode.
    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      submitterName: "Pat",
      submitterEmail: "pat@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, rosterEntryId: slotId, size: "L", qty: 1 }],
    });
    const second = await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      submitterName: "Sam",
      submitterEmail: "sam@example.com",
      customAnswers: {},
      lines: [{ designId: homeId, rosterEntryId: slotId, size: "M", qty: 1 }],
    });
    expect(second.collisions).toBe(0);
  });

  it("creates a blank/bulk line with no roster entry", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, size: "M", qty: 5 }],
    });

    const entry = await t.run((ctx) =>
      ctx.db
        .query("orderEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .first(),
    );
    expect(entry?.rosterEntryId).toBeUndefined();
    expect(entry?.qty).toBe(5);
    const roster = await t.run((ctx) =>
      ctx.db
        .query("rosterEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .collect(),
    );
    expect(roster).toHaveLength(0);
  });

  it("stores custom answers for known questions and drops unknown ones", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t, {
      customQuestions: [{ id: "q1", label: "Allergies?" }],
    });

    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      ...fan,
      customAnswers: { q1: "None", bogus: "ignored" },
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 }],
    });

    const entry = await t.run((ctx) =>
      ctx.db
        .query("orderEntries")
        .withIndex("by_run", (q) => q.eq("runId", runId))
        .first(),
    );
    expect(entry?.customAnswers).toEqual({ q1: "None" });
  });

  it("writes nothing to the legacy jerseyRunResponses table", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t);

    await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: runId,
      ...fan,
      customAnswers: {},
      lines: [{ designId: homeId, name: "Gretzky", number: "99", size: "L", qty: 1 }],
    });

    const legacy = await t.run((ctx) =>
      ctx.db.query("jerseyRunResponses").collect(),
    );
    expect(legacy).toHaveLength(0);
  });

  it("rejects a submission to a closed run", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t, { status: "closed" });
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        jerseyRunId: runId,
        ...fan,
        customAnswers: {},
        lines: [{ designId: homeId, name: "X", size: "M", qty: 1 }],
      }),
    ).rejects.toThrow(/closed/i);
  });

  it("rejects a submission once the deadline has passed", async () => {
    const t = convexTest(schema, modules);
    const { runId, homeId } = await seedRun(t, { deadlineOffset: -ONE_DAY });
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        jerseyRunId: runId,
        ...fan,
        customAnswers: {},
        lines: [{ designId: homeId, name: "X", size: "M", qty: 1 }],
      }),
    ).rejects.toThrow();
  });

  it("rejects a line on a design that isn't part of the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, userId } = await seedRun(t);
    const strayDesign = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Stray",
        brief: "x",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        jerseyRunId: runId,
        ...fan,
        customAnswers: {},
        lines: [{ designId: strayDesign, name: "X", size: "M", qty: 1 }],
      }),
    ).rejects.toThrow(/isn't part of this order/i);
  });

  it("rejects an empty submission", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedRun(t);
    await expect(
      t.mutation(api.orderEntries.submitOrder, {
        jerseyRunId: runId,
        ...fan,
        customAnswers: {},
        lines: [],
      }),
    ).rejects.toThrow(/at least one/i);
  });
});

// listForRun is the captain surface; the collision test above acts as the
// captain. This helper just re-derives that identity handle for the run
// already seeded under the fixed "captain_clerk" subject.
async function seedRunCaptainHandle(t: ReturnType<typeof convexTest>) {
  return {
    asCaptain: t.withIdentity({
      subject: "captain_clerk",
      email: "captain@example.com",
      name: "Cap",
    }),
  };
}
