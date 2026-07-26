import { ConvexError, v, type Infer } from "convex/values";
import {
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

// Re-exported so Convex modules import block helpers from one place.
export type { DesignBlock };
