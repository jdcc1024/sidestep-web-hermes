import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { canOptimize } from "../lib/images";

// The database half of the stored web preview (IMG-03). The actions in
// convex/imagePreviews.ts run in Node for sharp, and a Node file can't define
// queries or mutations, so their reads and the one write live here. All
// internal: nothing public takes a storage id it didn't issue.

// What `generate` needs to know about one asset, or null when the row is gone.
export const assetForPreview = internalQuery({
  args: { assetId: v.id("designAssets") },
  handler: async (ctx, { assetId }) => {
    const asset = await ctx.db.get(assetId);
    if (!asset) return null;
    return {
      storageId: asset.storageId,
      contentType: asset.contentType,
      hasPreview: asset.previewStorageId !== undefined,
    };
  },
});

// One page of the backfill: ids of resizable assets that have no preview yet.
// There's no index on a missing field, so this scans the table a page at a
// time and filters; the backfill runs once per deployment.
export const assetsNeedingPreview = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db.query("designAssets").paginate(paginationOpts);
    return {
      assetIds: result.page
        .filter(
          (asset) =>
            asset.previewStorageId === undefined &&
            canOptimize(asset.contentType),
        )
        .map((asset) => asset._id),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Attaches a freshly stored preview to the asset it was made from. Only when
// the row still exists, still holds the original the preview was made from,
// and has no preview yet; otherwise the new blob is deleted, so neither a
// delete before the action finished nor a double run (upload + backfill)
// leaves an orphan in storage. Returns whether it attached.
export const setPreview = internalMutation({
  args: {
    assetId: v.id("designAssets"),
    sourceStorageId: v.id("_storage"),
    previewStorageId: v.id("_storage"),
  },
  handler: async (ctx, { assetId, sourceStorageId, previewStorageId }) => {
    const asset = await ctx.db.get(assetId);
    if (
      !asset ||
      asset.storageId !== sourceStorageId ||
      asset.previewStorageId !== undefined
    ) {
      await ctx.storage.delete(previewStorageId);
      return false;
    }
    await ctx.db.patch(assetId, { previewStorageId });
    return true;
  },
});
