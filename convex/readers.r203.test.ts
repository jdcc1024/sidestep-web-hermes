// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// R2-03 acceptance tests (initiative 0004, phase 1b): the two readers that
// still read the flat item fields today, `orderForms.listMyResponses` and
// `admin.exportOrder`, must read the player (rosterEntries) instead.
// Spec: backlog/R2-03-retire-flat-item-fields.md (## Logic).
// Written before the build: items here are size lines only (entry, size, qty,
// submitter), exactly the narrowed shape, so today's readers see no name,
// number or design. Messages are not pinned; rejections are asserted loosely.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");
const ONE_DAY = 24 * 60 * 60 * 1000;
type T = TestConvex<typeof schema>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function seedWorld(t: T) {
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const mkUser = (subject: string, isAdmin = false) =>
      ctx.db.insert("users", {
        clerkId: subject,
        email: `${subject}@example.com`,
        name: subject,
        isAdmin,
        createdAt: now,
      });
    const captainId = await mkUser("captain_x");
    await mkUser("admin", true);
    const homeId = await ctx.db.insert("designs", {
      ownerId: captainId,
      title: "Home",
      blocks: overviewBlocks("Home"),
      jerseyStyle: "Pro",
      neckline: "V-neck",
      sleeveStyle: "Short",
      createdAt: now,
      updatedAt: now,
    });
    const awayId = await ctx.db.insert("designs", {
      ownerId: captainId,
      title: "Away",
      blocks: overviewBlocks("Away"),
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [homeId, awayId],
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    const orderFormId = await ctx.db.insert("orderForms", {
      orderId,
      captainId,
      sizeOptions: ["S", "M", "L", "XL"],
      namesMode: "open",
      customQuestions: [],
      deadline: now + 7 * ONE_DAY,
      status: "open",
      createdAt: now,
    });
    return { orderId, homeId, awayId, orderFormId };
  });
  return {
    t,
    ...ids,
    captain: t.withIdentity({
      subject: "captain_x",
      email: "captain_x@example.com",
      name: "captain_x",
    }),
    admin: t.withIdentity({
      subject: "admin",
      email: "admin@example.com",
      name: "admin",
    }),
    fan: t.withIdentity({
      subject: "fan",
      email: "fan@example.com",
      name: "Fan",
    }),
    otherFan: t.withIdentity({
      subject: "other",
      email: "other@example.com",
      name: "Other",
    }),
  };
}
type World = Awaited<ReturnType<typeof seedWorld>>;

type Line = {
  size: string;
  qty?: number;
  email?: string; // submitter
  removedAt?: number;
  fromForm?: boolean; // default true
};

// A player and its size lines, written straight into the tables in the
// narrowed shape: a line carries no design, name, number or letter.
async function seedPlayer(
  w: World,
  o: {
    design?: "home" | "away";
    name?: string;
    number?: string;
    designation?: "C" | "A";
    removed?: boolean;
    lines?: Line[];
  },
) {
  return w.t.run(async (ctx) => {
    const now = Date.now();
    const entryId = await ctx.db.insert("rosterEntries", {
      orderId: w.orderId,
      designId: o.design === "away" ? w.awayId : w.homeId,
      name: o.name,
      number: o.number,
      designation: o.designation,
      source: "captain",
      removedAt: o.removed ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });
    const itemIds: Id<"orderItems">[] = [];
    for (const [i, l] of (o.lines ?? []).entries())
      itemIds.push(
        await ctx.db.insert("orderItems", {
          orderId: w.orderId,
          rosterEntryId: entryId,
          size: l.size,
          qty: l.qty ?? 1,
          source: l.email ? "fan" : "captain",
          submitterName: l.email ? "Submitter" : undefined,
          submitterEmail: l.email,
          orderFormId: l.fromForm === false ? undefined : w.orderFormId,
          removedAt: l.removedAt,
          createdAt: now + i,
          updatedAt: now + i,
        } as Any),
      );
    return { entryId, itemIds };
  });
}

// ── orderForms.listMyResponses ────────────────────────────────────────────

describe("orderForms.listMyResponses reads the player", () => {
  it("returns the caller's size lines with their player's name and number, design title, size and qty", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    const sidestep = await seedPlayer(w, {
      name: "Sidestep",
      number: "72",
      lines: [
        { size: "S", email: "fan@example.com" },
        { size: "M", qty: 3, email: "fan@example.com" },
      ],
    });
    const lee = await seedPlayer(w, {
      design: "away",
      name: "Lee",
      number: "4",
      lines: [{ size: "XL", email: "fan@example.com" }],
    });

    const mine = await w.fan.query(api.orderForms.listMyResponses, {});
    expect(mine).toHaveLength(3);
    // each result is an item: _id is the item id
    expect(mine.map((m) => m.entry._id).sort()).toEqual(
      [...sidestep.itemIds, ...lee.itemIds].sort(),
    );
    const s = mine.find((m) => m.entry._id === sidestep.itemIds[1])!;
    expect(s.entry).toMatchObject({
      name: "Sidestep",
      number: "72",
      size: "M",
      qty: 3,
      designTitle: "Home",
    });
    expect(s.teamName).toBe("Falcons");
    expect(s.run._id).toBe(w.orderFormId);
    const l = mine.find((m) => m.entry._id === lee.itemIds[0])!;
    expect(l.entry).toMatchObject({
      name: "Lee",
      number: "4",
      size: "XL",
      designTitle: "Away",
    });
  });

  it("never shows another user's lines, even on the caller's own player", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    const shared = await seedPlayer(w, {
      name: "Sidestep",
      number: "72",
      lines: [
        { size: "M", email: "fan@example.com" },
        { size: "L", email: "other@example.com" },
        { size: "XL" }, // the captain's own line, no submitter
      ],
    });

    const mine = await w.fan.query(api.orderForms.listMyResponses, {});
    expect(mine.map((m) => m.entry._id)).toEqual([shared.itemIds[0]]);
    const theirs = await w.otherFan.query(api.orderForms.listMyResponses, {});
    expect(theirs.map((m) => m.entry._id)).toEqual([shared.itemIds[1]]);
  });

  it("returns [] when signed out", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    await seedPlayer(w, {
      name: "Sidestep",
      number: "72",
      lines: [{ size: "M", email: "fan@example.com" }],
    });
    expect(await w.t.query(api.orderForms.listMyResponses, {})).toEqual([]);
  });

  it("key unhappy path: a line under a removed player is left out, and so is a removed line; the live ones stay", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    const kept = await seedPlayer(w, {
      name: "Sidestep",
      number: "72",
      lines: [
        { size: "M", email: "fan@example.com" },
        { size: "S", email: "fan@example.com", removedAt: Date.now() },
      ],
    });
    await seedPlayer(w, {
      name: "Gone",
      number: "0",
      removed: true,
      lines: [{ size: "L", email: "fan@example.com" }],
    });

    const mine = await w.fan.query(api.orderForms.listMyResponses, {});
    expect(mine.map((m) => m.entry._id)).toEqual([kept.itemIds[0]]);
    expect(mine[0].entry.name).toBe("Sidestep");
  });
});

// ── admin.exportOrder ─────────────────────────────────────────────────────

describe("admin.exportOrder reads the player", () => {
  it("Sidestep #72 in S, M×3, XL exports with the player's values on every line, the design's specs, and each line's own submitter", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    await seedPlayer(w, {
      name: "Sidestep",
      number: "72",
      designation: "C",
      lines: [
        { size: "S", email: "fan@example.com" },
        { size: "M", qty: 3 },
        { size: "XL", email: "other@example.com" },
      ],
    });

    const data = await w.admin.query(api.admin.exportOrder, {
      orderId: w.orderId,
    });
    expect(data).not.toBeNull();
    expect(data!.hasRun).toBe(true);
    // one row per live item, not per player
    expect(data!.rows).toHaveLength(3);
    for (const r of data!.rows)
      expect(r).toMatchObject({
        nameOnJersey: "Sidestep",
        numberOnJersey: "72",
        designTitle: "Home",
        jerseyStyle: "Pro",
        neckline: "V-neck",
        sleeveStyle: "Short",
      });
    // the letter is exported in words, whatever the words are
    for (const r of data!.rows) {
      expect(r.roleOnJersey).not.toBe("");
      expect(r.roleOnJersey).not.toBe("C");
    }
    const bySize = Object.fromEntries(data!.rows.map((r) => [r.size, r.qty]));
    expect(bySize).toEqual({ S: 1, M: 3, XL: 1 });
    expect(data!.rows.reduce((n, r) => n + r.qty, 0)).toBe(5);
    expect(data!.rows.find((r) => r.size === "S")!.submitterEmail).toBe(
      "fan@example.com",
    );
    expect(data!.rows.find((r) => r.size === "XL")!.submitterEmail).toBe(
      "other@example.com",
    );
    expect(data!.rows.find((r) => r.size === "M")!.submitterEmail).toBe("");
  });

  it("rows follow the player's design: the same print on Home and Away keeps each line under its own design", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    await seedPlayer(w, {
      name: "Lee",
      number: "4",
      lines: [{ size: "M" }],
    });
    await seedPlayer(w, {
      design: "away",
      name: "Lee",
      number: "4",
      lines: [{ size: "L" }],
    });
    const data = await w.admin.query(api.admin.exportOrder, {
      orderId: w.orderId,
    });
    const designOf = Object.fromEntries(
      data!.rows.map((r) => [r.size, r.designTitle]),
    );
    expect(designOf).toEqual({ M: "Home", L: "Away" });
  });

  it("rejects a captain, even on their own order, and a signed-out caller", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    await seedPlayer(w, {
      name: "Sidestep",
      number: "72",
      lines: [{ size: "M" }],
    });
    await expect(
      w.captain.query(api.admin.exportOrder, { orderId: w.orderId }),
    ).rejects.toThrow();
    await expect(
      w.t.query(api.admin.exportOrder, { orderId: w.orderId }),
    ).rejects.toThrow();
  });

  it("key unhappy path: a removed player's lines, a removed line, and a player who needs sizes add no rows; the count equals the captain's jerseyCount", async () => {
    const w = await seedWorld(convexTest(schema, modules));
    await seedPlayer(w, {
      name: "Sidestep",
      number: "72",
      lines: [
        { size: "S" },
        { size: "M", qty: 3 },
        { size: "XL", removedAt: Date.now() },
      ],
    });
    await seedPlayer(w, {
      name: "Gone",
      number: "0",
      removed: true,
      lines: [{ size: "L", qty: 2 }],
    });
    await seedPlayer(w, { name: "Bure", number: "10" }); // needs sizes

    const data = await w.admin.query(api.admin.exportOrder, {
      orderId: w.orderId,
    });
    expect(data!.rows.map((r) => r.nameOnJersey).sort()).toEqual([
      "Sidestep",
      "Sidestep",
    ]);
    expect(data!.rows.map((r) => r.size).sort()).toEqual(["M", "S"]);
    const exported = data!.rows.reduce((n, r) => n + r.qty, 0);
    expect(exported).toBe(4);

    const list = await w.captain.query(api.orderItems.listForOrder, {
      orderId: w.orderId,
    });
    expect(list!.summary.jerseyCount).toBe(exported);
  });
});
