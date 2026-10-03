// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// L-06 acceptance tests (initiative 0004, phase 1): the list locks when JCC
// confirms the order size, the deadline only closes the form, admin edits the
// same list, and confirming is refused while items still need a size.
// Spec: backlog/L-06-lock-on-confirm-admin-list-retire-legacy.md (Q1 = A,
// Q2 = A), docs/architecture/0004-order-items.md "Must answer 4",
// docs/ux/0004-order-items.md §7.2, §7.8, §8.9, §8.10.
// One `describe` per acceptance criterion, named after it. Written before the
// build: every test fails only because the lock is still "the run is locked".
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { ConvexError } from "convex/values";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";
import { INTERNAL_STAGES } from "../lib/orderStages";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;
const CONFIRMED = "Order Size Confirmed";

type T = TestConvex<typeof schema>;

// ── seeding ────────────────────────────────────────────────────────────────

async function seedUser(
  t: T,
  subject: string,
  opts: { isAdmin?: boolean; name?: string } = {},
) {
  const email = `${subject}@example.com`;
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

// A captain with an order on two designs, an admin, and (optionally) an order
// form. `deadline` defaults to a week out; pass a past one for "form closed".
async function seedWorld(
  t: T,
  opts: { run?: false | { deadline?: number; status?: "open" | "closed" } } = {},
) {
  const captain = await seedUser(t, "captain_x", { name: "Cap X" });
  const admin = await seedUser(t, "admin", { isAdmin: true, name: "Admin" });
  const now = Date.now();
  const { orderId, designIds } = await t.run(async (ctx) => {
    const designIds: Id<"designs">[] = [];
    for (const title of ["Home", "Away"]) {
      designIds.push(
        await ctx.db.insert("designs", {
          ownerId: captain.userId,
          title,
          blocks: overviewBlocks(`${title} kit`),
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const orderId = await ctx.db.insert("orders", {
      captainId: captain.userId,
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
  let runId: Id<"jerseyRuns"> | null = null;
  if (opts.run !== false) {
    const run = opts.run ?? {};
    runId = await t.run((ctx) =>
      ctx.db.insert("jerseyRuns", {
        orderId,
        captainId: captain.userId,
        sizeOptions: ["S", "M", "L"],
        namesMode: "open",
        customQuestions: [],
        deadline: run.deadline ?? now + 7 * ONE_DAY,
        status: run.status ?? "open",
        createdAt: now,
      }),
    );
  }
  return { captain, admin, orderId, designIds, designId: designIds[0], runId };
}

type World = Awaited<ReturnType<typeof seedWorld>>;

async function insertItem(
  t: T,
  w: Pick<World, "orderId" | "designId">,
  o: { name?: string; number?: string; size?: string; qty?: number } = {},
) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("orderItems", {
      orderId: w.orderId,
      designId: w.designId,
      name: o.name,
      number: o.number,
      size: o.size,
      qty: o.qty ?? 1,
      source: "captain",
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function getItem(t: T, id: Id<"orderItems">) {
  return t.run((ctx) => ctx.db.get(id));
}

// Every internal stage, with the named ones completed. This is what the admin
// checklist sends: the whole list on every change.
function stages(done: string[] = []) {
  const now = Date.now();
  return INTERNAL_STAGES.map((name) => ({
    name,
    completedAt: done.includes(name) ? now : null,
  }));
}

// Puts the order in the confirmed state directly (not through the gate), so a
// test about what locking *does* doesn't depend on the gate.
async function confirmDirectly(t: T, orderId: Id<"orders">) {
  await t.run(async (ctx) => {
    const order = await ctx.db.get(orderId);
    const rest = (order?.internalStages ?? []).filter((s) => s.name !== CONFIRMED);
    await ctx.db.patch(orderId, {
      internalStages: [...rest, { name: CONFIRMED, completedAt: Date.now() }],
    });
  });
}

async function isConfirmed(t: T, orderId: Id<"orders">) {
  const order = await t.run((ctx) => ctx.db.get(orderId));
  return (
    order?.internalStages.find((s) => s.name === CONFIRMED)?.completedAt !==
    undefined
  );
}

async function userError(fn: () => Promise<unknown>): Promise<string> {
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

function expectCustomerCopy(message: string) {
  expect(message).toMatch(/locked/i);
  expect(message).not.toMatch(/jersey run/i);
  expect(message).not.toMatch(/roster/i);
  expect(message).not.toMatch(/CONVEX|Request ID|ConvexError/);
}

// ── criteria ───────────────────────────────────────────────────────────────

describe("With Order Size Confirmed unchecked, a captain can add/edit/remove after the form deadline has passed; the public form is closed (§7.2, Q1 = A)", () => {
  it("captain writes succeed past the deadline", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { run: { deadline: Date.now() - ONE_DAY } });
    const existing = await insertItem(t, w, { name: "Sam", number: "9", size: "M" });

    const added = await w.captain.as.mutation(api.orderItems.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "Late",
      size: "L",
      qty: 1,
    });
    await w.captain.as.mutation(api.orderItems.update, {
      itemId: existing,
      name: "Sam",
      number: "9",
      size: "L",
      qty: 2,
    });
    await w.captain.as.mutation(api.orderItems.remove, { itemId: added });

    expect((await getItem(t, existing))?.size).toBe("L");
    expect((await getItem(t, added))?.removedAt).toEqual(expect.any(Number));
    const mine = await w.captain.as.query(api.orders.getMyOrder, {
      orderId: w.orderId,
    });
    expect(mine?.locked).toBe(false);
    const list = await w.captain.as.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(list?.locked).toBe(false);
    expect(list?.canEdit).toBe(true);
  });

  it("captain can still edit the order details past the deadline", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { run: { deadline: Date.now() - ONE_DAY } });
    await w.captain.as.mutation(api.orders.updateOrder, {
      orderId: w.orderId,
      teamName: "Renamed FC",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: w.designIds,
    });
    const order = await t.run((ctx) => ctx.db.get(w.orderId));
    expect(order?.teamName).toBe("Renamed FC");
  });

  it("the public form is closed: submitOrder is refused and getPublic says closed", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { run: { deadline: Date.now() - ONE_DAY } });
    const message = await userError(() =>
      t.mutation(api.orderEntries.submitOrder, {
        jerseyRunId: w.runId!,
        submitterName: "Riley",
        submitterEmail: "riley@example.com",
        customAnswers: {},
        lines: [{ designId: w.designId, name: "Riley", number: "7", size: "M", qty: 1 }],
      }),
    );
    expect(message).toBeTruthy();
    const pub = await t.query(api.jerseyRuns.getPublic, { jerseyRunId: w.runId! });
    expect(pub?.effectiveStatus).toBe("closed");
  });
});

describe("Checking Order Size Confirmed on a list with no Needs-size items succeeds and locks the list (§8.9)", () => {
  it("the stage sticks and the captain sees the list as locked, with or without an order form", async () => {
    for (const run of [undefined, false] as const) {
      const t = convexTest(schema, modules);
      const w = await seedWorld(t, run === false ? { run: false } : {});
      await insertItem(t, w, { name: "Sam", number: "9", size: "M" });

      await w.admin.as.mutation(api.admin.updateOrderStages, {
        orderId: w.orderId,
        stages: stages(["Inquiry", CONFIRMED]),
      });

      expect(await isConfirmed(t, w.orderId)).toBe(true);
      const mine = await w.captain.as.query(api.orders.getMyOrder, {
        orderId: w.orderId,
      });
      expect(mine?.locked).toBe(true);
      const list = await w.captain.as.query(api.orderItems.listForOrder, {
        orderId: w.orderId,
      });
      expect(list?.locked).toBe(true);
      expect(list?.canEdit).toBe(false);
    }
  });

  it("a confirmed list is locked even though the form's deadline is still in the future", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t); // deadline a week out, form open
    await insertItem(t, w, { name: "Sam", number: "9", size: "M" });
    await confirmDirectly(t, w.orderId);
    const list = await w.captain.as.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(list?.locked).toBe(true);
  });

  it("only an admin can check the stage", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await insertItem(t, w, { name: "Sam", size: "M" });
    await expect(
      w.captain.as.mutation(api.admin.updateOrderStages, {
        orderId: w.orderId,
        stages: stages(["Inquiry", CONFIRMED]),
      }),
    ).rejects.toThrow();
    expect(await isConfirmed(t, w.orderId)).toBe(false);
  });
});

describe("Checking Order Size Confirmed on a list with 2 Needs-size items is rejected with a message naming both; the stage stays unchecked (Q2 = A)", () => {
  it("names both items and leaves the stage unchecked", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await insertItem(t, w, { name: "Jordan Lee", number: "4" }); // no size
    await insertItem(t, w, { name: "Sam Ortiz", number: "11" }); // no size
    await insertItem(t, w, { name: "Riley Park", number: "7", size: "M" });

    const message = await userError(() =>
      w.admin.as.mutation(api.admin.updateOrderStages, {
        orderId: w.orderId,
        stages: stages(["Inquiry", CONFIRMED]),
      }),
    );

    expect(message).toMatch(/2 items need a size/i);
    expect(message).toContain("Jordan Lee #4");
    expect(message).toContain("Sam Ortiz #11");
    expect(message).not.toContain("Riley Park");
    expect(await isConfirmed(t, w.orderId)).toBe(false);
    const list = await w.captain.as.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(list?.locked).toBe(false);
  });

  it("names the first 5, then 'and n more'", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    for (let i = 1; i <= 7; i++) await insertItem(t, w, { name: `Player${i}`, number: String(i) });

    const message = await userError(() =>
      w.admin.as.mutation(api.admin.updateOrderStages, {
        orderId: w.orderId,
        stages: stages(["Inquiry", CONFIRMED]),
      }),
    );
    expect(message).toMatch(/7 items need a size/i);
    expect(message).toMatch(/and 2 more/i);
    expect(message).toContain("Player1 #1");
    expect(message).toContain("Player5 #5");
    expect(message).not.toContain("Player6 #6");
  });

  it("removed items and sized items don't block confirming", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const gone = await insertItem(t, w, { name: "Gone", number: "0" });
    await t.run((ctx) => ctx.db.patch(gone, { removedAt: Date.now() }));
    await insertItem(t, w, { name: "Sam", number: "9", size: "M" });

    await w.admin.as.mutation(api.admin.updateOrderStages, {
      orderId: w.orderId,
      stages: stages(["Inquiry", CONFIRMED]),
    });
    expect(await isConfirmed(t, w.orderId)).toBe(true);
  });
});

describe("While confirmed: captain add/update/remove/restore/addMany/copyToDesign, orders.updateOrder and submitOrder are rejected (§7.2)", () => {
  async function seedConfirmed(t: T) {
    const w = await seedWorld(t); // form open, deadline in the future
    const item = await insertItem(t, w, { name: "Sam", number: "9", size: "M" });
    const removed = await insertItem(t, w, { name: "Gone", number: "0", size: "S" });
    await t.run((ctx) => ctx.db.patch(removed, { removedAt: Date.now() }));
    await confirmDirectly(t, w.orderId);
    return { ...w, item, removed };
  }

  it("rejects every captain list write with customer copy and changes nothing", async () => {
    const t = convexTest(schema, modules);
    const w = await seedConfirmed(t);
    const [home, away] = w.designIds;

    const calls: Array<[string, () => Promise<unknown>]> = [
      ["add", () => w.captain.as.mutation(api.orderItems.add, { orderId: w.orderId, designId: home, qty: 1 })],
      ["addMany", () => w.captain.as.mutation(api.orderItems.addMany, { orderId: w.orderId, designId: home, rows: [{ name: "Late" }] })],
      ["update", () => w.captain.as.mutation(api.orderItems.update, { itemId: w.item, name: "Sam", number: "9", size: "L", qty: 1 })],
      ["remove", () => w.captain.as.mutation(api.orderItems.remove, { itemId: w.item })],
      ["restore", () => w.captain.as.mutation(api.orderItems.restore, { itemId: w.removed })],
      ["copyToDesign", () => w.captain.as.mutation(api.orderItems.copyToDesign, { orderId: w.orderId, sourceDesignId: home, targetDesignId: away })],
    ];
    for (const [name, call] of calls) {
      const message = await userError(call);
      expect(message, `${name} message`).toBeTruthy();
      expectCustomerCopy(message);
    }
    expect((await getItem(t, w.item))?.size).toBe("M");
    expect((await getItem(t, w.item))?.removedAt).toBeUndefined();
    expect((await getItem(t, w.removed))?.removedAt).toEqual(expect.any(Number));
  });

  it("rejects orders.updateOrder with customer copy", async () => {
    const t = convexTest(schema, modules);
    const w = await seedConfirmed(t);
    const message = await userError(() =>
      w.captain.as.mutation(api.orders.updateOrder, {
        orderId: w.orderId,
        teamName: "Renamed FC",
        sport: "Soccer",
        estimatedQuantity: 12,
        hasOwnDesign: false,
        designIds: w.designIds,
      }),
    );
    expectCustomerCopy(message);
    expect((await t.run((ctx) => ctx.db.get(w.orderId)))?.teamName).toBe("Falcons");
  });

  it("rejects submitOrder on an open form: the public form can't write to a confirmed list", async () => {
    const t = convexTest(schema, modules);
    const w = await seedConfirmed(t);
    const message = await userError(() =>
      t.mutation(api.orderEntries.submitOrder, {
        jerseyRunId: w.runId!,
        submitterName: "Riley",
        submitterEmail: "riley@example.com",
        customAnswers: {},
        lines: [{ designId: w.designId, name: "Riley", number: "7", size: "M", qty: 1 }],
      }),
    );
    expectCustomerCopy(message);
    const live = await t.run((ctx) =>
      ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", w.orderId))
        .collect(),
    );
    expect(live.some((i) => i.submitterEmail === "riley@example.com")).toBe(false);
  });

  it("run settings can't be changed on a confirmed list", async () => {
    const t = convexTest(schema, modules);
    const w = await seedConfirmed(t);
    await expect(
      w.captain.as.mutation(api.jerseyRuns.updateSettings, {
        jerseyRunId: w.runId!,
        deadline: Date.now() + 14 * ONE_DAY,
        customQuestions: [],
      }),
    ).rejects.toThrow();
    await expect(
      w.captain.as.mutation(api.jerseyRuns.setNamesMode, {
        jerseyRunId: w.runId!,
        namesMode: "fixed",
      }),
    ).rejects.toThrow();
  });
});

describe("While confirmed: admin edits succeed and the captain's view updates live (§7.8)", () => {
  it("admin add/update/remove/restore work on a confirmed list, and the captain's listForOrder shows them", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { run: false });
    const item = await insertItem(t, w, { name: "Sam", number: "9", size: "M" });
    const removed = await insertItem(t, w, { name: "Gone", number: "0", size: "S" });
    await t.run((ctx) => ctx.db.patch(removed, { removedAt: Date.now() }));
    await confirmDirectly(t, w.orderId);

    const added = await w.admin.as.mutation(api.orderItems.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "Late Add",
      size: "S",
      qty: 2,
    });
    await w.admin.as.mutation(api.orderItems.update, {
      itemId: item,
      name: "Sam",
      number: "9",
      size: "L",
      qty: 1,
    });
    await w.admin.as.mutation(api.orderItems.restore, { itemId: removed });
    expect((await getItem(t, item))?.updatedBy).toBe(w.admin.userId);

    const asCaptain = await w.captain.as.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(asCaptain?.locked).toBe(true);
    expect(asCaptain?.canEdit).toBe(false);
    const names = asCaptain!.designs.flatMap((d) => d.items.map((i) => i.name));
    expect(names).toEqual(expect.arrayContaining(["Late Add", "Gone"]));
    expect(asCaptain!.designs.flatMap((d) => d.items).find((i) => i._id === item)?.size).toBe("L");

    await w.admin.as.mutation(api.orderItems.remove, { itemId: added });
    const after = await w.captain.as.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(after!.designs.flatMap((d) => d.items.map((i) => i.name))).not.toContain("Late Add");

    const asAdmin = await w.admin.as.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(asAdmin?.locked).toBe(true);
    expect(asAdmin?.canEdit).toBe(true);
  });

  it("an admin edit that leaves a Needs-size item on a confirmed list doesn't block other stage edits", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { run: false });
    await insertItem(t, w, { name: "Sam", number: "9", size: "M" });
    await w.admin.as.mutation(api.admin.updateOrderStages, {
      orderId: w.orderId,
      stages: stages(["Inquiry", CONFIRMED]),
    });
    await w.admin.as.mutation(api.orderItems.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "No Size Yet",
      qty: 1,
    });

    // Confirmed stays checked while another stage moves.
    await w.admin.as.mutation(api.admin.updateOrderStages, {
      orderId: w.orderId,
      stages: stages(["Inquiry", CONFIRMED, "Sent to supplier"]),
    });
    expect(await isConfirmed(t, w.orderId)).toBe(true);
  });
});

describe("Unchecking Order Size Confirmed unlocks the list for the captain", () => {
  it("unchecks (always allowed, even with Needs-size items) and the captain can write again", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const item = await insertItem(t, w, { name: "Sam", number: "9", size: "M" });
    await w.admin.as.mutation(api.admin.updateOrderStages, {
      orderId: w.orderId,
      stages: stages(["Inquiry", CONFIRMED]),
    });
    // Admin leaves a Needs-size item behind, then unlocks.
    await w.admin.as.mutation(api.orderItems.add, {
      orderId: w.orderId,
      designId: w.designId,
      name: "No Size Yet",
      qty: 1,
    });
    await w.admin.as.mutation(api.admin.updateOrderStages, {
      orderId: w.orderId,
      stages: stages(["Inquiry"]),
    });

    expect(await isConfirmed(t, w.orderId)).toBe(false);
    const list = await w.captain.as.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(list?.locked).toBe(false);
    expect(list?.canEdit).toBe(true);
    await w.captain.as.mutation(api.orderItems.update, {
      itemId: item,
      name: "Sam",
      number: "9",
      size: "L",
      qty: 1,
    });
    expect((await getItem(t, item))?.size).toBe("L");
  });
});

describe("Extending a closed form's deadline to a future date reopens the public form", () => {
  it("updateSettings with a future deadline sets the run open again", async () => {
    for (const status of ["open", "closed"] as const) {
      const t = convexTest(schema, modules);
      // "open" + past deadline is what a lapsed form looks like; "closed" is
      // a form JCC or the closure cron already shut.
      const w = await seedWorld(t, {
        run: { deadline: Date.now() - ONE_DAY, status },
      });
      expect(
        (await t.query(api.jerseyRuns.getPublic, { jerseyRunId: w.runId! }))
          ?.effectiveStatus,
        `${status}: starts closed`,
      ).toBe("closed");

      await w.captain.as.mutation(api.jerseyRuns.updateSettings, {
        jerseyRunId: w.runId!,
        deadline: Date.now() + 14 * ONE_DAY,
        customQuestions: [],
      });

      const run = await t.run((ctx) => ctx.db.get(w.runId!));
      expect(run?.status, `${status}: stored status`).toBe("open");
      expect(
        (await t.query(api.jerseyRuns.getPublic, { jerseyRunId: w.runId! }))
          ?.effectiveStatus,
        `${status}: reopened`,
      ).toBe("open");
    }
  });

  it("a reopened form accepts a submission", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { run: { deadline: Date.now() - ONE_DAY } });
    await w.captain.as.mutation(api.jerseyRuns.updateSettings, {
      jerseyRunId: w.runId!,
      deadline: Date.now() + 14 * ONE_DAY,
      customQuestions: [],
    });
    const res = await t.mutation(api.orderEntries.submitOrder, {
      jerseyRunId: w.runId!,
      submitterName: "Riley",
      submitterEmail: "riley@example.com",
      customAnswers: {},
      lines: [{ designId: w.designId, name: "Riley", number: "7", size: "M", qty: 1 }],
    });
    expect(res.created).toBe(1);
  });
});

describe("jerseyRuns.lock / unlock are deleted; a run never becomes locked (§1)", () => {
  it("the public API has no lock or unlock", () => {
    const runs = api.jerseyRuns as unknown as Record<string, unknown>;
    expect(runs.lock).toBeUndefined();
    expect(runs.unlock).toBeUndefined();
  });

  it("a lapsed form reads as closed, never locked", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t, { run: { deadline: Date.now() - ONE_DAY } });
    const mine = await w.captain.as.query(api.jerseyRuns.getByOrder, {
      orderId: w.orderId,
    });
    expect(mine?.effectiveStatus).toBe("closed");
  });
});
