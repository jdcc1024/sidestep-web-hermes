// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// IMG-05 Logic (backlog/IMG-05-original-url-only-on-download.md): the
// original print file's URL leaves Convex only through `designs.originalUrl`,
// and only for the design's owner or an admin. Every asset read ships JSON that
// never contains it, with or without a stored preview.
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

const identity = (subject: string) => ({
  subject,
  email: `${subject}@example.com`,
  name: subject,
});

async function seed(withPreview: boolean) {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const user = (clerkId: string, isAdmin: boolean) =>
      ctx.db.insert("users", {
        clerkId,
        email: `${clerkId}@example.com`,
        name: clerkId,
        isAdmin,
        createdAt: now,
      });
    const ownerId = await user("owner", false);
    await user("stranger", false);
    await user("staff", true);
    const designId = await ctx.db.insert("designs", {
      ownerId,
      title: "Kit",
      blocks: overviewBlocks("x"),
      createdAt: now,
      updatedAt: now,
    });
    const orderId = await ctx.db.insert("orders", {
      captainId: ownerId,
      teamName: "Wildcats",
      sport: "Hockey",
      estimatedQuantity: 10,
      hasOwnDesign: false,
      designIds: [designId],
      internalStages: [],
      createdAt: now,
      updatedAt: now,
    });
    const orderFormId = await ctx.db.insert("orderForms", {
      orderId,
      captainId: ownerId,
      sizeOptions: ["M"],
      namesMode: "open",
      customQuestions: [],
      deadline: now + 7 * 86_400_000,
      status: "open",
      createdAt: now,
    });
    const storageId = await ctx.storage.store(
      new Blob(["original-bytes"], { type: "image/png" }),
    );
    const previewStorageId = await ctx.storage.store(
      new Blob(["p"], { type: "image/webp" }),
    );
    const assetId = await ctx.db.insert("designAssets", {
      designId,
      storageId,
      ...(withPreview ? { previewStorageId } : {}),
      filename: "crest.png",
      contentType: "image/png",
      isMain: true,
      uploadedByUserId: ownerId,
      uploadedByAdmin: false,
      createdAt: now,
    });
    return {
      designId,
      orderId,
      orderFormId,
      assetId,
      storageId,
      originalUrl: (await ctx.storage.getUrl(storageId))!,
    };
  });
  return {
    t,
    ...s,
    asOwner: t.withIdentity(identity("owner")),
    asStranger: t.withIdentity(identity("stranger")),
    asStaff: t.withIdentity(identity("staff")),
  };
}

describe("designs.originalUrl", () => {
  it("should give the design's owner the original's URL", async () => {
    const s = await seed(true);
    const url = await s.asOwner.query(api.designs.originalUrl, {
      assetId: s.assetId,
    });
    expect(url).toBe(s.originalUrl);
  });

  it("should give an admin who doesn't own the design the original's URL", async () => {
    const s = await seed(false);
    const url = await s.asStaff.query(api.designs.originalUrl, {
      assetId: s.assetId,
    });
    expect(url).toBe(s.originalUrl);
  });

  it("should refuse a different signed-in captain", async () => {
    const s = await seed(true);
    await expect(
      s.asStranger.query(api.designs.originalUrl, { assetId: s.assetId }),
    ).rejects.toThrow(/access/i);
  });

  it("should refuse a signed-out caller", async () => {
    const s = await seed(true);
    await expect(
      s.t.query(api.designs.originalUrl, { assetId: s.assetId }),
    ).rejects.toThrow();
  });

  it("should return null for an asset that no longer exists", async () => {
    const s = await seed(false);
    await s.t.run((ctx) => ctx.db.delete(s.assetId));
    const url = await s.asOwner.query(api.designs.originalUrl, {
      assetId: s.assetId,
    });
    expect(url).toBeNull();
  });
});

describe.each([
  ["without a preview", false],
  ["with a preview", true],
])("asset reads never carry the original's URL, %s", (_label, withPreview) => {
  // The URL and the storage id are both the file: either one in the JSON fails.
  function expectNoOriginal(value: unknown, s: { originalUrl: string; storageId: Id<"_storage"> }) {
    const json = JSON.stringify(value);
    expect(json.length).toBeGreaterThan(2);
    expect(json).not.toContain(s.originalUrl);
    expect(json).not.toContain(s.storageId);
  }

  it("designs.getMyDesign", async () => {
    const s = await seed(withPreview);
    const r = await s.asOwner.query(api.designs.getMyDesign, {
      designId: s.designId,
    });
    expect(r!.assets).toHaveLength(1);
    expectNoOriginal(r, s);
  });

  it("designs.listMyDesigns", async () => {
    const s = await seed(withPreview);
    const r = await s.asOwner.query(api.designs.listMyDesigns, {});
    expect(r).toHaveLength(1);
    expectNoOriginal(r, s);
  });

  it("orders.getMyOrder", async () => {
    const s = await seed(withPreview);
    const r = await s.asOwner.query(api.orders.getMyOrder, {
      orderId: s.orderId,
    });
    expect(r!.designs).toHaveLength(1);
    expectNoOriginal(r, s);
  });

  it("admin.getOrder", async () => {
    const s = await seed(withPreview);
    const r = await s.asStaff.query(api.admin.getOrder, { orderId: s.orderId });
    expect(r).not.toBeNull();
    expectNoOriginal(r, s);
  });

  it("admin.getDesign", async () => {
    const s = await seed(withPreview);
    const r = await s.asStaff.query(api.admin.getDesign, {
      designId: s.designId,
    });
    expect(r!.assets).toHaveLength(1);
    expectNoOriginal(r, s);
  });

  it("orderForms.getPublic", async () => {
    const s = await seed(withPreview);
    const r = await s.t.query(api.orderForms.getPublic, {
      orderFormId: s.orderFormId,
    });
    expect(r!.designs).toHaveLength(1);
    expectNoOriginal(r, s);
  });
});
