import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrNull, requireCurrentUser } from "./_auth";
import {
  JERSEY_STYLE_MAX_LENGTH,
  isNeckline,
  isSleeveStyle,
} from "../lib/design/rules";
import {
  countDesignAssets,
  deleteDesignAsset,
  fileCountsByDesign,
  insertDesignAssets,
  mainAssetOf,
  mayDeleteAsset,
  requireAssetEditAccess,
  requireEditableAsset,
  resolveDesignAssets,
  setMainDesignAsset,
  uploadedFileValidator,
} from "./_designAssets";
import {
  designBlockValidator,
  designBlocksValidator,
  patchBlocks,
  prepareBlocks,
  requireBlockEditAccess,
  requireBlockIndex,
} from "./_designBlocks";
import {
  isRequiredBlock,
  moveBlockTo,
  removeAssetFromBlocks,
} from "../lib/designBlock";

// Server-side guards. Mirror lib/design so the client and server cap
// values the same way — defense in depth against a hand-rolled client that
// posts past the form's maxLength. Spec allowlists/caps come from
// lib/design/rules so the two sides can't drift.
const TITLE_MAX_LENGTH = 120;
const CANVA_LINK_MAX_LENGTH = 500;

function normalizeTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError("Title is required.");
  if (trimmed.length > TITLE_MAX_LENGTH)
    throw new ConvexError("Title is too long.");
  return trimmed;
}

function normalizeCanvaLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > CANVA_LINK_MAX_LENGTH)
    throw new ConvexError("Canva link is too long.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConvexError("Canva link must be a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new ConvexError("Canva link must start with http:// or https://");
  return trimmed;
}

// Silhouette specs are optional per design — a design can be saved before
// its cut is decided. Each spec is validated independently when present:
// jerseyStyle is free text (length-capped), neckline and sleeve style must
// match the allowlists in lib/design/rules. Returns only the specs that
// were supplied so we never write an empty string for an omitted field.
function normalizeSpecs(args: {
  jerseyStyle?: string;
  neckline?: string;
  sleeveStyle?: string;
}): { jerseyStyle?: string; neckline?: string; sleeveStyle?: string } {
  const specs: { jerseyStyle?: string; neckline?: string; sleeveStyle?: string } =
    {};

  if (args.jerseyStyle !== undefined) {
    const trimmed = args.jerseyStyle.trim();
    if (trimmed) {
      if (trimmed.length > JERSEY_STYLE_MAX_LENGTH)
        throw new ConvexError("Jersey style is too long.");
      specs.jerseyStyle = trimmed;
    }
  }

  if (args.neckline !== undefined && args.neckline.trim()) {
    if (!isNeckline(args.neckline)) throw new ConvexError("Invalid neckline.");
    specs.neckline = args.neckline;
  }

  if (args.sleeveStyle !== undefined && args.sleeveStyle.trim()) {
    if (!isSleeveStyle(args.sleeveStyle))
      throw new ConvexError("Invalid sleeve style.");
    specs.sleeveStyle = args.sleeveStyle;
  }

  return specs;
}

// Captain's own designs, newest first. Mirrors the auth/scoping shape of
// listMyOrders so the portal dashboard can fetch both with the same
// guarantees. Carries `fileCount` because every list surface shows it and
// the count now lives in designAssets rather than on the design doc.
export const listMyDesigns = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return [];

    const designs = await ctx.db
      .query("designs")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    const counts = await fileCountsByDesign(
      ctx,
      designs.map((d) => d._id),
    );
    return designs.map((design) => ({
      ...design,
      fileCount: counts.get(design._id) ?? 0,
    }));
  },
});

// Fetches one design with its assets already resolved (metadata + a
// short-lived storage URL each) so the detail page can render thumbnails and
// download links without a round-trip per file. `mainAsset` is the resolved
// representative image — the same answer the order page will show (D-07).
// Returns null for an unauthenticated caller or a not-found id; throws on
// access violation so the UI can surface "you don't have access" instead
// of silently rendering empty.
export const getMyDesign = query({
  args: { designId: v.id("designs") },
  handler: async (ctx, { designId }) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;

    const design = await ctx.db.get(designId);
    if (!design) return null;
    if (design.ownerId !== user._id)
      throw new ConvexError("You don't have access to this design.");

    const assets = await resolveDesignAssets(ctx, designId);

    return {
      ...design,
      assets,
      mainAsset: mainAssetOf(assets),
      // The asset pool (D-05) decides per file whether to offer a delete
      // button, and that answer depends on who's asking — an admin-uploaded
      // file is admin-delete-only. Shipping the viewer with the design keeps
      // the client running the very predicate the mutation will re-run.
      viewer: { userId: user._id, isAdmin: user.isAdmin },
    };
  },
});

// Two-phase upload — step 1: client asks for a signed URL to PUT the file
// to, step 2: client calls createDesign with the returned storage ids.
// Auth is checked here so unauthenticated visitors can't generate upload
// URLs and stuff our bucket.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCurrentUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const createDesign = mutation({
  args: {
    title: v.string(),
    // The structured brief (D-02). Must contain an Overview text block —
    // prepareBlocks enforces that, so every design has a summary from birth.
    blocks: designBlocksValidator,
    canvaLink: v.optional(v.string()),
    // Uploaded files carry their own metadata now (D-01) — the client sends
    // filename + content type alongside each storage id, and the server
    // records who uploaded them.
    files: v.array(uploadedFileValidator),
    jerseyStyle: v.optional(v.string()),
    neckline: v.optional(v.string()),
    sleeveStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);

    const title = normalizeTitle(args.title);
    const blocks = prepareBlocks(args.blocks);
    const canvaLink = normalizeCanvaLink(args.canvaLink);
    const specs = normalizeSpecs(args);

    if (args.files.length < 1)
      throw new ConvexError("At least one file is required.");

    const now = Date.now();
    const designId = await ctx.db.insert("designs", {
      ownerId: user._id,
      title,
      blocks,
      ...(canvaLink ? { canvaLink } : {}),
      ...specs,
      createdAt: now,
      updatedAt: now,
    });

    await insertDesignAssets(ctx, designId, args.files, user);

    return designId;
  },
});

// Edit mode. Updates the metadata fields and appends any newly uploaded
// files. Pass an empty addFileIds array to update metadata only.
export const updateDesign = mutation({
  args: {
    designId: v.id("designs"),
    title: v.string(),
    // Optional, and normally omitted: the brief is edited block-by-block
    // through the mutations below (D-03), so a form submit that only changed
    // the title must not carry a stale array over the editor's work. Create
    // still sends blocks — that's where the required Overview is authored.
    blocks: v.optional(designBlocksValidator),
    canvaLink: v.optional(v.string()),
    addFiles: v.array(uploadedFileValidator),
    jerseyStyle: v.optional(v.string()),
    neckline: v.optional(v.string()),
    sleeveStyle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const design = await ctx.db.get(args.designId);
    if (!design) throw new ConvexError("Design not found.");
    if (design.ownerId !== user._id)
      throw new ConvexError("You don't have access to this design.");

    const title = normalizeTitle(args.title);
    const blocks = args.blocks ? prepareBlocks(args.blocks) : undefined;
    const canvaLink = normalizeCanvaLink(args.canvaLink);
    const specs = normalizeSpecs(args);

    // The guard reads the stored rows, not the submitted array: a metadata-only
    // edit sends no files, and the design still has to end up with at least one.
    const existingCount = await countDesignAssets(ctx, args.designId);
    if (existingCount + args.addFiles.length < 1)
      throw new ConvexError("At least one file is required.");

    await insertDesignAssets(ctx, args.designId, args.addFiles, user);

    await ctx.db.patch(args.designId, {
      title,
      ...(blocks ? { blocks } : {}),
      // Convex `patch` doesn't accept undefined for optional fields — pass
      // an explicit string (possibly empty) and let the schema/optional do
      // the rest. We use the normalized value or fall back to clearing.
      ...(canvaLink ? { canvaLink } : { canvaLink: undefined }),
      // Apply any supplied silhouette specs; omitted specs are left as-is.
      ...specs,
      updatedAt: Date.now(),
    });

    return args.designId;
  },
});

// ---------------------------------------------------------------------------
// The asset pool's write path (D-05).
//
// The design page manages its own files now — upload more, pick the main
// image, delete one — so these three sit alongside the block mutations rather
// than inside the edit form's `updateDesign`. All three are owner-or-admin,
// because the portal and the admin page mount the same editor (PRD §5);
// delete asks the narrower question on top of that.
// ---------------------------------------------------------------------------

export const addAssets = mutation({
  args: { designId: v.id("designs"), files: v.array(uploadedFileValidator) },
  handler: async (ctx, { designId, files }) => {
    const { user } = await requireAssetEditAccess(ctx, designId);
    await insertDesignAssets(ctx, designId, files, user);
  },
});

// Explicit main image. One flag across the design's rows, so this clears the
// previous pick — the D-01 resolver then reports it everywhere, order page
// included.
export const setMainAsset = mutation({
  args: { assetId: v.id("designAssets") },
  handler: async (ctx, { assetId }) => {
    const { asset } = await requireEditableAsset(ctx, assetId);
    await setMainDesignAsset(ctx, asset);
  },
});

// Delete is the narrow one: an admin may remove anything, a captain only
// files they uploaded themselves, and never one staff uploaded (PRD §5).
// Removing the file also strips its id out of every gallery that hand-picked
// it, in this same mutation — a gallery is never left pointing at a file
// that's gone.
export const removeAsset = mutation({
  args: { assetId: v.id("designAssets") },
  handler: async (ctx, { assetId }) => {
    const { user, asset } = await requireEditableAsset(ctx, assetId);

    if (!mayDeleteAsset(asset, user))
      throw new ConvexError(
        "Sidestep uploaded this file, so only Sidestep can remove it.",
      );

    // Every design keeps at least one file — createDesign and updateDesign
    // both insist on it, and a design that deleted its way to zero could no
    // longer be saved from the edit form at all.
    if ((await countDesignAssets(ctx, asset.designId)) <= 1)
      throw new ConvexError(
        "A design keeps at least one file — upload another before removing this one.",
      );

    await deleteDesignAsset(ctx, asset);

    const design = await ctx.db.get(asset.designId);
    if (design) {
      const blocks = removeAssetFromBlocks(design.blocks, assetId);
      // Only write when a gallery actually referenced it, so deleting a file
      // nobody picked doesn't bump the design's updatedAt.
      if (blocks.some((block, i) => block !== design.blocks[i]))
        await patchBlocks(ctx, asset.designId, blocks);
    }
  },
});

// ---------------------------------------------------------------------------
// The block editor's write path (D-03).
//
// Four narrow mutations rather than one "save the whole brief": the editor
// sends the change it made, not an array it may have been holding while
// someone else edited. Each one reads the stored blocks, applies one
// operation, and hands the result to `patchBlocks`, which is the only place
// `designs.blocks` is ever written — so add, edit, remove and reorder all
// re-run the D-02 validators and all answer the same owner-or-admin question.
// ---------------------------------------------------------------------------

export const addBlock = mutation({
  args: { designId: v.id("designs"), block: designBlockValidator },
  handler: async (ctx, { designId, block }) => {
    const { design } = await requireBlockEditAccess(ctx, designId);
    // Appended, not inserted: a new section lands at the bottom and the owner
    // drags it where it belongs. Duplicate fields, a second palette and a
    // colliding id are all the validator's calls, not ours.
    await patchBlocks(ctx, designId, [...design.blocks, block]);
  },
});

export const updateBlock = mutation({
  args: { designId: v.id("designs"), block: designBlockValidator },
  handler: async (ctx, { designId, block }) => {
    const { design } = await requireBlockEditAccess(ctx, designId);
    const index = requireBlockIndex(design.blocks, block.id);

    // Position is the array's business (moveBlock's), so an edit rewrites in
    // place. Kind is fixed at add time — a text section can't become a
    // gallery, which would silently discard its body.
    if (design.blocks[index]!.kind !== block.kind)
      throw new ConvexError("A block can't change kind.");

    const blocks = [...design.blocks];
    blocks[index] = block;
    await patchBlocks(ctx, designId, blocks);
  },
});

export const removeBlock = mutation({
  args: { designId: v.id("designs"), blockId: v.string() },
  handler: async (ctx, { designId, blockId }) => {
    const { design } = await requireBlockEditAccess(ctx, designId);
    const index = requireBlockIndex(design.blocks, blockId);

    // `prepareBlocks` would refuse an Overview-less brief anyway; catching it
    // here means the error names the section instead of describing the array.
    if (isRequiredBlock(design.blocks[index]!))
      throw new ConvexError(
        "The Overview is your design's description — it can't be removed.",
      );

    await patchBlocks(ctx, designId, design.blocks.toSpliced(index, 1));
  },
});

// Reorder. The array order IS the page order (PRD §6), so this is a splice —
// `toIndex` is where the block should end up, clamped, because a drop past the
// last block means "put it last".
export const moveBlock = mutation({
  args: {
    designId: v.id("designs"),
    blockId: v.string(),
    toIndex: v.number(),
  },
  handler: async (ctx, { designId, blockId, toIndex }) => {
    const { design } = await requireBlockEditAccess(ctx, designId);
    const from = requireBlockIndex(design.blocks, blockId);
    await patchBlocks(ctx, designId, moveBlockTo(design.blocks, from, toIndex));
  },
});
