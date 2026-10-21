"use node";

// The stored web preview (IMG-03, docs/architecture/0007-image-egress.md
// answer B, option 2): one ≤2048px WebP per uploaded PNG/JPEG/WebP/GIF/SVG,
// made once so the Next optimizer resizes from ~200 KB instead of re-fetching
// the print file for every (picture, width). It is the only picture the app
// ever shows (IMG-04): a GIF becomes its first frame, an SVG a raster. Node
// runtime for sharp (`convex.json` `node.externalPackages`); the reads and the
// write are internal functions in convex/imagePreviewsDb.ts.
import sharp from "sharp";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { PREVIEW_CONTENT_TYPE, canMakePreview } from "../lib/images";
import { normalizeContentType } from "../lib/designAsset";

const BACKFILL_PAGE_SIZE = 100;
const PREVIEW_MAX_PX = 2048;
// SVG metadata is reported at 72 dpi. The cap keeps a tiny viewBox from
// asking librsvg for a gigantic raster before the resize.
const SVG_BASE_DENSITY = 72;
const SVG_MAX_DENSITY = 2400;

// A decoder for the original. Always the in-memory buffer, never a path or a
// URL, so librsvg has no base to resolve an SVG's `file:` or remote
// references against.
async function decoderFor(buf: Buffer, contentType: string) {
  switch (normalizeContentType(contentType)) {
    case "image/gif":
      return sharp(buf, { animated: false });
    case "image/svg+xml": {
      const { width, height } = await sharp(buf).metadata();
      const longSide = Math.max(width ?? 0, height ?? 0);
      const density =
        longSide > 0
          ? Math.min(
              Math.max((SVG_BASE_DENSITY * PREVIEW_MAX_PX) / longSide, 1),
              SVG_MAX_DENSITY,
            )
          : SVG_BASE_DENSITY;
      return sharp(buf, { density });
    }
    default:
      return sharp(buf);
  }
}

// Scheduled by `insertDesignAssets` for each previewable upload, and by
// `backfill`. Reading the original here is the one deliberate in-function file
// read per upload. A corrupt file is logged and skipped rather than thrown:
// the asset keeps its placeholder, and a retry would fail the same.
export const generate = internalAction({
  args: { assetId: v.id("designAssets") },
  handler: async (ctx, { assetId }): Promise<null> => {
    const asset = await ctx.runQuery(internal.imagePreviewsDb.assetForPreview, {
      assetId,
    });
    if (!asset || asset.hasPreview || !canMakePreview(asset.contentType))
      return null;

    const original = await ctx.storage.get(asset.storageId);
    if (!original) return null;

    let preview: Buffer;
    try {
      const decoder = await decoderFor(
        Buffer.from(await original.arrayBuffer()),
        asset.contentType,
      );
      preview = await decoder
        .rotate()
        .resize({
          width: PREVIEW_MAX_PX,
          height: PREVIEW_MAX_PX,
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
      new Blob([new Uint8Array(preview)], { type: PREVIEW_CONTENT_TYPE }),
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
// (and again after IMG-04, for GIF/SVG). Schedules `generate` for every
// previewable asset with no preview and returns
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
