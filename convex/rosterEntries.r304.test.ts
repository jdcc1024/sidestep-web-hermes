// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// R3-04 acceptance tests (initiative 0004): `rosterEntries.addMany` takes an
// optional `orderedBy` per size, stored as `submitterName` on the size line
// with `source: "captain"`. Spec: backlog/R3-04-paste-ordered-by-column.md
// (Logic). Written before the build: fails because `addMany` rejects the
// unknown `orderedBy` field. Messages are not pinned; rejections are asserted
// as errors. Pseudonyms only.
import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { loadRoster } from "./_orderItems";
import { overviewBlocks } from "../lib/designBlock";
import { MAX_QTY } from "../lib/orderEntry/rules";

const modules = import.meta.glob("./**/*.*s");

type T = TestConvex<typeof schema>;

async function seedUser(t: T, subject: string, isAdmin = false) {
  const email = `${subject}@example.com`;
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email,
      name: subject,
      isAdmin,
      createdAt: Date.now(),
    }),
  );
  return { userId, as: t.withIdentity({ subject, email, name: subject }) };
}

async function seedWorld(t: T) {
  const captain = await seedUser(t, "captain_x");
  const other = await seedUser(t, "captain_y");
  const now = Date.now();
  const { orderId, designId } = await t.run(async (ctx) => {
    const designId = await ctx.db.insert("designs", {
      ownerId: captain.userId,
      title: "Home",
      blocks: overviewBlocks("Home kit"),
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId: captain.userId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [designId],
      internalStages: [{ name: "Inquiry", completedAt: now }],
      createdAt: now,
      updatedAt: now,
    });
    return { orderId, designId };
  });
  return { captain, other, orderId, designId };
}

const roster = (t: T, orderId: Id<"orders">) =>
  t.run((ctx) => loadRoster(ctx, orderId));

const FRASER = {
  name: "Fraser",
  number: "43",
  sizes: [
    { size: "2XL", qty: 1, orderedBy: "Rob" },
    { size: "S", qty: 1, orderedBy: "Rob" },
    { size: "2XL", qty: 1, orderedBy: "Sam" },
  ],
};

describe("rosterEntries.addMany with orderedBy (R3-04)", () => {
  it("stores one line per (size, owner) with submitterName and source captain, and no email, answers or form id", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const res = await w.captain.as.mutation(api.rosterEntries.addMany, {
      orderId: w.orderId,
      designId: w.designId,
      players: [
        FRASER,
        { name: "Gill", number: "21", sizes: [{ size: "M", qty: 1 }] },
      ],
    });
    expect(res).toMatchObject({ added: 2, jerseys: 4 });

    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(2);
    const fraser = r.entries.find((e) => e.name === "Fraser")!;
    const lines = r.items.filter((i) => i.rosterEntryId === fraser._id);
    expect(lines).toHaveLength(3);
    expect(
      lines
        .map((l) => `${l.size}:${l.qty}:${l.submitterName}`)
        .sort(),
    ).toEqual(["2XL:1:Rob", "2XL:1:Sam", "S:1:Rob"]);
    for (const l of lines) {
      expect(l.source).toBe("captain");
      expect(l.submitterEmail).toBeUndefined();
      expect(l.customAnswers).toBeUndefined();
      expect(l.orderFormId).toBeUndefined();
    }

    // The 4-column player has no owner on its line.
    const gill = r.entries.find((e) => e.name === "Gill")!;
    const gillLines = r.items.filter((i) => i.rosterEntryId === gill._id);
    expect(gillLines).toHaveLength(1);
    expect(gillLines[0].submitterName).toBeUndefined();
    expect(gillLines[0].source).toBe("captain");
  });

  it("trims the owner and treats an empty one as absent", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await w.captain.as.mutation(api.rosterEntries.addMany, {
      orderId: w.orderId,
      designId: w.designId,
      players: [
        {
          name: "Fraser",
          number: "43",
          sizes: [
            { size: "S", qty: 1, orderedBy: "  Rob  " },
            { size: "M", qty: 1, orderedBy: "" },
          ],
        },
      ],
    });
    const r = await roster(t, w.orderId);
    const byAs = Object.fromEntries(r.items.map((i) => [i.size, i]));
    expect(byAs.S.submitterName).toBe("Rob");
    expect(byAs.M.submitterName).toBeUndefined();
  });

  it("refuses another captain and a signed-out caller, and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const args = {
      orderId: w.orderId,
      designId: w.designId,
      players: [FRASER],
    };
    await expect(
      w.other.as.mutation(api.rosterEntries.addMany, args),
    ).rejects.toThrow();
    await expect(t.mutation(api.rosterEntries.addMany, args)).rejects.toThrow();
    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(0);
    expect(r.items).toHaveLength(0);
  });

  it("an orderedBy over 120 characters rejects the whole paste with a Line n: prefix and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    let message = "";
    try {
      await w.captain.as.mutation(api.rosterEntries.addMany, {
        orderId: w.orderId,
        designId: w.designId,
        players: [
          { name: "Gill", number: "21", sizes: [{ size: "M", qty: 1 }] },
          {
            name: "Fraser",
            number: "43",
            sizes: [{ size: "S", qty: 1, orderedBy: "a".repeat(121) }],
          },
        ],
      });
    } catch (err) {
      const data = (err as { data?: unknown }).data;
      message = typeof data === "string" ? data : String(err);
    }
    expect(message).toMatch(/^Line 2:/);
    const r = await roster(t, w.orderId);
    expect(r.entries).toHaveLength(0);
    expect(r.items).toHaveLength(0);
  });

  it("accepts an orderedBy of exactly 120 characters", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await w.captain.as.mutation(api.rosterEntries.addMany, {
      orderId: w.orderId,
      designId: w.designId,
      players: [
        {
          name: "Fraser",
          number: "43",
          sizes: [{ size: "S", qty: 1, orderedBy: "a".repeat(120) }],
        },
      ],
    });
    expect((await roster(t, w.orderId)).items).toHaveLength(1);
  });

  it("the per-size maximum applies to the player's total across owners", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const half = Math.floor(MAX_QTY / 2) + 1;
    await expect(
      w.captain.as.mutation(api.rosterEntries.addMany, {
        orderId: w.orderId,
        designId: w.designId,
        players: [
          {
            name: "Fraser",
            number: "43",
            sizes: [
              { size: "M", qty: half, orderedBy: "Rob" },
              { size: "M", qty: half, orderedBy: "Sam" },
            ],
          },
        ],
      }),
    ).rejects.toThrow();
    expect((await roster(t, w.orderId)).items).toHaveLength(0);
  });

  it("the validator refuses submitterEmail or source on a size line", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    const send = (extra: Record<string, unknown>) =>
      w.captain.as.mutation(api.rosterEntries.addMany, {
        orderId: w.orderId,
        designId: w.designId,
        players: [
          {
            name: "Fraser",
            number: "43",
            sizes: [{ size: "S", qty: 1, orderedBy: "Rob", ...extra }],
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    await expect(send({ submitterEmail: "x@example.com" })).rejects.toThrow();
    await expect(send({ source: "fan" })).rejects.toThrow();
    expect((await roster(t, w.orderId)).items).toHaveLength(0);
  });

  it("rosterEntries.add does not accept orderedBy", async () => {
    const t = convexTest(schema, modules);
    const w = await seedWorld(t);
    await expect(
      w.captain.as.mutation(api.rosterEntries.add, {
        orderId: w.orderId,
        designId: w.designId,
        name: "Fraser",
        number: "43",
        sizes: [{ size: "S", qty: 1, orderedBy: "Rob" }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).rejects.toThrow();
    expect((await roster(t, w.orderId)).items).toHaveLength(0);
  });
});
