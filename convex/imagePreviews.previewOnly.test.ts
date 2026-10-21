// @vitest-environment node
/// <reference types="vite/client" />
// IMG-04 beyond the acceptance tests: GIF/SVG uploads and the backfill get a
// preview scheduled, a preview-less asset carries no display URL (the original
// stays only in `url`, for downloads), and the public form's picture is the
// preview alone. Node environment because `backfill` and `generate` live in a
// "use node" module that loads sharp.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
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
  const { userId, designId, orderFormId } = await t.run(async (ctx) => {
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
    const orderId = await ctx.db.insert("orders", {
      captainId: userId,
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
      captainId: userId,
      sizeOptions: ["M"],
      namesMode: "open",
      customQuestions: [],
      deadline: now + 7 * 86_400_000,
      status: "open",
      createdAt: now,
    });
    return { userId, designId, orderFormId };
  });
  const asOwner = t.withIdentity({
    subject: "owner",
    email: "owner@example.com",
    name: "Owner",
  });
  return { t, userId, designId, orderFormId, asOwner };
}

const blob = (t: Test, type: string, body: BlobPart = "x") =>
  t.run((ctx) => ctx.storage.store(new Blob([body], { type })));

async function insertAsset(
  s: Awaited<ReturnType<typeof seed>>,
  fields: {
    contentType: string;
    previewStorageId?: Id<"_storage">;
    isMain?: boolean;
  },
) {
  const storageId = await blob(s.t, fields.contentType);
  const assetId = await s.t.run((ctx) =>
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

const scheduledGenerates = (t: Test) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => /imagePreviews.*generate/.test(job.name))
      .map((job) => (job.args[0] as { assetId: Id<"designAssets"> }).assetId),
  );

describe("insertDesignAssets scheduling (IMG-04)", () => {
  it("should schedule generate for a GIF and an SVG upload, and still not for a PDF", async () => {
    const s = await seed();
    const gif = await blob(s.t, "image/gif");
    const svg = await blob(s.t, "image/svg+xml");
    const pdf = await blob(s.t, "application/pdf");

    await s.asOwner.mutation(api.designs.addAssets, {
      designId: s.designId,
      files: [
        { storageId: gif, filename: "kit.gif", contentType: "image/gif" },
        {
          storageId: svg,
          filename: "logo.svg",
          contentType: "image/svg+xml; charset=utf-8",
        },
        { storageId: pdf, filename: "print.pdf", contentType: "application/pdf" },
      ],
    });

    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("designAssets")
        .withIndex("by_design", (q) => q.eq("designId", s.designId))
        .collect(),
    );
    const idOf = (storageId: Id<"_storage">) =>
      rows.find((r) => r.storageId === storageId)!._id;
    expect((await scheduledGenerates(s.t)).sort()).toEqual(
      [idOf(gif), idOf(svg)].sort(),
    );
  });
});

describe("backfill / assetsNeedingPreview (IMG-04)", () => {
  it("should include preview-less GIF and SVG assets, and skip a PDF and one that has a preview", async () => {
    const s = await seed();
    const gif = await insertAsset(s, { contentType: "image/gif" });
    const svg = await insertAsset(s, { contentType: "image/svg+xml" });
    await insertAsset(s, { contentType: "application/pdf" });
    await insertAsset(s, {
      contentType: "image/gif",
      previewStorageId: await blob(s.t, "image/webp"),
    });

    const page = await s.t.query(internal.imagePreviewsDb.assetsNeedingPreview, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect([...page.assetIds].sort()).toEqual([gif.assetId, svg.assetId].sort());

    expect(await s.t.action(internal.imagePreviews.backfill, {})).toBe(2);
    expect((await scheduledGenerates(s.t)).sort()).toEqual(
      [gif.assetId, svg.assetId].sort(),
    );
  });
});

describe("captain reads without a preview (IMG-04)", () => {
  it("should give displayUrl and displayContentType null in the summary, with url still the original", async () => {
    const s = await seed();
    const { storageId } = await insertAsset(s, {
      contentType: "image/png",
      isMain: true,
    });
    const originalUrl = await s.t.run((ctx) => ctx.storage.getUrl(storageId));

    const [card] = await s.asOwner.query(api.designs.listMyDesigns, {});
    expect(card!.mainImage).toMatchObject({
      url: originalUrl,
      displayUrl: null,
      displayContentType: null,
      contentType: "image/png",
    });
  });

  it("should give a GIF with a preview the preview's URL and image/webp as its display type, keeping contentType the GIF's", async () => {
    const s = await seed();
    const previewStorageId = await blob(s.t, "image/webp");
    await insertAsset(s, { contentType: "image/gif", previewStorageId, isMain: true });
    const previewUrl = await s.t.run((ctx) => ctx.storage.getUrl(previewStorageId));

    const design = await s.asOwner.query(api.designs.getMyDesign, {
      designId: s.designId,
    });
    expect(design!.assets[0]).toMatchObject({
      contentType: "image/gif",
      displayUrl: previewUrl,
      displayContentType: "image/webp",
    });
  });
});

describe("orderForms.getPublic with a preview (IMG-04)", () => {
  it("should give exactly url + contentType, both the preview's, for a GIF main", async () => {
    const s = await seed();
    // Distinct bytes: convex-test derives a storage URL from the content.
    const previewStorageId = await blob(s.t, "image/webp", "preview-bytes");
    const { storageId } = await insertAsset(s, {
      contentType: "image/gif",
      previewStorageId,
      isMain: true,
    });
    const [originalUrl, previewUrl] = await s.t.run(async (ctx) => [
      await ctx.storage.getUrl(storageId),
      await ctx.storage.getUrl(previewStorageId),
    ]);

    const data = await s.t.query(api.orderForms.getPublic, {
      orderFormId: s.orderFormId,
    });
    const image = data!.designs[0]!.mainImage;
    expect(image).toEqual({ url: previewUrl, contentType: "image/webp" });
    expect(Object.keys(image!).sort()).toEqual(["contentType", "url"]);
    expect(JSON.stringify(data)).not.toContain(originalUrl!);
  });

  it("should give null when the preview's blob is gone", async () => {
    const s = await seed();
    const previewStorageId = await blob(s.t, "image/webp");
    await insertAsset(s, { contentType: "image/png", previewStorageId, isMain: true });
    await s.t.run((ctx) => ctx.storage.delete(previewStorageId));

    const data = await s.t.query(api.orderForms.getPublic, {
      orderFormId: s.orderFormId,
    });
    expect(data!.designs[0]!.mainImage).toBeNull();
  });
});
