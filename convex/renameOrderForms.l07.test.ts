// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// L-07 acceptance test (initiative 0004, phase 1): the one-off data migration
// `_migrations.renameJerseyRunsToOrderForms` copies each jerseyRuns row to an
// orderForms row (new id), re-points the items that came through it, and
// deletes the old row. Internal only. The build adds it in commit 1 and
// deletes it, with this file, in commit 2.
// Spec: backlog/L-07-rename-jersey-runs-to-order-forms.md (Logic, line 1).
//
// The post-migration schema has no jerseyRuns, so the migration runs against a
// pre-migration schema: today's tables plus jerseyRuns, with orderItems.runId.
// `orderForms` must come from the build's widened schema (`schema.tables`).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { defineSchema, defineTable, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import schema from "./schema";
import { internal } from "./_generated/api";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

const preSchema = defineSchema({
  ...schema.tables,
  jerseyRuns: defineTable(v.any())
    .index("by_order", ["orderId"])
    .index("by_captain", ["captainId"]),
  orderItems: defineTable(v.any())
    .index("by_order", ["orderId"])
    .index("by_submitterEmail", ["submitterEmail"]),
});

// The migration doesn't exist yet, so reach it loosely: the build's generated
// api will type it, and this stays valid either way.
const migrate = (
  internal as unknown as {
    _migrations: {
      renameJerseyRunsToOrderForms: FunctionReference<
        "mutation",
        "internal",
        Record<string, never>,
        { forms: number; itemsRepointed: number }
      >;
    };
  }
)._migrations.renameJerseyRunsToOrderForms;

type Row = Record<string, unknown>;
type LooseDb = {
  query: (table: string) => { collect: () => Promise<Row[]> };
  get: (id: unknown) => Promise<Row | null>;
};

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const captainId = await ctx.db.insert("users", {
      clerkId: "c", email: "c@example.com", name: "C", isAdmin: false, createdAt: now,
    });
    const designId = await ctx.db.insert("designs", {
      ownerId: captainId, title: "Home", blocks: overviewBlocks("h"), createdAt: now, updatedAt: now,
    });
    const order = () =>
      ctx.db.insert("orders", {
        captainId, teamName: "Falcons", sport: "Soccer", estimatedQuantity: 12,
        hasOwnDesign: false, designIds: [designId],
        internalStages: [{ name: "Inquiry", completedAt: now }], createdAt: now, updatedAt: now,
      });
    const order1 = await order();
    const order2 = await order();
    const run1 = await ctx.db.insert("jerseyRuns", {
      orderId: order1, captainId, sizeOptions: ["S", "M"], namesMode: "fixed",
      customQuestions: [{ id: "q1", label: "Position?" }],
      deadline: now + 86_400_000, status: "open", createdAt: now - 5000,
    });
    const run2 = await ctx.db.insert("jerseyRuns", {
      orderId: order2, captainId, sizeOptions: ["L"], namesMode: "open",
      customQuestions: [], deadline: now + 1000, status: "closed", createdAt: now - 9000,
    });
    const item = (orderId: unknown, extra: Row) =>
      ctx.db.insert("orderItems", {
        orderId, designId, qty: 1, source: "fan", createdAt: now, updatedAt: now, ...extra,
      });
    const live = await item(order1, { name: "Live", runId: run1 });
    const removed = await item(order1, { name: "Gone", runId: run1, removedAt: now });
    const captain = await item(order1, { name: "Cap", source: "captain" });
    const other = await item(order2, { name: "Other", runId: run2 });
    return { run1, run2, order1, order2, live, removed, captain, other };
  });
}

const dump = (t: ReturnType<typeof convexTest>, table: string) =>
  t.run((ctx) => (ctx.db as unknown as LooseDb).query(table).collect());

describe("_migrations.renameJerseyRunsToOrderForms", () => {
  it("turns 2 runs into 2 orderForms with equal fields, re-points every form item (removed included), leaves captain items alone", async () => {
    const t = convexTest(preSchema, modules);
    const ids = await seed(t);
    const runsBefore = await dump(t, "jerseyRuns");

    const result = await t.mutation(migrate, {});
    expect(result).toEqual({ forms: 2, itemsRepointed: 3 });

    expect(await dump(t, "jerseyRuns")).toEqual([]);
    const forms = await dump(t, "orderForms");
    expect(forms).toHaveLength(2);
    const strip = ({ _id, _creationTime, ...rest }: Row) => {
      void _id;
      void _creationTime;
      return rest;
    };
    for (const run of runsBefore) {
      const form = forms.find((f) => f.orderId === run.orderId)!;
      expect(strip(form)).toEqual(strip(run));
    }

    const f1 = forms.find((f) => f.orderId === ids.order1)!._id;
    const f2 = forms.find((f) => f.orderId === ids.order2)!._id;
    await t.run(async (ctx) => {
      const db = ctx.db as unknown as LooseDb;
      for (const [id, formId] of [
        [ids.live, f1],
        [ids.removed, f1],
        [ids.other, f2],
      ] as const) {
        const row = (await db.get(id))!;
        expect(row.orderFormId).toEqual(formId);
        expect("runId" in row).toBe(false);
      }
      expect((await db.get(ids.removed))!.removedAt).toEqual(expect.any(Number));
      const cap = (await db.get(ids.captain))!;
      expect("orderFormId" in cap).toBe(false);
      expect("runId" in cap).toBe(false);
      expect(cap.name).toBe("Cap");
    });
  });

  it("is idempotent: a second run returns zeros and changes nothing", async () => {
    const t = convexTest(preSchema, modules);
    await seed(t);
    await t.mutation(migrate, {});
    const formsAfterFirst = await dump(t, "orderForms");
    const itemsAfterFirst = await dump(t, "orderItems");
    expect(await t.mutation(migrate, {})).toEqual({ forms: 0, itemsRepointed: 0 });
    expect(await dump(t, "orderForms")).toEqual(formsAfterFirst);
    expect(await dump(t, "orderItems")).toEqual(itemsAfterFirst);
  });

  it("is internal only: declared with internalMutation, not mutation", () => {
    // `api.x.y` is a Proxy and never undefined, so read the module source.
    const src = readFileSync(new URL("./_migrations.ts", import.meta.url), "utf8");
    expect(src).toMatch(
      /export const renameJerseyRunsToOrderForms\s*=\s*internalMutation\(/,
    );
  });
});
