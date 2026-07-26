// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

// A signed-in identity whose Convex `users` row has been synced. We seed
// the row directly via t.run() so each test starts from a known state
// without going through the syncCurrentUser mutation every time.
async function seedCaptain(
  t: ReturnType<typeof convexTest>,
  subject = "user_captain_clerk",
  overrides: Partial<{ email: string; name: string; isAdmin: boolean }> = {},
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: subject,
      email: overrides.email ?? "captain@example.com",
      name: overrides.name ?? "Cap",
      isAdmin: overrides.isAdmin ?? false,
      createdAt: Date.now(),
    }),
  );
  return {
    userId,
    asUser: t.withIdentity({
      subject,
      email: overrides.email ?? "captain@example.com",
      name: overrides.name ?? "Cap",
    }),
  };
}

const VALID_ORDER = {
  teamName: "Falcons",
  sport: "Soccer",
  estimatedQuantity: 12,
  hasOwnDesign: false,
  designIds: [] as never[],
};

// Insert a design owned by `ownerId` and return its id. Designs carry their
// own silhouette specs now (O-01), so an order just links to them.
async function seedDesign(
  t: ReturnType<typeof convexTest>,
  ownerId: Id<"users">,
  title = "My design",
) {
  return t.run((ctx) =>
    ctx.db.insert("designs", {
      ownerId,
      title,
      blocks: overviewBlocks("A brief"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

// One uploaded file on a design. Storage ids in convex-test are opaque
// strings from ctx.storage.store — no real bytes needed, the main-image
// resolver keys off content type and `createdAt`.
async function seedAsset(
  t: ReturnType<typeof convexTest>,
  designId: Id<"designs">,
  uploadedByUserId: Id<"users">,
  overrides: {
    filename?: string;
    contentType?: string;
    isMain?: boolean;
    createdAt?: number;
  } = {},
) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["x"], { type: "text/plain" }),
    );
    return ctx.db.insert("designAssets", {
      designId,
      storageId,
      filename: overrides.filename ?? "artwork.png",
      contentType: overrides.contentType ?? "image/png",
      isMain: overrides.isMain ?? false,
      uploadedByUserId,
      uploadedByAdmin: false,
      createdAt: overrides.createdAt ?? Date.now(),
    });
  });
}

describe("orders.createOrder", () => {
  it("inserts an order for an authenticated captain", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);

    const orderId = await asUser.mutation(api.orders.createOrder, VALID_ORDER);
    expect(orderId).not.toBeNull();

    const row = await t.run((ctx) => ctx.db.get(orderId));
    expect(row).toMatchObject({
      captainId: userId,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
    });
    expect(row?.internalStages[0]?.name).toBe("Inquiry");
  });

  it("creates an order with zero designs (a kit can start empty)", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCaptain(t);

    const orderId = await asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      designIds: [],
    });

    const row = await t.run((ctx) => ctx.db.get(orderId));
    expect(row?.designIds).toEqual([]);
  });

  it("creates an order linking multiple owned designs", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);
    const a = await seedDesign(t, userId, "Home kit");
    const b = await seedDesign(t, userId, "Away kit");

    const orderId = await asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      designIds: [a, b],
    });

    const row = await t.run((ctx) => ctx.db.get(orderId));
    expect(row?.designIds).toEqual([a, b]);
  });

  it("rejects an unauthenticated caller (no Clerk identity)", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.orders.createOrder, VALID_ORDER),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects linking a design owned by a different captain", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCaptain(t, "user_captain_clerk");
    const { userId: otherUserId } = await seedCaptain(
      t,
      "user_other_clerk",
      { email: "other@example.com", name: "Other" },
    );

    const foreignDesignId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: otherUserId,
        title: "Not mine",
        blocks: overviewBlocks("Not my brief"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asUser.mutation(api.orders.createOrder, {
        ...VALID_ORDER,
        designIds: [foreignDesignId],
      }),
    ).rejects.toThrow(/not yours/);
  });
});

describe("orders.updateOrder", () => {
  // Helper: create a baseline order owned by the seeded captain so each
  // update test starts from a persisted record.
  async function seedOrder(
    t: ReturnType<typeof convexTest>,
    asUser: Awaited<ReturnType<typeof seedCaptain>>["asUser"],
    overrides: Partial<typeof VALID_ORDER> = {},
  ) {
    return asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      ...overrides,
    });
  }

  it("updates team context fields and bumps updatedAt", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCaptain(t);
    const orderId = await seedOrder(t, asUser);
    const before = await t.run((ctx) => ctx.db.get(orderId));

    await asUser.mutation(api.orders.updateOrder, {
      orderId,
      teamName: "Renamed FC",
      sport: "Rugby",
      estimatedQuantity: 20,
      hasOwnDesign: true,
      designIds: [],
    });

    const after = await t.run((ctx) => ctx.db.get(orderId));
    expect(after).toMatchObject({
      teamName: "Renamed FC",
      sport: "Rugby",
      estimatedQuantity: 20,
      hasOwnDesign: true,
    });
    // createdAt and internalStages are preserved; updatedAt advances.
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(after?.internalStages).toEqual(before?.internalStages);
    expect(after?.updatedAt).toBeGreaterThanOrEqual(before?.updatedAt ?? 0);
  });

  it("links zero..many designs and can clear them back to zero", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);
    const a = await seedDesign(t, userId, "Home kit");
    const b = await seedDesign(t, userId, "Away kit");
    const orderId = await seedOrder(t, asUser);

    await asUser.mutation(api.orders.updateOrder, {
      orderId,
      teamName: VALID_ORDER.teamName,
      sport: VALID_ORDER.sport,
      estimatedQuantity: VALID_ORDER.estimatedQuantity,
      hasOwnDesign: VALID_ORDER.hasOwnDesign,
      designIds: [a, b],
    });
    expect(
      (await t.run((ctx) => ctx.db.get(orderId)))?.designIds,
    ).toEqual([a, b]);

    await asUser.mutation(api.orders.updateOrder, {
      orderId,
      teamName: VALID_ORDER.teamName,
      sport: VALID_ORDER.sport,
      estimatedQuantity: VALID_ORDER.estimatedQuantity,
      hasOwnDesign: VALID_ORDER.hasOwnDesign,
      designIds: [],
    });
    expect(
      (await t.run((ctx) => ctx.db.get(orderId)))?.designIds,
    ).toEqual([]);
  });

  it("rejects updating an order owned by a different captain", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCaptain(t);
    const orderId = await seedOrder(t, asUser);

    const { asUser: asOther } = await seedCaptain(t, "user_other_clerk", {
      email: "other@example.com",
      name: "Other",
    });

    await expect(
      asOther.mutation(api.orders.updateOrder, {
        orderId,
        teamName: "Hijacked",
        sport: VALID_ORDER.sport,
        estimatedQuantity: VALID_ORDER.estimatedQuantity,
        hasOwnDesign: VALID_ORDER.hasOwnDesign,
        designIds: [],
      }),
    ).rejects.toThrow(/access/i);
  });

  it("rejects linking a design owned by a different captain", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCaptain(t);
    const orderId = await seedOrder(t, asUser);

    const { userId: otherUserId } = await seedCaptain(t, "user_other_clerk", {
      email: "other@example.com",
      name: "Other",
    });
    const foreignDesignId = await seedDesign(t, otherUserId, "Not mine");

    await expect(
      asUser.mutation(api.orders.updateOrder, {
        orderId,
        teamName: VALID_ORDER.teamName,
        sport: VALID_ORDER.sport,
        estimatedQuantity: VALID_ORDER.estimatedQuantity,
        hasOwnDesign: VALID_ORDER.hasOwnDesign,
        designIds: [foreignDesignId],
      }),
    ).rejects.toThrow(/not yours/);
  });

  it("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { asUser } = await seedCaptain(t);
    const orderId = await seedOrder(t, asUser);

    await expect(
      t.mutation(api.orders.updateOrder, {
        orderId,
        teamName: VALID_ORDER.teamName,
        sport: VALID_ORDER.sport,
        estimatedQuantity: VALID_ORDER.estimatedQuantity,
        hasOwnDesign: VALID_ORDER.hasOwnDesign,
        designIds: [],
      }),
    ).rejects.toThrow(/Not authenticated/);
  });

  it("rejects updating an order once its jersey run is locked (R-06)", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);
    const orderId = await seedOrder(t, asUser);
    const now = Date.now();
    const runId = await t.run((ctx) =>
      ctx.db.insert("jerseyRuns", {
        orderId,
        captainId: userId,
        sizeOptions: ["S", "M", "L"],
        namesMode: "open",
        customQuestions: [],
        deadline: now + 7 * 24 * 60 * 60 * 1000,
        status: "locked",
        lockSnapshot: { lockedAt: now, total: 0, byDesign: [] },
        createdAt: now,
      }),
    );

    await expect(
      asUser.mutation(api.orders.updateOrder, {
        orderId,
        teamName: "Renamed FC",
        sport: VALID_ORDER.sport,
        estimatedQuantity: VALID_ORDER.estimatedQuantity,
        hasOwnDesign: VALID_ORDER.hasOwnDesign,
        designIds: [],
      }),
    ).rejects.toThrow(/locked/i);
    // Sanity: the run really is the one we just locked, not a stray guard.
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("locked");
  });
});

describe("orders.getMyOrder", () => {
  it("surfaces each linked design's silhouette specs so the order detail can render per-design sections", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);

    const designId = await t.run((ctx) =>
      ctx.db.insert("designs", {
        ownerId: userId,
        title: "Home kit",
        blocks: overviewBlocks("Classic look"),
        jerseyStyle: "Pro Fit",
        neckline: "V-Neck",
        sleeveStyle: "Raglan",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const orderId = await asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      designIds: [designId],
    });

    const result = await asUser.query(api.orders.getMyOrder, { orderId });
    expect(result?.designs).toHaveLength(1);
    expect(result?.designs[0]).toMatchObject({
      _id: designId,
      title: "Home kit",
      jerseyStyle: "Pro Fit",
      neckline: "V-Neck",
      sleeveStyle: "Raglan",
    });
  });

  it("resolves each design's main image alongside its file count (D-07)", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);

    const designId = await seedDesign(t, userId, "Home kit");
    // A print template uploaded first, then the artwork: the resolver skips
    // the PDF and picks the oldest web-safe image.
    await seedAsset(t, designId, userId, {
      filename: "print-template.pdf",
      contentType: "application/pdf",
      createdAt: 1,
    });
    await seedAsset(t, designId, userId, {
      filename: "crest.png",
      contentType: "image/png",
      createdAt: 2,
    });

    const orderId = await asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      designIds: [designId],
    });

    const design = (await asUser.query(api.orders.getMyOrder, { orderId }))
      ?.designs[0];
    expect(design?.fileCount).toBe(2);
    expect(design?.mainImage).toMatchObject({
      filename: "crest.png",
      contentType: "image/png",
    });
    expect(typeof design?.mainImage?.url).toBe("string");
  });

  it("honours an explicitly flagged main image over upload order", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);

    const designId = await seedDesign(t, userId, "Away kit");
    await seedAsset(t, designId, userId, {
      filename: "first.png",
      createdAt: 1,
    });
    await seedAsset(t, designId, userId, {
      filename: "chosen.png",
      createdAt: 2,
      isMain: true,
    });

    const orderId = await asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      designIds: [designId],
    });

    const design = (await asUser.query(api.orders.getMyOrder, { orderId }))
      ?.designs[0];
    expect(design?.mainImage?.filename).toBe("chosen.png");
  });

  it("returns a null main image for a design with no files at all", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);

    const designId = await seedDesign(t, userId, "Docs only");
    const orderId = await asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      designIds: [designId],
    });

    const design = (await asUser.query(api.orders.getMyOrder, { orderId }))
      ?.designs[0];
    expect(design?.fileCount).toBe(0);
    expect(design?.mainImage).toBeNull();
  });

  it("resolves one main image per linked design, not one for the order", async () => {
    const t = convexTest(schema, modules);
    const { userId, asUser } = await seedCaptain(t);

    const homeId = await seedDesign(t, userId, "Home kit");
    const awayId = await seedDesign(t, userId, "Away kit");
    await seedAsset(t, homeId, userId, { filename: "home.png", createdAt: 1 });
    await seedAsset(t, awayId, userId, { filename: "away.png", createdAt: 1 });

    const orderId = await asUser.mutation(api.orders.createOrder, {
      ...VALID_ORDER,
      designIds: [homeId, awayId],
    });

    const designs = (await asUser.query(api.orders.getMyOrder, { orderId }))
      ?.designs;
    expect(
      designs?.map((d) => [d.title, d.mainImage?.filename ?? null]),
    ).toEqual([
      ["Home kit", "home.png"],
      ["Away kit", "away.png"],
    ]);
  });
});
