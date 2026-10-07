// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// L-06 §5 acceptance: `_migrations.retireLegacyRosterTables` empties the legacy
// tables and un-locks stored runs; afterwards the schema no longer has them.
// A migration test needs pre-migration data, which the post-migration schema
// can't hold, so the migration runs against `legacySchema`: today's tables
// plus loose legacy `rosterEntries` / `orderEntries` / `orderForms` shapes.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import schema from "./schema";
import { internal } from "./_generated/api";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

const legacySchema = defineSchema({
  ...schema.tables,
  orderForms: defineTable(v.any()).index("by_order", ["orderId"]).index("by_captain", ["captainId"]),
  rosterEntries: defineTable(v.any()).index("by_run", ["runId"]).index("by_design", ["designId"]),
  orderEntries: defineTable(v.any())
    .index("by_run", ["runId"])
    .index("by_rosterEntry", ["rosterEntryId"])
    .index("by_submitterEmail", ["submitterEmail"]),
  // An L-06-era item carried its name on the row; R2-03 moved it to the
  // player, so the narrowed table can't hold this one.
  orderItems: defineTable(v.any())
    .index("by_order", ["orderId"])
    .index("by_entry", ["rosterEntryId"])
    .index("by_submitterEmail", ["submitterEmail"]),
});

const retire = internal._migrations.retireLegacyRosterTables;

const legacyTest = () => convexTest(legacySchema, modules);
type LegacyTest = ReturnType<typeof legacyTest>;

async function seedLegacy(t: LegacyTest) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const captainId = await ctx.db.insert("users", {
      clerkId: "c", email: "c@example.com", name: "C", isAdmin: false, createdAt: now,
    });
    const designId = await ctx.db.insert("designs", {
      ownerId: captainId, title: "Home", blocks: overviewBlocks("h"), createdAt: now, updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId, teamName: "Falcons", sport: "Soccer", estimatedQuantity: 12,
      hasOwnDesign: false, designIds: [designId],
      internalStages: [{ name: "Inquiry", completedAt: now }], createdAt: now, updatedAt: now,
    });
    const run = (status: "open" | "closed" | "locked") =>
      ctx.db.insert("orderForms", {
        orderId, captainId, sizeOptions: ["S"], namesMode: "open", customQuestions: [],
        deadline: now + 1000, status, createdAt: now,
        ...(status === "locked"
          ? { lockSnapshot: { lockedAt: now, total: 1, byDesign: [] } }
          : {}),
      });
    const lockedRun = await run("locked");
    const openRun = await run("open");
    const slot = await ctx.db.insert("rosterEntries", {
      runId: lockedRun, orderId, designId, name: "Sam", source: "captain", createdAt: now,
    });
    await ctx.db.insert("orderEntries", {
      runId: lockedRun, designId, rosterEntryId: slot, size: "M", qty: 1, source: "fan",
      submitterName: "S", submitterEmail: "s@example.com", createdAt: now,
    });
    const item = await ctx.db.insert("orderItems", {
      orderId, designId, name: "Sam", size: "M", qty: 1, source: "captain",
      createdAt: now, updatedAt: now,
    });
    return { lockedRun, openRun, item };
  });
}

describe("retireLegacyRosterTables (idempotent): deletes all rosterEntries and orderEntries rows, patches locked runs to closed, clears lockSnapshot", () => {
  it("empties the legacy tables, closes locked runs, keeps orderItems", async () => {
    const t = legacyTest();
    const { lockedRun, openRun, item } = await seedLegacy(t);

    await t.mutation(retire, {});

    const after = await t.run(async (ctx) => ({
      roster: await ctx.db.query("rosterEntries").collect(),
      entries: await ctx.db.query("orderEntries").collect(),
      locked: await ctx.db.get(lockedRun),
      open: await ctx.db.get(openRun),
      item: await ctx.db.get(item),
    }));
    expect(after.roster).toHaveLength(0);
    expect(after.entries).toHaveLength(0);
    expect(after.locked?.status).toBe("closed");
    expect(after.locked?.lockSnapshot).toBeUndefined();
    expect(after.open?.status).toBe("open");
    expect(after.item?.name).toBe("Sam"); // the live list is untouched
  });

  it("is a no-op the second time", async () => {
    const t = legacyTest();
    const { lockedRun } = await seedLegacy(t);
    await t.mutation(retire, {});
    await t.mutation(retire, {});
    const run = await t.run((ctx) => ctx.db.get(lockedRun));
    expect(run?.status).toBe("closed");
  });
});

describe("After the migration the schema has no legacy tables, no lockSnapshot and no locked status", () => {
  const tables = () =>
    (schema as unknown as { tables: Record<string, unknown> }).tables;

  it("drops rosterEntries and orderEntries but keeps orderItems and orderForms", () => {
    const names = Object.keys(tables());
    expect(names).not.toContain("orderEntries");
    expect(names).toEqual(expect.arrayContaining(["orderItems", "orderForms"]));
  });

  it("orderForms no longer has lockSnapshot or the locked status literal", () => {
    const src = readFileSync(path.resolve(__dirname, "schema.ts"), "utf8");
    expect(src).not.toMatch(/lockSnapshot/);
    expect(src).not.toMatch(/v\.literal\(\s*"locked"\s*\)/);
  });
});

describe("The legacy-model grep is clean (L-06 §5)", () => {
  const ROOT = path.resolve(__dirname, "..");
  function files(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === "_generated" || name === "node_modules") continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) out.push(...files(full));
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  it("rosterEntries / orderEntries / lockSnapshot appear only in migration comments, the orderEntries module name and submitOrder", () => {
    const hits: string[] = [];
    for (const dir of ["convex", "app", "components", "lib"]) {
      for (const file of files(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file);
        // This file and the migration (its history comment) may name them.
        if (rel === "convex/retireLegacy.l06.test.ts" || rel === "convex/_migrations.ts") continue;
        // Test files may name them: to assert they're gone, or to import the
        // public form module, which keeps the orderEntries name until L-07.
        if (/\.test\.tsx?$/.test(rel)) continue;
        // The public form's API module is still called orderEntries.
        const text = readFileSync(file, "utf8")
          .split("\n")
          .map((l, i) => ({ l, n: i + 1 }))
          .filter(({ l }) => /orderEntries|lockSnapshot/.test(l))
          .filter(({ l }) => !/api\.orderEntries\.submitOrder|orderEntries\.submitOrder|^\s*(\/\/|\*|\/\*)/.test(l));
        for (const { l, n } of text) hits.push(`${rel}:${n}  ${l.trim()}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
