import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  normalizeContentType,
  normalizeFilename,
  resolveMainAsset,
} from "../lib/designAsset";

// The Convex-side of the design asset model (D-01). Every read of a design's
// files goes through here so the "load rows by index, resolve short-lived
// storage URLs, pick the main image" sequence exists once. Rules that don't
// need a database (web-safe types, the resolver itself, permissions) live in
// lib/designAsset and are unit-tested there.

// What the client sends after the two-phase upload: the storage id plus the
// metadata only the browser knows. Exported as a validator so every mutation
// that accepts uploads declares the same shape.
export const uploadedFileValidator = v.object({
  storageId: v.id("_storage"),
  filename: v.string(),
  contentType: v.string(),
});

export type UploadedFile = {
  storageId: Id<"_storage">;
  filename: string;
  contentType: string;
};

export type ResolvedAsset = Doc<"designAssets"> & { url: string | null };

// Assets in upload order. `createdAt` is the ordering key rather than
// `_creationTime` so a future backfill or re-import can preserve real order.
export async function listDesignAssets(
  ctx: QueryCtx | MutationCtx,
  designId: Id<"designs">,
): Promise<Doc<"designAssets">[]> {
  const assets = await ctx.db
    .query("designAssets")
    .withIndex("by_design", (q) => q.eq("designId", designId))
    .collect();
  return assets.sort((a, b) => a.createdAt - b.createdAt);
}

// Storage URLs are short-lived signed URLs, so they're generated per query.
// A null url means the underlying file is gone — callers render "Unavailable"
// rather than a broken link.
export async function resolveDesignAssets(
  ctx: QueryCtx | MutationCtx,
  designId: Id<"designs">,
): Promise<ResolvedAsset[]> {
  const assets = await listDesignAssets(ctx, designId);
  return Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      url: await ctx.storage.getUrl(asset.storageId),
    })),
  );
}

// The design's representative image, URL already resolved. Null when the
// design has no image at all (docs-only designs are legitimate).
export function mainAssetOf(assets: readonly ResolvedAsset[]) {
  return resolveMainAsset(assets);
}

export async function countDesignAssets(
  ctx: QueryCtx | MutationCtx,
  designId: Id<"designs">,
): Promise<number> {
  return (await listDesignAssets(ctx, designId)).length;
}

// File counts for a list view. Dedupes ids first, then one index read each —
// list surfaces show a handful of designs, and the index keeps each read
// cheap without loading every asset in the table.
export async function fileCountsByDesign(
  ctx: QueryCtx | MutationCtx,
  designIds: readonly Id<"designs">[],
): Promise<Map<Id<"designs">, number>> {
  const unique = [...new Set(designIds)];
  const counts = await Promise.all(
    unique.map((designId) => countDesignAssets(ctx, designId)),
  );
  return new Map(unique.map((designId, i) => [designId, counts[i]!]));
}

// Records uploads against a design. Filename and content type are normalized
// here (blank names and parameterized mime strings both arrive from real
// browsers), and the uploader's admin status is snapshotted so the delete
// rules stay stable if their role changes later.
export async function insertDesignAssets(
  ctx: MutationCtx,
  designId: Id<"designs">,
  files: readonly UploadedFile[],
  uploader: Doc<"users">,
): Promise<void> {
  const now = Date.now();
  for (const [index, file] of files.entries()) {
    await ctx.db.insert("designAssets", {
      designId,
      storageId: file.storageId,
      filename: normalizeFilename(file.filename),
      contentType: normalizeContentType(file.contentType),
      isMain: false,
      uploadedByUserId: uploader._id,
      uploadedByAdmin: uploader.isAdmin,
      // Offset by index so a batch keeps its upload order under the
      // createdAt sort — Date.now() is the same for every row in a batch.
      createdAt: now + index,
    });
  }
}
