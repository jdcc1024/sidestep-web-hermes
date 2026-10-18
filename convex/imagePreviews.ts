"use node";

// The stored web preview (IMG-03, docs/architecture/0007-image-egress.md
// answer B, option 2): one ≤2048px WebP per uploaded PNG/JPEG/WebP, made once
// so the Next optimizer resizes from ~200 KB instead of re-fetching the print
// file for every (picture, width). Node runtime for sharp
// (`convex.json` `node.externalPackages`); the reads and the write are
// internal functions in convex/imagePreviewsDb.ts.
import sharp from "sharp";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { canOptimize } from "../lib/images";

const BACKFILL_PAGE_SIZE = 100;

// Scheduled by `insertDesignAssets` for each resizable upload, and by
// `backfill`. Reading the original here is the one deliberate in-function file
// read per upload. A corrupt file is logged and skipped rather than thrown:
// the asset just keeps showing its original, and a retry would fail the same.
export const generate = internalAction({
  args: { assetId: v.id("designAssets") },
  handler: async (ctx, { assetId }): Promise<null> => {
    const asset = await ctx.runQuery(internal.imagePreviewsDb.assetForPreview, {
      assetId,
    });
    if (!asset || asset.hasPreview || !canOptimize(asset.contentType))
      return null;

    const original = await ctx.storage.get(asset.storageId);
    if (!original) return null;

    let preview: Buffer;
    try {
      preview = await sharp(Buffer.from(await original.arrayBuffer()))
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (error) {
      console.error(`imagePreviews.generate: can't resize ${assetId}`, error);
      return null;
    }

    const previewStorageId = await ctx.storage.store(
      new Blob([new Uint8Array(preview)], { type: "image/webp" }),
    );
    await ctx.runMutation(internal.imagePreviewsDb.setPreview, {
      assetId,
      sourceStorageId: asset.storageId,
      previewStorageId,
    });
    return null;
  },
});

// Once per deployment, for assets uploaded before IMG-03:
//   npx convex run imagePreviews:backfill
// Schedules `generate` for every resizable asset with no preview and returns
// how many it scheduled. Safe to re-run: `setPreview` drops a duplicate.
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    let scheduled = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: {
        assetIds: Id<"designAssets">[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.imagePreviewsDb.assetsNeedingPreview, {
        paginationOpts: { numItems: BACKFILL_PAGE_SIZE, cursor },
      });
      for (const assetId of page.assetIds) {
        await ctx.scheduler.runAfter(0, internal.imagePreviews.generate, {
          assetId,
        });
        scheduled += 1;
      }
      if (page.isDone) return scheduled;
      cursor = page.continueCursor;
    }
  },
});
