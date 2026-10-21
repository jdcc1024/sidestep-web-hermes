// @vitest-environment node
/// <reference types="vite/client" />
// IMG-03 beyond the acceptance tests (imagePreviews.img03.test.ts): the patch
// mutation's guards, what the upload path and the backfill schedule, and the
// captain read's two URLs. Node environment because `backfill` and `generate`
// live in a "use node" module that loads sharp.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import sharp from "sharp";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { overviewBlocks } from "../lib/designBlock";

const modules = import.meta.glob("./**/*.*s");

type Test = TestConvex<typeof schema>;

// Fake timers so a scheduled `generate` stays queued: these tests assert what
// was scheduled, not what it did.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seed() {
  const t = convexTest(schema, modules);
  const { userId, designId } = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkId: "owner",
      email: "owner@example.com",
      name: "Owner",
      isAdmin: false,
      createdAt: now,
    });
    const designId = await ctx.db.insert("designs", {
      ownerId: userId,
      title: "Kit",
      blocks: overviewBlocks("x"),
      createdAt: now,
      updatedAt: now,
    });
    return { userId, designId };
  });
  const asOwner = t.withIdentity({
    subject: "owner",
    email: "owner@example.com",
    name: "Owner",
  });
  return { t, userId, designId, asOwner };
}

const blob = (t: Test, type: string, body: BlobPart = "x") =>
  t.run((ctx) => ctx.storage.store(new Blob([body], { type })));

async function insertAsset(
  t: Test,
  s: { userId: Id<"users">; designId: Id<"designs"> },
  fields: {
    contentType: string;
    storageId?: Id<"_storage">;
    previewStorageId?: Id<"_storage">;
    isMain?: boolean;
  },
) {
  const storageId = fields.storageId ?? (await blob(t, fields.contentType));
  const assetId = await t.run((ctx) =>
    ctx.db.insert("designAssets", {
      designId: s.designId,
      storageId,
      ...(fields.previewStorageId
        ? { previewStorageId: fields.previewStorageId }
        : {}),
      filename: "file",
      contentType: fields.contentType,
      isMain: fields.isMain ?? false,
      uploadedByUserId: s.userId,
      uploadedByAdmin: false,
      createdAt: Date.now(),
    }),
  );
  return { assetId, storageId };
}

const exists = (t: Test, id: Id<"_storage">) =>
  t.run(async (ctx) => (await ctx.db.system.get("_storage", id)) !== null);

const scheduledGenerates = (t: Test) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => /imagePreviews.*generate/.test(job.name))
      .map((job) => (job.args[0] as { assetId: Id<"designAssets"> }).assetId),
  );

describe("imagePreviewsDb.setPreview", () => {
  it("should attach the preview when the row still holds the original it was made from", async () => {
    const s = await seed();
    const { assetId, storageId } = await insertAsset(s.t, s, {
      contentType: "image/png",
    });
    const previewStorageId = await blob(s.t, "image/webp");

    await s.t.mutation(internal.imagePreviewsDb.setPreview, {
      assetId,
      sourceStorageId: storageId,
      previewStorageId,
    });

    const row = await s.t.run((ctx) => ctx.db.get(assetId));
    expect(row?.previewStorageId).toBe(previewStorageId);
    expect(await exists(s.t, previewStorageId)).toBe(true);
  });

  it("should refuse a mismatched sourceStorageId and delete the incoming blob", async () => {
    const s = await seed();
    const { assetId } = await insertAsset(s.t, s, { contentType: "image/png" });
    const otherOriginal = await blob(s.t, "image/png");
    const previewStorageId = await blob(s.t, "image/webp");

    await s.t.mutation(internal.imagePreviewsDb.setPreview, {
      assetId,
      sourceStorageId: otherOriginal,
      previewStorageId,
    });

    const row = await s.t.run((ctx) => ctx.db.get(assetId));
    expect(row?.previewStorageId).toBeUndefined();
    expect(await exists(s.t, previewStorageId)).toBe(false);
  });

  it("should keep an existing preview and delete the incoming blob on a double run", async () => {
    const s = await seed();
    const first = await blob(s.t, "image/webp");
    const { assetId, storageId } = await insertAsset(s.t, s, {
      contentType: "image/png",
      previewStorageId: first,
    });
    const second = await blob(s.t, "image/webp");

    await s.t.mutation(internal.imagePreviewsDb.setPreview, {
      assetId,
      sourceStorageId: storageId,
      previewStorageId: second,
    });

    const row = await s.t.run((ctx) => ctx.db.get(assetId));
    expect(row?.previewStorageId).toBe(first);
    expect(await exists(s.t, first)).toBe(true);
    expect(await exists(s.t, second)).toBe(false);
  });

  it("should delete the incoming blob when the row is gone", async () => {
    const s = await seed();
    const { assetId, storageId } = await insertAsset(s.t, s, {
      contentType: "image/png",
    });
    await s.t.run((ctx) => ctx.db.delete(assetId));
    const previewStorageId = await blob(s.t, "image/webp");

    await s.t.mutation(internal.imagePreviewsDb.setPreview, {
      assetId,
      sourceStorageId: storageId,
      previewStorageId,
    });

    expect(await exists(s.t, previewStorageId)).toBe(false);
  });
});

describe("imagePreviews.generate", () => {
  it("should store a WebP no bigger than 2048 px on its long side", async () => {
    const s = await seed();
    const png = await sharp({
      create: { width: 3000, height: 1200, channels: 3, background: "#c33" },
    })
      .png()
      .toBuffer();
    const { assetId } = await insertAsset(s.t, s, {
      contentType: "image/png",
      storageId: await blob(s.t, "image/png", new Uint8Array(png)),
    });

    await s.t.action(internal.imagePreviews.generate, { assetId });

    const bytes = await s.t.run(async (ctx) => {
      const row = await ctx.db.get(assetId);
      return (await ctx.storage.get(row!.previewStorageId!))!.arrayBuffer();
    });
    const meta = await sharp(Buffer.from(bytes)).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([2048, 819]);
  });

  it("should log and leave no blob when the file isn't a decodable image", async () => {
    const s = await seed();
    const { assetId, storageId } = await insertAsset(s.t, s, {
      contentType: "image/png",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await s.t.action(internal.imagePreviews.generate, { assetId });

    expect(log).toHaveBeenCalled();
    log.mockRestore();
    const row = await s.t.run((ctx) => ctx.db.get(assetId));
    expect(row?.previewStorageId).toBeUndefined();
    const blobs = await s.t.run(async (ctx) =>
      (await ctx.db.system.query("_storage").collect()).map((f) => f._id),
    );
    expect(blobs).toEqual([storageId]);
  });
});

describe("insertDesignAssets scheduling", () => {
  it("should schedule generate for a PNG upload and not for a PDF", async () => {
    const s = await seed();
    const png = await blob(s.t, "image/png");
    const pdf = await blob(s.t, "application/pdf");

    await s.asOwner.mutation(api.designs.addAssets, {
      designId: s.designId,
      files: [
        { storageId: png, filename: "kit.png", contentType: "IMAGE/PNG" },
        { storageId: pdf, filename: "print.pdf", contentType: "application/pdf" },
      ],
    });

    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("designAssets")
        .withIndex("by_design", (q) => q.eq("designId", s.designId))
        .collect(),
    );
    const pngRow = rows.find((r) => r.storageId === png)!;
    expect(await scheduledGenerates(s.t)).toEqual([pngRow._id]);
  });
});

describe("imagePreviews.backfill", () => {
  it("should schedule generate only for resizable assets with no preview", async () => {
    const s = await seed();
    const png = await insertAsset(s.t, s, { contentType: "image/png" });
    const jpeg = await insertAsset(s.t, s, { contentType: "image/jpeg" });
    await insertAsset(s.t, s, {
      contentType: "image/webp",
      previewStorageId: await blob(s.t, "image/webp"),
    });
    await insertAsset(s.t, s, { contentType: "application/pdf" });
    await insertAsset(s.t, s, { contentType: "image/gif" });

    const count = await s.t.action(internal.imagePreviews.backfill, {});

    expect(count).toBe(2);
    expect((await scheduledGenerates(s.t)).sort()).toEqual(
      [png.assetId, jpeg.assetId].sort(),
    );
  });
});

describe("captain reads with a stored preview", () => {
  it("should return displayUrl = preview and url = original from the summary and the design page", async () => {
    const s = await seed();
    const previewStorageId = await blob(s.t, "image/webp");
    const { storageId } = await insertAsset(s.t, s, {
      contentType: "image/png",
      previewStorageId,
      isMain: true,
    });
    const [originalUrl, previewUrl] = await s.t.run(async (ctx) => [
      await ctx.storage.getUrl(storageId),
      await ctx.storage.getUrl(previewStorageId),
    ]);

    const [card] = await s.asOwner.query(api.designs.listMyDesigns, {});
    expect(card!.mainImage).toMatchObject({
      url: originalUrl,
      displayUrl: previewUrl,
    });

    const design = await s.asOwner.query(api.designs.getMyDesign, {
      designId: s.designId,
    });
    expect(design!.assets[0]).toMatchObject({
      url: originalUrl,
      displayUrl: previewUrl,
    });
  });

  it("should give displayUrl null, never the original's URL, while there's no preview (IMG-04)", async () => {
    const s = await seed();
    const { storageId } = await insertAsset(s.t, s, {
      contentType: "image/png",
      isMain: true,
    });
    const originalUrl = await s.t.run((ctx) => ctx.storage.getUrl(storageId));

    const [card] = await s.asOwner.query(api.designs.listMyDesigns, {});
    expect(card!.mainImage!.displayUrl).toBeNull();
    // `url` (the original) stays for downloads until IMG-05.
    expect(card!.mainImage!.url).toBe(originalUrl);

    const design = await s.asOwner.query(api.designs.getMyDesign, {
      designId: s.designId,
    });
    expect(design!.assets[0]!.displayUrl).toBeNull();
  });

  it("getMyDesign: an asset with a preview has the preview's URL as displayUrl and image/webp as its display type (IMG-04)", async () => {
    const s = await seed();
    const previewStorageId = await blob(s.t, "image/webp", "preview-bytes");
    const { storageId } = await insertAsset(s.t, s, {
      contentType: "image/gif",
      storageId: await blob(s.t, "image/gif", "original-bytes"),
      previewStorageId,
      isMain: true,
    });
    const [originalUrl, previewUrl] = await s.t.run(async (ctx) => [
      await ctx.storage.getUrl(storageId),
      await ctx.storage.getUrl(previewStorageId),
    ]);

    const design = await s.asOwner.query(api.designs.getMyDesign, {
      designId: s.designId,
    });
    const asset = design!.assets[0]! as unknown as Record<string, unknown>;
    expect(asset.displayUrl).toBe(previewUrl);
    expect(asset.displayUrl).not.toBe(originalUrl);
    // The display type's field name is the builder's call (IMG-04 step 3).
    // Some field other than `contentType` says image/webp; `contentType`
    // stays the asset's own.
    expect(asset.contentType).toBe("image/gif");
    expect(
      Object.entries(asset).filter(
        ([k, v]) => k !== "contentType" && v === "image/webp",
      ),
      "a display content type field = image/webp",
    ).not.toEqual([]);
  });
});
