// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { INTERNAL_STAGES } from "../lib/orderStages";

const modules = import.meta.glob("./**/*.*s");

// Seeds a user row and returns both the id and an identity-scoped client.
async function seedUser(
  t: ReturnType<typeof convexTest>,
  subject: string,
  overrides: Partial<{ email: string; name: string; isAdmin: boolean }> = {},
) {
  const email = overrides.email ?? `${subject}@example.com`;
  const name = overrides.name ?? subject;
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email,
      name,
      isAdmin: overrides.isAdmin ?? false,
      createdAt: Date.now(),
    }),
  );
  return { userId, asUser: t.withIdentity({ subject, email, name }) };
}

// Inserts an order owned by `captainId` with the single seeded "Inquiry"
// stage that createOrder produces.
async function seedOrder(
  t: ReturnType<typeof convexTest>,
  captainId: Id<"users">,
): Promise<Id<"orders">> {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("orders", {
      captainId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [],
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    }),
  );
}

// The full 14-stage checklist payload the component sends, with an optional
// override for which stages carry a completedAt timestamp.
function fullStages(
  completed: Partial<Record<string, number>> = {},
): Array<{ name: string; completedAt: number | null }> {
  return INTERNAL_STAGES.map((name) => ({
    name,
    completedAt: completed[name] ?? null,
  }));
}

describe("admin.updateOrderStages", () => {
  it("marks a stage complete with its completedAt timestamp", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);

    const completedAt = Date.now();
    await asAdmin.mutation(api.admin.updateOrderStages, {
      orderId,
      stages: fullStages({ "Design Confirmed": completedAt }),
    });

    const order = await t.run((ctx) => ctx.db.get(orderId));
    const stage = order?.internalStages.find(
      (s) => s.name === "Design Confirmed",
    );
    expect(stage?.completedAt).toBe(completedAt);
    // The full 14-stage list is persisted, not just the touched ones.
    expect(order?.internalStages).toHaveLength(INTERNAL_STAGES.length);
  });

  it("clears completedAt when a stage is unchecked", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);

    // First complete it, then send it back unchecked.
    await asAdmin.mutation(api.admin.updateOrderStages, {
      orderId,
      stages: fullStages({ "Design Confirmed": Date.now() }),
    });
    await asAdmin.mutation(api.admin.updateOrderStages, {
      orderId,
      stages: fullStages(),
    });

    const order = await t.run((ctx) => ctx.db.get(orderId));
    const stage = order?.internalStages.find(
      (s) => s.name === "Design Confirmed",
    );
    expect(stage?.completedAt ?? null).toBeNull();
  });

  it("derives the customer-facing stage from the updated checklist", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);

    const now = Date.now();
    await asAdmin.mutation(api.admin.updateOrderStages, {
      orderId,
      stages: fullStages({
        Inquiry: now,
        "Design Ideated": now,
        "Design Confirmed": now,
      }),
    });

    const order = await t.run((ctx) => ctx.db.get(orderId));
    const { deriveCustomerStage } = await import("../lib/orderStages");
    expect(deriveCustomerStage(order!.internalStages)).toBe("Design Confirmed");
  });

  it("rejects a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId, asUser: asCaptain } = await seedUser(
      t,
      "captain",
    );
    const orderId = await seedOrder(t, captainId);

    await expect(
      asCaptain.mutation(api.admin.updateOrderStages, {
        orderId,
        stages: fullStages({ "Design Confirmed": Date.now() }),
      }),
    ).rejects.toThrow(/Admin access required/);
  });

  it("rejects an unknown stage name", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);

    await expect(
      asAdmin.mutation(api.admin.updateOrderStages, {
        orderId,
        stages: [{ name: "Bogus Stage", completedAt: Date.now() }],
      }),
    ).rejects.toThrow(/stage/i);
  });

  it("rejects when the order does not exist", async () => {
    const t = convexTest(schema, modules);
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });

    // A syntactically valid but non-existent order id.
    const { userId: captainId } = await seedUser(t, "captain");
    const orderId = await seedOrder(t, captainId);
    await t.run((ctx) => ctx.db.delete(orderId));

    await expect(
      asAdmin.mutation(api.admin.updateOrderStages, {
        orderId,
        stages: fullStages(),
      }),
    ).rejects.toThrow(/not found/i);
  });
});


// ─── 3-03 Admin data export ────────────────────────────────────────────

async function seedDesign(
  t: ReturnType<typeof convexTest>,
  ownerId: Id<"users">,
  title: string,
  specs: Partial<{ jerseyStyle: string; neckline: string; sleeveStyle: string }> = {},
): Promise<Id<"designs">> {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("designs", {
      ownerId,
      title,
      brief: "",
      fileIds: [],
      jerseyStyle: specs.jerseyStyle,
      neckline: specs.neckline,
      sleeveStyle: specs.sleeveStyle,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function seedRun(
  t: ReturnType<typeof convexTest>,
  orderId: Id<"orders">,
  captainId: Id<"users">,
  customQuestions: Array<{ id: string; label: string }> = [],
): Promise<Id<"jerseyRuns">> {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("jerseyRuns", {
      orderId,
      captainId,
      sizeOptions: ["S", "M", "L"],
      namesMode: "open",
      customQuestions,
      deadline: now + 86_400_000,
      status: "open",
      createdAt: now,
    }),
  );
}

describe("admin.exportOrder", () => {
  it("rejects a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId, asUser: asCaptain } = await seedUser(t, "captain");
    const orderId = await seedOrder(t, captainId);

    await expect(
      asCaptain.query(api.admin.exportOrder, { orderId }),
    ).rejects.toThrow(/Admin access required/);
  });

  it("returns null for a missing order", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    await t.run((ctx) => ctx.db.delete(orderId));

    expect(await asAdmin.query(api.admin.exportOrder, { orderId })).toBeNull();
  });

  it("exports order details and linked designs when there is no jersey run", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain", {
      name: "Ana Ruiz",
      email: "ana@example.com",
    });
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    const designId = await seedDesign(t, captainId, "Home", {
      jerseyStyle: "Pro",
      neckline: "V-neck",
      sleeveStyle: "Short",
    });
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));

    const data = await asAdmin.query(api.admin.exportOrder, { orderId });
    expect(data).not.toBeNull();
    expect(data!.hasRun).toBe(false);
    expect(data!.teamName).toBe("Falcons");
    expect(data!.captainName).toBe("Ana Ruiz");
    expect(data!.captainEmail).toBe("ana@example.com");
    expect(data!.rows).toHaveLength(1);
    expect(data!.rows[0]).toMatchObject({
      designTitle: "Home",
      jerseyStyle: "Pro",
      neckline: "V-neck",
      sleeveStyle: "Short",
    });
  });

  it("exports one row per order entry with roster, design and answer data", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    const designId = await seedDesign(t, captainId, "Home", {
      jerseyStyle: "Pro",
      neckline: "V-neck",
      sleeveStyle: "Short",
    });
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));
    const runId = await seedRun(t, orderId, captainId, [
      { id: "q1", label: "Pickup location" },
    ]);

    const now = Date.now();
    const rosterEntryId = await t.run((ctx) =>
      ctx.db.insert("rosterEntries", {
        runId,
        orderId,
        designId,
        name: "Gretzky",
        number: "99",
        source: "fan",
        createdAt: now,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("orderEntries", {
        runId,
        designId,
        rosterEntryId,
        size: "L",
        qty: 2,
        source: "fan",
        submitterName: "Ben Chu",
        submitterEmail: "ben@example.com",
        customAnswers: { q1: "Gym" },
        createdAt: now,
      }),
    );

    const data = await asAdmin.query(api.admin.exportOrder, { orderId });
    expect(data!.hasRun).toBe(true);
    expect(data!.customQuestions).toEqual([
      { id: "q1", label: "Pickup location" },
    ]);
    expect(data!.rows).toHaveLength(1);
    expect(data!.rows[0]).toMatchObject({
      designTitle: "Home",
      jerseyStyle: "Pro",
      neckline: "V-neck",
      sleeveStyle: "Short",
      nameOnJersey: "Gretzky",
      numberOnJersey: "99",
      size: "L",
      qty: 2,
      submitterName: "Ben Chu",
      submitterEmail: "ben@example.com",
      customAnswers: { q1: "Gym" },
    });
  });

  it("leaves jersey name and number blank for a bulk line with no roster slot", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    const designId = await seedDesign(t, captainId, "Home");
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [designId] }));
    const runId = await seedRun(t, orderId, captainId);

    await t.run((ctx) =>
      ctx.db.insert("orderEntries", {
        runId,
        designId,
        size: "M",
        qty: 3,
        source: "fan",
        submitterName: "Cy Okafor",
        submitterEmail: "cy@example.com",
        createdAt: Date.now(),
      }),
    );

    const data = await asAdmin.query(api.admin.exportOrder, { orderId });
    expect(data!.rows[0]).toMatchObject({
      nameOnJersey: "",
      numberOnJersey: "",
      customAnswers: {},
      qty: 3,
    });
  });

  it("excludes entries on designs the order no longer links, matching the production count", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    const keptId = await seedDesign(t, captainId, "Home");
    const removedId = await seedDesign(t, captainId, "Away");
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [keptId] }));
    const runId = await seedRun(t, orderId, captainId);

    const now = Date.now();
    for (const designId of [keptId, removedId]) {
      await t.run((ctx) =>
        ctx.db.insert("orderEntries", {
          runId,
          designId,
          size: "M",
          qty: 1,
          source: "fan",
          submitterName: "Fan",
          submitterEmail: "fan@example.com",
          createdAt: now,
        }),
      );
    }

    const data = await asAdmin.query(api.admin.exportOrder, { orderId });
    expect(data!.rows).toHaveLength(1);
    expect(data!.rows[0].designTitle).toBe("Home");
  });

  it("groups rows by the order's design sequence, then by submission time", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    const homeId = await seedDesign(t, captainId, "Home");
    const awayId = await seedDesign(t, captainId, "Away");
    await t.run((ctx) => ctx.db.patch(orderId, { designIds: [homeId, awayId] }));
    const runId = await seedRun(t, orderId, captainId);

    const now = Date.now();
    // Inserted away-first and out of time order, so sorting is observable.
    const lines: Array<[Id<"designs">, string, number]> = [
      [awayId, "Second away", now + 20],
      [homeId, "Second home", now + 10],
      [awayId, "First away", now],
      [homeId, "First home", now],
    ];
    for (const [designId, submitterName, createdAt] of lines) {
      await t.run((ctx) =>
        ctx.db.insert("orderEntries", {
          runId,
          designId,
          size: "M",
          qty: 1,
          source: "fan",
          submitterName,
          submitterEmail: `${submitterName}@example.com`,
          createdAt,
        }),
      );
    }

    const data = await asAdmin.query(api.admin.exportOrder, { orderId });
    expect(data!.rows.map((r) => r.submitterName)).toEqual([
      "First home",
      "Second home",
      "First away",
      "Second away",
    ]);
  });
});

// The three admin list views all join a user row onto each record. These
// pin the joined shape — including the fallbacks for a user row that no
// longer exists — so the shared join helper can't silently change them.
describe("admin list-view user joins", () => {
  it("joins captain name and email onto each order", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain", {
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    await seedOrder(t, captainId);

    const orders = await asAdmin.query(api.admin.listOrders, {});
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      teamName: "Falcons",
      captainName: "Ada Lovelace",
      captainEmail: "ada@example.com",
    });
  });

  it("falls back to Unknown for an order whose captain row is gone", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    await seedOrder(t, captainId);
    await t.run((ctx) => ctx.db.delete(captainId));

    const orders = await asAdmin.query(api.admin.listOrders, {});
    expect(orders[0]).toMatchObject({ captainName: "Unknown", captainEmail: "" });
  });

  it("joins owner name and email onto each design", async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId } = await seedUser(t, "owner", {
      name: "Grace Hopper",
      email: "grace@example.com",
    });
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    await seedDesign(t, ownerId, "Home");

    const designs = await asAdmin.query(api.admin.listDesigns, {});
    expect(designs).toHaveLength(1);
    expect(designs[0]).toMatchObject({
      title: "Home",
      ownerName: "Grace Hopper",
      ownerEmail: "grace@example.com",
    });
  });

  it("falls back to Unknown for a design whose owner row is gone", async () => {
    const t = convexTest(schema, modules);
    const { userId: ownerId } = await seedUser(t, "owner");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    await seedDesign(t, ownerId, "Home");
    await t.run((ctx) => ctx.db.delete(ownerId));

    const designs = await asAdmin.query(api.admin.listDesigns, {});
    expect(designs[0]).toMatchObject({ ownerName: "Unknown", ownerEmail: "" });
  });

  it("joins team name, captain, and response count onto each jersey run", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain", {
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    const runId = await seedRun(t, orderId, captainId);
    await t.run((ctx) =>
      ctx.db.insert("jerseyRunResponses", {
        jerseyRunId: runId,
        respondentName: "Fan",
        respondentEmail: "fan@example.com",
        size: "M",
        customAnswers: {},
        submittedAt: Date.now(),
      }),
    );

    const runs = await asAdmin.query(api.admin.listJerseyRuns, {});
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      teamName: "Falcons",
      captainName: "Ada Lovelace",
      captainEmail: "ada@example.com",
      responseCount: 1,
      namesMode: "open",
      status: "open",
    });
  });

  it("falls back to Unknown team and captain when both rows are gone", async () => {
    const t = convexTest(schema, modules);
    const { userId: captainId } = await seedUser(t, "captain");
    const { asUser: asAdmin } = await seedUser(t, "admin", { isAdmin: true });
    const orderId = await seedOrder(t, captainId);
    await seedRun(t, orderId, captainId);
    await t.run(async (ctx) => {
      await ctx.db.delete(orderId);
      await ctx.db.delete(captainId);
    });

    const runs = await asAdmin.query(api.admin.listJerseyRuns, {});
    expect(runs[0]).toMatchObject({
      teamName: "Unknown team",
      captainName: "Unknown",
      captainEmail: "",
    });
  });

  it("rejects non-admin callers on every list view", async () => {
    const t = convexTest(schema, modules);
    const { asUser: asCaptain } = await seedUser(t, "captain");

    await expect(asCaptain.query(api.admin.listOrders, {})).rejects.toThrow(
      /Admin access required/,
    );
    await expect(asCaptain.query(api.admin.listDesigns, {})).rejects.toThrow(
      /Admin access required/,
    );
    await expect(asCaptain.query(api.admin.listJerseyRuns, {})).rejects.toThrow(
      /Admin access required/,
    );
  });
});
