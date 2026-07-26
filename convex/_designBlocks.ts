import { ConvexError, v, type Infer } from "convex/values";
import { requireCurrentUser } from "./_auth";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  indexOfBlock,
  normalizeBlocks,
  validateBlocks,
  type DesignBlock,
} from "../lib/designBlock";

// The Convex-side of the design block model (D-02): the stored shape and the
// one function every mutation runs a submitted block array through. The rules
// themselves are pure and live in lib/designBlock, unit-tested there — this
// file exists so the schema, the mutations and the client all agree on the
// wire shape.

const textBlockValidator = v.object({
  id: v.string(),
  kind: v.literal("text"),
  // Written out rather than derived from TEXT_FIELDS because Convex needs
  // literal validators; `prepareBlocks` below is the compile-time proof that
  // this union and lib/designBlock's TextField haven't drifted.
  field: v.union(
    v.literal("overview"),
    v.literal("concept"),
    v.literal("inspiration"),
    v.literal("notes"),
  ),
  body: v.string(),
});

const galleryBlockValidator = v.object({
  id: v.string(),
  kind: v.literal("gallery"),
  caption: v.optional(v.string()),
  // Hand-picked, ordered. Ids may dangle if a file is deleted; read surfaces
  // resolve against the design's own assets and skip what's gone.
  assetIds: v.array(v.id("designAssets")),
});

const paletteBlockValidator = v.object({
  id: v.string(),
  kind: v.literal("palette"),
  caption: v.optional(v.string()),
  swatches: v.array(
    v.object({
      id: v.string(),
      hex: v.string(),
      role: v.optional(
        v.union(
          v.literal("primary"),
          v.literal("secondary"),
          v.literal("accent"),
        ),
      ),
      label: v.optional(v.string()),
      pantoneCode: v.optional(v.string()),
    }),
  ),
});

export const designBlockValidator = v.union(
  textBlockValidator,
  galleryBlockValidator,
  paletteBlockValidator,
);

export const designBlocksValidator = v.array(designBlockValidator);

export type StoredDesignBlock = Infer<typeof designBlockValidator>;

// Normalize then validate, in that order — trimming decides whether a body is
// empty. Throws the validator's message as a ConvexError so the client shows
// the same sentence the editor would have shown before submitting.
//
// The `StoredDesignBlock extends DesignBlock` constraint on normalizeBlocks is
// load-bearing: add a block kind to the validator above without teaching
// lib/designBlock about it and this line stops compiling.
export function prepareBlocks(
  blocks: readonly StoredDesignBlock[],
): StoredDesignBlock[] {
  const normalized = normalizeBlocks<StoredDesignBlock>(blocks);
  const error = validateBlocks(normalized);
  if (error) throw new ConvexError(error);
  return normalized;
}

// The gate every block-editor mutation opens with (D-03). Owner **or** admin,
// because portal and admin mount the same editor (PRD §5) — so the permission
// question is answered in one place rather than once per mutation. Returns the
// design so the caller doesn't need a second db.get.
export async function requireBlockEditAccess(
  ctx: MutationCtx,
  designId: Id<"designs">,
): Promise<{ user: Doc<"users">; design: Doc<"designs"> }> {
  const user = await requireCurrentUser(ctx);
  const design = await ctx.db.get(designId);
  if (!design) throw new ConvexError("Design not found.");
  if (design.ownerId !== user._id && !user.isAdmin)
    throw new ConvexError("You don't have access to this design.");
  return { user, design };
}

// Every block write lands here: normalize + validate the whole array, then
// patch. Nothing else may touch `designs.blocks`, which is what makes "the
// editor and the server can't drift" true for add, edit, remove and reorder
// alike — an operation that produces an unstorable brief is refused rather
// than half-applied.
export async function patchBlocks(
  ctx: MutationCtx,
  designId: Id<"designs">,
  blocks: readonly StoredDesignBlock[],
): Promise<void> {
  await ctx.db.patch(designId, {
    blocks: prepareBlocks(blocks),
    updatedAt: Date.now(),
  });
}

// Locates a block the caller named by id. A missing block almost always means
// someone else removed it while this editor was open, so the message says so
// rather than blaming the request.
export function requireBlockIndex(
  blocks: readonly StoredDesignBlock[],
  blockId: string,
): number {
  const index = indexOfBlock(blocks, blockId);
  if (index < 0)
    throw new ConvexError("That block is no longer on this design.");
  return index;
}

// Re-exported so Convex modules import block helpers from one place.
export type { DesignBlock };
