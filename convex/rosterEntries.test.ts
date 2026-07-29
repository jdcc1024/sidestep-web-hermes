// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";
import { ROSTER_PASTE_MAX_ROWS } from "../lib/rosterEntry/paste";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;

// Seeds a captain, a design they own, an order linking it, and a run on
// the order — the full chain a roster entry needs. Returns the ids plus
// an identity handle for acting as the captain.
async function seedRun(
  t: ReturnType<typeof convexTest>,
  subject = "captain_clerk",
  opts: { isAdmin?: boolean } = {},
) {
  const now = Date.now();
  const { userId, designId, orderId, runId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: subject,
      email: "captain@example.com",
      name: "Cap",
      isAdmin: opts.isAdmin ?? false,
      createdAt: now,
    });
    const designId = await ctx.db.insert("designs", {
      ownerId: userId,
      title: "Home",
      blocks: overviewBlocks("home kit"),
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId: userId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [designId],
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    const runId = await ctx.db.insert("jerseyRuns", {
      orderId,
      captainId: userId,
      sizeOptions: ["S", "M", "L"],
      namesMode: "open",
      customQuestions: [],
      deadline: now + 7 * ONE_DAY,
      status: "open",
      createdAt: now,
    });
    return { userId, designId, orderId, runId };
  });
  return {
    userId,
    designId,
    orderId,
    runId,
    asCaptain: t.withIdentity({
      subject,
      email: "captain@example.com",
      name: "Cap",
    }),
  };
}

// Links a second design to the order — what per-design bucketing (M-01) and
// the mirror (M-04) both need before there's anything to bucket or copy.
async function addDesign(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  orderId: Id<"orders">,
  title: string,
) {
  return t.run(async (ctx) => {
    const designId = await ctx.db.insert("designs", {
      ownerId: userId,
      title,
      blocks: overviewBlocks(title),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const order = await ctx.db.get(orderId);
    await ctx.db.patch(orderId, {
      designIds: [...(order?.designIds ?? []), designId],
    });
    return designId;
  });
}

describe("rosterEntries.create", () => {
  it("creates a captain-seeded slot defaulting to source captain", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });

    const entry = await t.run((ctx) => ctx.db.get(id));
    expect(entry?.name).toBe("Gretzky");
    expect(entry?.number).toBe("99");
    expect(entry?.source).toBe("captain");
    expect(entry?.orderId).toBeTruthy();
  });

  it("omits the number when blank", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Bo",
      number: "",
    });

    const entry = await t.run((ctx) => ctx.db.get(id));
    expect(entry?.number).toBeUndefined();
  });

  it("rejects a blank name", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    await expect(
      asCaptain.mutation(api.rosterEntries.create, {
        runId,
        designId,
        name: "   ",
      }),
    ).rejects.toThrow();
  });

  it("rejects a design not on the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, asCaptain, userId } = await seedRun(t);
    const strayDesignId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Stray",
        blocks: overviewBlocks("x"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asCaptain.mutation(api.rosterEntries.create, {
        runId,
        designId: strayDesignId,
        name: "Ghost",
      }),
    ).rejects.toThrow(/isn't part of this order/);
  });

  it("rejects a caller who doesn't own the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId } = await seedRun(t);
    const stranger = t.withIdentity({
      subject: "stranger_clerk",
      email: "stranger@example.com",
      name: "Stranger",
    });
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "stranger_clerk",
        email: "stranger@example.com",
        name: "Stranger",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );

    await expect(
      stranger.mutation(api.rosterEntries.create, {
        runId,
        designId,
        name: "Nope",
      }),
    ).rejects.toThrow();
  });
});

// M-03: the bulk-paste commit. Same gates as `create`, applied once for the
// batch — the parser has already decided what the rows are, so the mutation's
// job is to refuse anything the single-add path would have refused.
describe("rosterEntries.createMany", () => {
  it("creates every player in one call, as captain-sourced slots", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    const ids = await asCaptain.mutation(api.rosterEntries.createMany, {
      runId,
      designId,
      players: [
        { name: "Gretzky", number: "99" },
        { name: "Lemieux", number: "66" },
        { name: "Bo" },
      ],
    });

    expect(ids).toHaveLength(3);
    const entries = await asCaptain.query(api.rosterEntries.listByRun, {
      runId,
    });
    expect(entries.map((e) => e.name).sort()).toEqual([
      "Bo",
      "Gretzky",
      "Lemieux",
    ]);
    expect(entries.every((e) => e.source === "captain")).toBe(true);
    expect(entries.find((e) => e.name === "Bo")?.number).toBeUndefined();
  });

  it("rejects an empty batch rather than silently doing nothing", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    await expect(
      asCaptain.mutation(api.rosterEntries.createMany, {
        runId,
        designId,
        players: [],
      }),
    ).rejects.toThrow(/no players/i);
  });

  it("rejects a batch past the bound rather than inserting it", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const players = Array.from(
      { length: ROSTER_PASTE_MAX_ROWS + 1 },
      (_, i) => ({ name: `Player ${i}` }),
    );

    await expect(
      asCaptain.mutation(api.rosterEntries.createMany, {
        runId,
        designId,
        players,
      }),
    ).rejects.toThrow(/too many/i);
    const entries = await asCaptain.query(api.rosterEntries.listByRun, {
      runId,
    });
    expect(entries).toEqual([]);
  });

  it("rejects the whole batch when one row breaks the name rules", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);

    await expect(
      asCaptain.mutation(api.rosterEntries.createMany, {
        runId,
        designId,
        players: [{ name: "Gretzky", number: "99" }, { name: "  " }],
      }),
    ).rejects.toThrow();

    const entries = await asCaptain.query(api.rosterEntries.listByRun, {
      runId,
    });
    expect(entries).toEqual([]);
  });

  it("rejects a locked run", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await asCaptain.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    await expect(
      asCaptain.mutation(api.rosterEntries.createMany, {
        runId,
        designId,
        players: [{ name: "Too late" }],
      }),
    ).rejects.toThrow(/locked/i);
  });

  it("rejects a design not on the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, userId, asCaptain } = await seedRun(t);
    const strayDesignId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Stray",
        blocks: overviewBlocks("x"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asCaptain.mutation(api.rosterEntries.createMany, {
        runId,
        designId: strayDesignId,
        players: [{ name: "Ghost" }],
      }),
    ).rejects.toThrow(/isn't part of this order/);
  });

  it("rejects a caller who doesn't own the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId } = await seedRun(t);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "stranger_clerk",
        email: "stranger@example.com",
        name: "Stranger",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );
    const stranger = t.withIdentity({
      subject: "stranger_clerk",
      email: "stranger@example.com",
      name: "Stranger",
    });

    await expect(
      stranger.mutation(api.rosterEntries.createMany, {
        runId,
        designId,
        players: [{ name: "Nope" }],
      }),
    ).rejects.toThrow();
  });
});

// M-04: a home and an away kit carry the same fifteen people, so one design
// seeds the other in a single action. Slots only, additive, silent skip.
describe("rosterEntries.copyToDesign", () => {
  // A source design carrying two players, plus the empty target it copies
  // onto — the shape every test here starts from.
  async function seedMirror(t: ReturnType<typeof convexTest>) {
    const seeded = await seedRun(t);
    const { runId, designId: sourceDesignId, userId, orderId, asCaptain } = seeded;
    const targetDesignId = await addDesign(t, userId, orderId, "Away");
    for (const player of [
      { name: "Gretzky", number: "99" },
      { name: "Bo" },
    ]) {
      await asCaptain.mutation(api.rosterEntries.create, {
        runId,
        designId: sourceDesignId,
        ...player,
      });
    }
    return { ...seeded, sourceDesignId, targetDesignId };
  }

  // The target's slots, oldest first — what the copy is judged on.
  async function slotsOn(
    t: ReturnType<typeof convexTest>,
    designId: Id<"designs">,
  ) {
    return t.run(async (ctx) => {
      const all = await ctx.db.query("rosterEntries").collect();
      return all
        .filter((e) => e.designId === designId)
        .sort((a, b) => a.createdAt - b.createdAt);
    });
  }

  it("copies the source's slots onto the target, name and number only", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, targetDesignId, asCaptain } =
      await seedMirror(t);

    const result = await asCaptain.mutation(api.rosterEntries.copyToDesign, {
      runId,
      sourceDesignId,
      targetDesignId,
    });

    expect(result).toEqual({ copied: 2, skipped: 0 });
    const slots = await slotsOn(t, targetDesignId);
    expect(slots.map((s) => [s.name, s.number])).toEqual([
      ["Gretzky", "99"],
      ["Bo", undefined],
    ]);
    // Slots only: nothing about a copy fabricates a jersey.
    const entries = await t.run((ctx) =>
      ctx.db.query("orderEntries").collect(),
    );
    expect(entries).toEqual([]);
  });

  it("lands every copied slot as captain-sourced and unfilled, whatever the source was", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, targetDesignId, asCaptain } =
      await seedMirror(t);
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId: sourceDesignId,
      name: "Fan Slot",
      source: "fan",
    });

    await asCaptain.mutation(api.rosterEntries.copyToDesign, {
      runId,
      sourceDesignId,
      targetDesignId,
    });

    const slots = await slotsOn(t, targetDesignId);
    expect(slots.every((s) => s.source === "captain")).toBe(true);
    // "Unfilled" is derived from having no order entries, and the copy
    // creates none — so the read has to agree.
    const roster = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    const target = roster?.designs.find((d) => d.designId === targetDesignId);
    expect(target?.entries.every((e) => !e.filled && e.total === 0)).toBe(true);
  });

  it("copies nothing on a re-run and reports every slot as already there", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, targetDesignId, asCaptain } =
      await seedMirror(t);
    const args = { runId, sourceDesignId, targetDesignId };

    await asCaptain.mutation(api.rosterEntries.copyToDesign, args);
    const second = await asCaptain.mutation(api.rosterEntries.copyToDesign, args);

    expect(second).toEqual({ copied: 0, skipped: 2 });
    expect(await slotsOn(t, targetDesignId)).toHaveLength(2);
  });

  it("skips only the players the target already has", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, targetDesignId, asCaptain } =
      await seedMirror(t);
    // Same player, differently typed — the skip normalizes case and space.
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId: targetDesignId,
      name: " gretzky ",
      number: "99",
    });

    const result = await asCaptain.mutation(api.rosterEntries.copyToDesign, {
      runId,
      sourceDesignId,
      targetDesignId,
    });

    expect(result).toEqual({ copied: 1, skipped: 1 });
    const slots = await slotsOn(t, targetDesignId);
    expect(slots.map((s) => s.name)).toEqual(["gretzky", "Bo"]);
  });

  it("leaves an existing filled slot and its jerseys byte-for-byte alone", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, targetDesignId, asCaptain } =
      await seedMirror(t);
    const filledId = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId: targetDesignId,
      name: "Gretzky",
      number: "99",
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId: targetDesignId,
      rosterEntryId: filledId,
      size: "L",
      qty: 2,
      source: "fan",
      submitterName: "Fan",
      submitterEmail: "fan@example.com",
    });
    const before = await t.run((ctx) => ctx.db.get(filledId));
    const entriesBefore = await t.run((ctx) =>
      ctx.db.query("orderEntries").collect(),
    );

    await asCaptain.mutation(api.rosterEntries.copyToDesign, {
      runId,
      sourceDesignId,
      targetDesignId,
    });

    expect(await t.run((ctx) => ctx.db.get(filledId))).toEqual(before);
    expect(await t.run((ctx) => ctx.db.query("orderEntries").collect())).toEqual(
      entriesBefore,
    );
  });

  it("reports an empty source honestly rather than erroring", async () => {
    const t = convexTest(schema, modules);
    const { runId, userId, orderId, designId, asCaptain } = await seedRun(t);
    const emptyDesignId = await addDesign(t, userId, orderId, "Away");

    const result = await asCaptain.mutation(api.rosterEntries.copyToDesign, {
      runId,
      sourceDesignId: emptyDesignId,
      targetDesignId: designId,
    });

    expect(result).toEqual({ copied: 0, skipped: 0 });
  });

  it("rejects copying a design onto itself", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, asCaptain } = await seedMirror(t);

    await expect(
      asCaptain.mutation(api.rosterEntries.copyToDesign, {
        runId,
        sourceDesignId,
        targetDesignId: sourceDesignId,
      }),
    ).rejects.toThrow(/different design/i);
  });

  it("rejects a locked run", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, targetDesignId, asCaptain } =
      await seedMirror(t);
    await asCaptain.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    await expect(
      asCaptain.mutation(api.rosterEntries.copyToDesign, {
        runId,
        sourceDesignId,
        targetDesignId,
      }),
    ).rejects.toThrow(/locked/i);
  });

  it("rejects a source or a target design that isn't on the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, userId, sourceDesignId, targetDesignId, asCaptain } =
      await seedMirror(t);
    const strayDesignId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Stray",
        blocks: overviewBlocks("x"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asCaptain.mutation(api.rosterEntries.copyToDesign, {
        runId,
        sourceDesignId: strayDesignId,
        targetDesignId,
      }),
    ).rejects.toThrow(/isn't part of this order/);
    await expect(
      asCaptain.mutation(api.rosterEntries.copyToDesign, {
        runId,
        sourceDesignId,
        targetDesignId: strayDesignId,
      }),
    ).rejects.toThrow(/isn't part of this order/);
  });

  it("rejects a caller who doesn't own the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, sourceDesignId, targetDesignId } = await seedMirror(t);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "stranger_clerk",
        email: "stranger@example.com",
        name: "Stranger",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );
    const stranger = t.withIdentity({
      subject: "stranger_clerk",
      email: "stranger@example.com",
      name: "Stranger",
    });

    await expect(
      stranger.mutation(api.rosterEntries.copyToDesign, {
        runId,
        sourceDesignId,
        targetDesignId,
      }),
    ).rejects.toThrow();
  });
});

describe("rosterEntries.listByRun", () => {
  it("returns the run's entries for the captain", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });

    const entries = await asCaptain.query(api.rosterEntries.listByRun, {
      runId,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Gretzky");
  });

  it("returns [] for a missing run", async () => {
    const t = convexTest(schema, modules);
    const { asCaptain, runId } = await seedRun(t);
    // Delete the run, then query the now-dangling id.
    await t.run((ctx) => ctx.db.delete(runId as Id<"jerseyRuns">));
    const entries = await asCaptain.query(api.rosterEntries.listByRun, {
      runId,
    });
    expect(entries).toEqual([]);
  });
});

describe("rosterEntries.update", () => {
  it("edits the name and number of a slot", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzy",
      number: "9",
    });

    await asCaptain.mutation(api.rosterEntries.update, {
      rosterEntryId: id,
      name: "Gretzky",
      number: "99",
    });

    const entry = await t.run((ctx) => ctx.db.get(id));
    expect(entry?.name).toBe("Gretzky");
    expect(entry?.number).toBe("99");
  });

  it("clears the number when edited to blank", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Bo",
      number: "5",
    });

    await asCaptain.mutation(api.rosterEntries.update, {
      rosterEntryId: id,
      name: "Bo",
      number: "",
    });

    const entry = await t.run((ctx) => ctx.db.get(id));
    expect(entry?.number).toBeUndefined();
  });

  it("rejects an edit from someone who doesn't own the order", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
    });
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "stranger_clerk",
        email: "stranger@example.com",
        name: "Stranger",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );
    const stranger = t.withIdentity({
      subject: "stranger_clerk",
      email: "stranger@example.com",
      name: "Stranger",
    });

    await expect(
      stranger.mutation(api.rosterEntries.update, {
        rosterEntryId: id,
        name: "Hacked",
      }),
    ).rejects.toThrow();
  });
});

describe("rosterEntries.remove", () => {
  it("removes an unfilled slot", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Spare",
    });

    await asCaptain.mutation(api.rosterEntries.remove, { rosterEntryId: id });

    const entry = await t.run((ctx) => ctx.db.get(id));
    expect(entry).toBeNull();
  });

  it("refuses to remove a slot that has orders on it", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      rosterEntryId: id,
      size: "M",
      qty: 1,
      source: "fan",
      submitterName: "Fan",
      submitterEmail: "fan@example.com",
    });

    await expect(
      asCaptain.mutation(api.rosterEntries.remove, { rosterEntryId: id }),
    ).rejects.toThrow(/orders on it/);
  });
});

describe("rosterEntries freeze guard when the run is locked (R-06)", () => {
  it("rejects create, update, and remove on a locked run", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const id = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Spare",
    });
    await asCaptain.mutation(api.jerseyRuns.lock, { jerseyRunId: runId });

    await expect(
      asCaptain.mutation(api.rosterEntries.create, {
        runId,
        designId,
        name: "Too late",
      }),
    ).rejects.toThrow(/locked/i);

    await expect(
      asCaptain.mutation(api.rosterEntries.update, {
        rosterEntryId: id,
        name: "Renamed",
      }),
    ).rejects.toThrow(/locked/i);

    await expect(
      asCaptain.mutation(api.rosterEntries.remove, { rosterEntryId: id }),
    ).rejects.toThrow(/locked/i);
  });

  it("rejects create on a run whose deadline has lazily passed, even without an explicit lock", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await t.run((ctx) => ctx.db.patch(runId, { deadline: Date.now() - 1000 }));

    await expect(
      asCaptain.mutation(api.rosterEntries.create, {
        runId,
        designId,
        name: "Too late",
      }),
    ).rejects.toThrow(/locked/i);
  });
});

describe("rosterEntries.listForRun", () => {
  it("groups slots by design and marks a seeded slot not yet filled", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });

    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    expect(result?.designs).toHaveLength(1);
    expect(result?.designs[0].designId).toBe(designId);
    expect(result?.designs[0].entries).toHaveLength(1);
    expect(result?.designs[0].entries[0].filled).toBe(false);
  });

  it("marks a slot filled once an order entry references it", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const slotId = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      rosterEntryId: slotId,
      size: "L",
      qty: 1,
      source: "fan",
      submitterName: "Fan",
      submitterEmail: "fan@example.com",
    });

    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    expect(result?.designs[0].entries[0].filled).toBe(true);
  });

  it("does not let a blank/bulk order entry fill an unrelated slot", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });
    // A blank/bulk line on the same design — no rosterEntryId — must not
    // flip the seeded slot to filled.
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "L",
      qty: 3,
      source: "captain",
      submitterName: "Cap",
      submitterEmail: "captain@example.com",
    });

    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    expect(result?.designs[0].entries[0].filled).toBe(false);
  });
});

// M-01: the same read now carries what the design card needs to render the
// roster — each slot's ordered sizes, and the design's unattached blank
// lines — so the card and the roster editor read one source instead of two.
describe("rosterEntries.listForRun — sizes and blank lines (M-01)", () => {
  it("carries each slot's ordered sizes in canonical order, summed by qty", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    const slotId = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });
    // Ordered out of canonical order, and twice in the same size.
    for (const [size, qty] of [
      ["L", 1],
      ["S", 2],
      ["L", 1],
    ] as const) {
      await asCaptain.mutation(api.orderEntries.create, {
        runId,
        designId,
        rosterEntryId: slotId,
        size,
        qty,
        source: "fan",
        submitterName: "Fan",
        submitterEmail: "fan@example.com",
      });
    }

    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    const slot = result?.designs[0].entries[0];
    expect(slot?.sizes).toEqual([
      { size: "S", qty: 2 },
      { size: "L", qty: 2 },
    ]);
    expect(slot?.total).toBe(4);
  });

  it("gives a seeded slot nobody ordered for no sizes and a total of 0", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Bure",
      number: "10",
    });

    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    expect(result?.designs[0].entries[0]).toMatchObject({
      filled: false,
      sizes: [],
      total: 0,
    });
  });

  it("returns the design's blank/bulk lines summed by size", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, asCaptain } = await seedRun(t);
    for (const [size, qty] of [
      ["M", 3],
      ["M", 1],
      ["S", 2],
    ] as const) {
      await asCaptain.mutation(api.orderEntries.create, {
        runId,
        designId,
        size,
        qty,
        source: "captain",
        submitterName: "Cap",
        submitterEmail: "captain@example.com",
      });
    }

    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    expect(result?.designs[0].blankSizes).toEqual([
      { size: "S", qty: 2 },
      { size: "M", qty: 4 },
    ]);
  });

  it("buckets blank lines under their own design", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, userId, asCaptain } = await seedRun(t);
    const awayId = await addDesign(t, userId, orderId, "Away");
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "M",
      qty: 2,
      source: "captain",
      submitterName: "Cap",
      submitterEmail: "captain@example.com",
    });

    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });
    const away = result?.designs.find((d) => d.designId === awayId);
    expect(away?.blankSizes).toEqual([]);
    expect(
      result?.designs.find((d) => d.designId === designId)?.blankSizes,
    ).toEqual([{ size: "M", qty: 2 }]);
  });

  it("reconciles per design with orderEntries.countsByRun", async () => {
    const t = convexTest(schema, modules);
    const { runId, designId, orderId, userId, asCaptain } = await seedRun(t);
    const awayId = await addDesign(t, userId, orderId, "Away");
    const slotId = await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Gretzky",
      number: "99",
    });
    // Seeded but unordered — must contribute nothing to either number.
    await asCaptain.mutation(api.rosterEntries.create, {
      runId,
      designId,
      name: "Bure",
      number: "10",
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      rosterEntryId: slotId,
      size: "L",
      qty: 2,
      source: "fan",
      submitterName: "Fan",
      submitterEmail: "fan@example.com",
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId,
      size: "S",
      qty: 3,
      source: "captain",
      submitterName: "Cap",
      submitterEmail: "captain@example.com",
    });
    await asCaptain.mutation(api.orderEntries.create, {
      runId,
      designId: awayId,
      size: "M",
      qty: 1,
      source: "captain",
      submitterName: "Cap",
      submitterEmail: "captain@example.com",
    });

    const counts = await asCaptain.query(api.orderEntries.countsByRun, {
      runId,
    });
    const result = await asCaptain.query(api.rosterEntries.listForRun, {
      runId,
    });

    for (const design of result!.designs) {
      const fromRead =
        design.entries.reduce((sum, e) => sum + e.total, 0) +
        design.blankSizes.reduce((sum, s) => sum + s.qty, 0);
      expect(fromRead).toBe(
        counts.byDesign.find((d) => d.designId === design.designId)?.total,
      );
    }
    expect(counts.total).toBe(6);
  });

  it("still refuses a caller who doesn't own the order", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedRun(t);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: "stranger_clerk",
        email: "stranger@example.com",
        name: "Stranger",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    );
    const stranger = t.withIdentity({
      subject: "stranger_clerk",
      email: "stranger@example.com",
      name: "Stranger",
    });

    await expect(
      stranger.query(api.rosterEntries.listForRun, { runId }),
    ).rejects.toThrow(/access/i);
  });
});
