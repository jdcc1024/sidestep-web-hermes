import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrNull, requireCurrentUser } from "./_auth";
import {
  JERSEY_STYLE_MAX_LENGTH,
  isNeckline,
  isSleeveStyle,
} from "../lib/design/rules";
import {
  assetSummariesByDesign,
  countDesignAssets,
  deleteDesignAsset,
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
// match the allowlists in lib/design/rules.
//
// The result is patch-shaped: a key appears only if the caller supplied that
// spec, and its value is `undefined` when they supplied a blank one. Convex
// reads `undefined` in a patch as "remove this field", which is exactly what
// clearing a spec back to undecided means (D-10).
const SPEC_KEYS = ["jerseyStyle", "neckline", "sleeveStyle"] as const;
type SpecKey = (typeof SPEC_KEYS)[number];
type SpecArgs = Partial<Record<SpecKey, string>>;
type SpecPatch = Partial<Record<SpecKey, string | undefined>>;

function normalizeSpecPatch(args: SpecArgs): SpecPatch {
  const patch: SpecPatch = {};

  for (const key of SPEC_KEYS) {
    const value = args[key];
    if (value === undefined) continue;

    const trimmed = value.trim();
    if (!trimmed) {
      patch[key] = undefined;
      continue;
    }
    if (key === "jerseyStyle" && trimmed.length > JERSEY_STYLE_MAX_LENGTH)
      throw new ConvexError("Jersey style is too long.");
    if (key === "neckline" && !isNeckline(trimmed))
      throw new ConvexError("Invalid neckline.");
    if (key === "sleeveStyle" && !isSleeveStyle(trimmed))
      throw new ConvexError("Invalid sleeve style.");

    patch[key] = trimmed;
  }

  return patch;
}

// Insert's view of the same rules. There's no stored field to remove on a
// brand-new design, so an undecided spec is simply not written.
function normalizeSpecs(args: SpecArgs): SpecPatch {
  const patch = normalizeSpecPatch(args);
  for (const key of SPEC_KEYS) if (patch[key] === undefined) delete patch[key];
  return patch;
}

// Captain's own designs, newest first. Mirrors the auth/scoping shape of
// listMyOrders so the portal dashboard can fetch both with the same
// guarantees. Carries the same `{ fileCount, mainImage }` summary the order
// page reads (D-07) — both live in designAssets rather than on the design
// doc, and one summary read resolves exactly one storage URL per design so a
// card can show what the design looks like, not just how many files it has.
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

    const summaries = await assetSummariesByDesign(
      ctx,
      designs.map((d) => d._id),
    );
    return designs.map((design) => {
      const summary = summaries.get(design._id);
      return {
        ...design,
        fileCount: summary?.fileCount ?? 0,
        mainImage: summary?.mainImage ?? null,
      };
    });
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

// The design page's metadata write path (D-10). There is no edit form any
// more — the page saves each field as the captain finishes it — so every
// argument but the id is optional: omitted means "leave it alone", and
// supplied-but-blank means "clear it" for the fields that may be empty.
//
// Nothing here touches the brief or the files. Those have owned their own
// mutations since D-03/D-05, which is what lets a rename land safely while
// the block editor is mid-write on the same design.
export const updateDesign = mutation({
  args: {
    designId: v.id("designs"),
    title: v.optional(v.string()),
    canvaLink: v.optional(v.string()),
    jerseyStyle: v.optional(v.string()),
    neckline: v.optional(v.string()),
    sleeveStyle: v.optional(v.string()),
  },
  handler: async (ctx, { designId, title, canvaLink, ...specArgs }) => {
    const user = await requireCurrentUser(ctx);
    const design = await ctx.db.get(designId);
    if (!design) throw new ConvexError("Design not found.");
    if (design.ownerId !== user._id)
      throw new ConvexError("You don't have access to this design.");

    // `undefined` values are meaningful here (Convex reads them in a patch as
    // "remove this field"), so presence of the key is what decides whether a
    // field is written — never whether its value is defined.
    const patch: SpecPatch & { title?: string; canvaLink?: string } = {};

    if (title !== undefined) patch.title = normalizeTitle(title);
    // normalizeCanvaLink already answers `undefined` for a blank link, which
    // is the clear.
    if (canvaLink !== undefined) patch.canvaLink = normalizeCanvaLink(canvaLink);
    Object.assign(patch, normalizeSpecPatch(specArgs));

    if (Object.keys(patch).length > 0)
      await ctx.db.patch(designId, { ...patch, updatedAt: Date.now() });

    return designId;
  },
});

// ---------------------------------------------------------------------------
// The asset pool's write path (D-05).
//
// The design page manages its own files — upload more, pick the main image,
// delete one — so these three sit alongside the block mutations rather than
// inside a form submit. All three are owner-or-admin, because the portal and
// the admin page mount the same editor (PRD §5); delete asks the narrower
// question on top of that.
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

    // Every design keeps at least one file — createDesign insists on it, and
    // this is the only path that could take one back below that, so it's the
    // only other place the rule has to hold.
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
