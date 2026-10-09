import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireCurrentUser } from "./_auth";
import {
  canDeleteDesignAsset,
  canUploadDesignAsset,
  isWebSafeImage,
  normalizeContentType,
  normalizeFilename,
  resolveMainAsset,
  toPublicImage,
  type DesignMainImage,
  type PublicDesignImage,
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

// The summary shape a card or a design section reads. `mainImage` is the
// resolved picture (its shape lives in lib/designAsset, shared with the UI) —
// content type travels with it because the resolver may hand back an
// explicitly flagged non-image, and the renderer, not the query, decides
// whether an <img> can show it.
export type DesignAssetSummary = {
  fileCount: number;
  mainImage: DesignMainImage | null;
};

// Everything a summary surface needs about a design's files in one read: how
// many there are, and the one image that represents them (D-07). Resolution
// happens over metadata, so storage is asked for exactly one URL per design —
// the order page shows a thumbnail, not the whole pool.
export async function assetSummariesByDesign(
  ctx: QueryCtx | MutationCtx,
  designIds: readonly Id<"designs">[],
): Promise<Map<Id<"designs">, DesignAssetSummary>> {
  const unique = [...new Set(designIds)];
  const summaries = await Promise.all(
    unique.map(async (designId): Promise<DesignAssetSummary> => {
      const assets = await listDesignAssets(ctx, designId);
      const main = resolveMainAsset(assets);
      return {
        fileCount: assets.length,
        mainImage: main
          ? {
              url: await ctx.storage.getUrl(main.storageId),
              filename: main.filename,
              contentType: main.contentType,
            }
          : null,
      };
    }),
  );
  return new Map(unique.map((designId, i) => [designId, summaries[i]!]));
}

// The public order form's picture per design (0004). Same "which picture"
// answer as `assetSummariesByDesign`, but narrower: a URL is built only for
// a web-safe main, never for any other file, and `toPublicImage` drops it
// when it's over the size cap. No filename or file count leaves here.
export async function publicMainImagesByDesign(
  ctx: QueryCtx | MutationCtx,
  designIds: readonly Id<"designs">[],
): Promise<Map<Id<"designs">, PublicDesignImage | null>> {
  const unique = [...new Set(designIds)];
  const images = await Promise.all(
    unique.map(async (designId): Promise<PublicDesignImage | null> => {
      const main = resolveMainAsset(await listDesignAssets(ctx, designId));
      if (!main || !isWebSafeImage(main.contentType)) return null;
      const file = await ctx.db.system.get("_storage", main.storageId);
      if (!file) return null;
      const url = await ctx.storage.getUrl(main.storageId);
      return toPublicImage(main, file.size, url);
    }),
  );
  return new Map(unique.map((designId, i) => [designId, images[i]!]));
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

// --- Pool management (D-05) -------------------------------------------------
// Upload, set-main and delete are each run on their own from the design
// page, so each needs its own gate. The rules themselves are the pure
// predicates in lib/designAsset; these three functions are where they meet
// the database.

// Upload/edit access: owner or admin (PRD §5). Returns the design so callers
// don't re-fetch it.
export async function requireAssetEditAccess(
  ctx: MutationCtx,
  designId: Id<"designs">,
): Promise<{ user: Doc<"users">; design: Doc<"designs"> }> {
  const user = await requireCurrentUser(ctx);
  const design = await ctx.db.get(designId);
  if (!design) throw new ConvexError("Design not found.");
  if (!canUploadDesignAsset(design, { userId: user._id, isAdmin: user.isAdmin }))
    throw new ConvexError("You don't have access to this design.");
  return { user, design };
}

// Loads an asset the caller is allowed to touch, given the design it hangs
// off. A missing row almost always means someone else deleted the file while
// this page was open, so the message says that rather than blaming the caller.
export async function requireEditableAsset(
  ctx: MutationCtx,
  assetId: Id<"designAssets">,
): Promise<{ user: Doc<"users">; asset: Doc<"designAssets"> }> {
  const asset = await ctx.db.get(assetId);
  if (!asset) throw new ConvexError("That file is no longer on this design.");
  const { user } = await requireAssetEditAccess(ctx, asset.designId);
  return { user, asset };
}

// The design's representative image is a single flag across the row set, so
// setting one clears the rest — otherwise the resolver's "explicit isMain"
// branch would have to break a tie it shouldn't have to.
export async function setMainDesignAsset(
  ctx: MutationCtx,
  asset: Doc<"designAssets">,
): Promise<void> {
  for (const other of await listDesignAssets(ctx, asset.designId)) {
    const isMain = other._id === asset._id;
    if (other.isMain !== isMain) await ctx.db.patch(other._id, { isMain });
  }
}

// Deletes both the row and the bytes. The caller is responsible for the
// permission check and for stripping the id out of the design's galleries —
// see convex/designs.ts removeAsset, which does both in one mutation.
export async function deleteDesignAsset(
  ctx: MutationCtx,
  asset: Doc<"designAssets">,
): Promise<void> {
  await ctx.storage.delete(asset.storageId);
  await ctx.db.delete(asset._id);
}

// Whether this viewer may delete this file — re-exported through the Convex
// layer so a mutation doesn't have to build the viewer shape itself.
export function mayDeleteAsset(
  asset: Doc<"designAssets">,
  user: Doc<"users">,
): boolean {
  return canDeleteDesignAsset(asset, {
    userId: user._id,
    isAdmin: user.isAdmin,
  });
}
