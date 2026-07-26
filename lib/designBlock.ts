// The design brief's block model (D-02). A design's page is an ordered list
// of blocks — named text sections, hand-picked galleries, and one color
// palette — and this module owns everything about that list that doesn't
// need a database: the shapes, the display names, normalization, and the
// rules the Convex mutations enforce.
//
// Deliberately pure and storage-agnostic, mirroring lib/designAsset: the
// shared block editor (D-03/D-04/D-05) validates a draft with the same
// function the server rejects a hand-rolled payload with, so the two sides
// can't drift.

// Text sections are a fixed menu, not free-form titles (PRD §6): the heading
// IS the field, which is what keeps briefs comparable across designs.
// `overview` replaces the old `designs.brief` and is the design's primary
// description — every list, card and admin summary reads it.
export const TEXT_FIELDS = [
  "overview",
  "concept",
  "inspiration",
  "notes",
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const TEXT_FIELD_LABELS: Record<TextField, string> = {
  overview: "Overview",
  concept: "Concept",
  inspiration: "Inspiration",
  notes: "Notes",
};

export const SWATCH_ROLES = ["primary", "secondary", "accent"] as const;
export type SwatchRole = (typeof SWATCH_ROLES)[number];

export const SWATCH_ROLE_LABELS: Record<SwatchRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
};

// What a brand-new swatch opens on. Black rather than a brand color: the
// picker has to start somewhere, and a color nobody would ship reads as "pick
// me" instead of looking like a decision the design already made.
export const DEFAULT_SWATCH_HEX = "#000000";

export const TEXT_BODY_MAX_LENGTH = 2000;
export const CAPTION_MAX_LENGTH = 120;
export const SWATCH_LABEL_MAX_LENGTH = 60;
export const PANTONE_CODE_MAX_LENGTH = 40;

export type TextBlock = {
  id: string;
  kind: "text";
  field: TextField;
  body: string;
};

// `assetIds` point at designAssets rows. Hand-picked and ordered — an asset
// may appear in more than one gallery, and an asset in no gallery is still a
// legitimate file on the design.
export type GalleryBlock = {
  id: string;
  kind: "gallery";
  caption?: string;
  assetIds: string[];
};

// `hex` is the screen approximation; `pantoneCode` is a free-text label that
// production treats as the source of truth. No Pantone dataset or API is
// involved — see PRD §6.
export type Swatch = {
  id: string;
  hex: string;
  role?: SwatchRole;
  label?: string;
  pantoneCode?: string;
};

export type PaletteBlock = {
  id: string;
  kind: "palette";
  caption?: string;
  swatches: Swatch[];
};

export type DesignBlock = TextBlock | GalleryBlock | PaletteBlock;

export function isTextField(value: string): value is TextField {
  return (TEXT_FIELDS as readonly string[]).includes(value);
}

export function isSwatchRole(value: string): value is SwatchRole {
  return (SWATCH_ROLES as readonly string[]).includes(value);
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Canonical form is `#RRGGBB` in uppercase — the way a color reads next to a
// Pantone code on a spec sheet. Accepts what people actually paste: bare
// digits, shorthand, mixed case. Null means "not a color", which the
// validator turns into a user-facing message.
export function normalizeHex(value: string | null | undefined): string | null {
  const match = HEX_PATTERN.exec((value ?? "").trim());
  if (!match) return null;
  const digits = match[1]!;
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  return `#${full.toUpperCase()}`;
}

// Ids only have to be unique within one design's block array, and they're
// minted client-side while editing. randomUUID is the good path; the suffixed
// fallback covers non-secure contexts and older jsdom.
export function newBlockId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// The sections the "add block" menu may still offer, in the fixed menu order
// rather than the order the design happens to use them — the menu should read
// the same every time it opens. Each field is usable at most once (PRD §6), so
// this is exactly TEXT_FIELDS minus what's already on the design.
export function availableTextFields(
  blocks: readonly DesignBlock[],
): TextField[] {
  const used = new Set(
    blocks.filter((block) => block.kind === "text").map((block) => block.field),
  );
  return TEXT_FIELDS.filter((field) => !used.has(field));
}

export function newTextBlock(
  field: TextField,
  body = "",
  makeId: () => string = newBlockId,
): TextBlock {
  return { id: makeId(), kind: "text", field, body };
}

// Overview is the design's description — every list, card and admin summary
// reads it, and validateBlocks refuses an array without one. The editor asks
// this so it can simply not offer a remove button rather than letting someone
// click one that always fails.
export function isRequiredBlock(block: DesignBlock): boolean {
  return block.kind === "text" && block.field === "overview";
}

// --- Palette editing (D-04) -------------------------------------------------
// A design has at most one palette (PRD §6) holding an ordered list of
// swatches, and the four functions below are every edit its rows can make.
// They're pure and return new blocks, so the palette editor is a rendering of
// one draft block plus these transitions — no swatch bookkeeping in the
// component, and the rules stay unit-tested here.

export function hasPalette(blocks: readonly DesignBlock[]): boolean {
  return blocks.some((block) => block.kind === "palette");
}

export function newSwatch(
  hex: string = DEFAULT_SWATCH_HEX,
  makeId: () => string = newBlockId,
): Swatch {
  return { id: makeId(), hex };
}

// An empty palette is storable on purpose: the block lands first and the colors
// arrive as they're picked, the same way an empty gallery waits for its images.
export function newPaletteBlock(
  swatches: Swatch[] = [],
  makeId: () => string = newBlockId,
): PaletteBlock {
  return { id: makeId(), kind: "palette", swatches };
}

export function addSwatch<T extends PaletteBlock>(
  block: T,
  hex?: string,
  makeId: () => string = newBlockId,
): T {
  return { ...block, swatches: [...block.swatches, newSwatch(hex, makeId)] };
}

export function removeSwatchAt<T extends PaletteBlock>(
  block: T,
  index: number,
): T {
  return { ...block, swatches: block.swatches.filter((_, i) => i !== index) };
}

export function moveSwatch<T extends PaletteBlock>(
  block: T,
  from: number,
  to: number,
): T {
  return { ...block, swatches: moveItemTo(block.swatches, from, to) };
}

const OPTIONAL_SWATCH_FIELDS = ["role", "label", "pantoneCode"] as const;

// Edits one swatch in place. A cleared optional field is removed rather than
// left as `undefined` on the object: the swatch that gets sent to Convex should
// simply not carry a role it doesn't have.
export function patchSwatch<T extends PaletteBlock>(
  block: T,
  index: number,
  patch: Partial<Swatch>,
): T {
  const swatches = block.swatches.map((swatch, i) => {
    if (i !== index) return swatch;
    const next: Swatch = { ...swatch, ...patch };
    for (const field of OPTIONAL_SWATCH_FIELDS) {
      if (!next[field]?.trim()) delete next[field];
    }
    return next;
  });
  return { ...block, swatches };
}

export function indexOfBlock(
  blocks: readonly DesignBlock[],
  id: string,
): number {
  return blocks.findIndex((block) => block.id === id);
}

// Reorder is a pure splice, returning a new array. `to` is the index the item
// should end up at, clamped: a drag past the last one means "put it last", not
// "throw". An out-of-range `from` returns the array as-is, which is what a drop
// on an item that just got removed should do. Blocks on the page and swatches
// inside the palette reorder the same way, so they share this.
export function moveItemTo<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  const target = Math.min(Math.max(to, 0), next.length);
  next.splice(target, 0, moved!);
  return next;
}

// Reorder is the whole point of the block model, and the array order IS the
// page order.
export function moveBlockTo<T extends DesignBlock>(
  blocks: readonly T[],
  from: number,
  to: number,
): T[] {
  return moveItemTo(blocks, from, to);
}

export function blockHeading(block: DesignBlock): string {
  switch (block.kind) {
    case "text":
      return TEXT_FIELD_LABELS[block.field] ?? block.field;
    case "gallery":
      return block.caption?.trim() || "Gallery";
    case "palette":
      return block.caption?.trim() || "Palette";
  }
}

// The design's summary line, read by every list and card surface. Empty when
// the design has no Overview — callers render their own empty state rather
// than a placeholder sentence they'd have to keep in sync.
export function overviewOf(blocks: readonly DesignBlock[]): string {
  for (const block of blocks) {
    if (block.kind === "text" && block.field === "overview") return block.body;
  }
  return "";
}

// Writes `body` into the design's Overview section, creating it at the top if
// the design doesn't have one yet and leaving every other block — and the
// order — untouched. The design form edits the Overview and nothing else
// (the full block editor arrives in D-03), so this is how a form submit turns
// one textarea back into a whole block array without losing the rest.
export function withOverview<T extends DesignBlock>(
  blocks: readonly T[],
  body: string,
  makeId: () => string = newBlockId,
): (T | TextBlock)[] {
  const existing = blocks.some(
    (block) => block.kind === "text" && block.field === "overview",
  );
  if (!existing)
    return [{ id: makeId(), kind: "text", field: "overview", body }, ...blocks];

  return blocks.map((block) =>
    block.kind === "text" && block.field === "overview"
      ? { ...block, body }
      : block,
  );
}

// The block array a brand-new design starts life with: just its Overview.
// Every design must have one, so this is the minimum storable brief.
export function overviewBlocks(body: string): TextBlock[] {
  return [{ id: newBlockId(), kind: "text", field: "overview", body }];
}

// Trim what a human typed and canonicalize colors, dropping optional strings
// that came back empty so we never store `caption: ""`. Order is preserved —
// the array order IS the page order. Generic so a caller holding branded
// Convex ids gets the same type back.
export function normalizeBlocks<T extends DesignBlock>(
  blocks: readonly T[],
): T[] {
  return blocks.map((block) => normalizeBlock(block));
}

function normalizeBlock<T extends DesignBlock>(block: T): T {
  // Optional keys are destructured out and re-added only when they survive
  // trimming — spreading alone would leave `caption: "  "` in place. The rest
  // of the spread keeps every field the caller had (including branded id
  // types), so the result is still a T; TS just can't see that through the
  // union.
  switch (block.kind) {
    case "text":
      return { ...block, body: block.body.trim() } as T;
    case "gallery": {
      const { caption, ...rest } = block;
      return { ...rest, ...optionalText("caption", caption) } as T;
    }
    case "palette": {
      const { caption, ...rest } = block;
      return {
        ...rest,
        ...optionalText("caption", caption),
        swatches: block.swatches.map((swatch) => {
          const { label, pantoneCode, ...swatchRest } = swatch;
          return {
            ...swatchRest,
            // An unparseable value is kept verbatim so validateBlocks can name
            // it in the error instead of silently rewriting the user's input.
            hex: normalizeHex(swatch.hex) ?? swatch.hex.trim(),
            ...optionalText("label", label),
            ...optionalText("pantoneCode", pantoneCode),
          };
        }),
      } as T;
    }
  }
}

function optionalText<K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  const trimmed = value?.trim();
  return (trimmed ? { [key]: trimmed } : {}) as Partial<Record<K, string>>;
}

// Returns the first problem as a user-facing sentence, or null when the array
// is storable. One message rather than a field map: blocks are edited one at
// a time, and the server needs exactly one ConvexError string.
export function validateBlocks(blocks: readonly DesignBlock[]): string | null {
  const blockIds = new Set<string>();
  const usedFields = new Set<TextField>();
  let paletteCount = 0;
  let hasOverview = false;

  for (const block of blocks) {
    const id = block.id?.trim();
    if (!id) return "Every block needs an id.";
    if (blockIds.has(id)) return "Two blocks share the same id.";
    blockIds.add(id);

    switch (block.kind) {
      case "text": {
        if (!isTextField(block.field))
          return "That isn't a section we recognize.";
        const label = TEXT_FIELD_LABELS[block.field];
        if (usedFields.has(block.field))
          return `${label} can only appear once.`;
        usedFields.add(block.field);

        const body = block.body.trim();
        if (!body) return `${label} can't be empty.`;
        if (body.length > TEXT_BODY_MAX_LENGTH)
          return `${label} is too long — keep it under ${TEXT_BODY_MAX_LENGTH} characters.`;
        if (block.field === "overview") hasOverview = true;
        break;
      }

      case "gallery": {
        const captionError = checkCaption(block.caption);
        if (captionError) return captionError;
        if (new Set(block.assetIds).size !== block.assetIds.length)
          return "A gallery can only show each file once.";
        break;
      }

      case "palette": {
        paletteCount += 1;
        if (paletteCount > 1) return "A design can only have one palette.";
        const captionError = checkCaption(block.caption);
        if (captionError) return captionError;

        const swatchIds = new Set<string>();
        for (const swatch of block.swatches) {
          const swatchId = swatch.id?.trim();
          if (!swatchId) return "Every swatch needs an id.";
          if (swatchIds.has(swatchId))
            return "Two swatches share the same id.";
          swatchIds.add(swatchId);

          if (!normalizeHex(swatch.hex))
            return "Pick a valid color for every swatch.";
          if (swatch.role !== undefined && !isSwatchRole(swatch.role))
            return "That isn't a swatch role we recognize.";
          if ((swatch.label?.trim().length ?? 0) > SWATCH_LABEL_MAX_LENGTH)
            return `A swatch label is too long — keep it under ${SWATCH_LABEL_MAX_LENGTH} characters.`;
          if (
            (swatch.pantoneCode?.trim().length ?? 0) > PANTONE_CODE_MAX_LENGTH
          )
            return `A Pantone code is too long — keep it under ${PANTONE_CODE_MAX_LENGTH} characters.`;
        }
        break;
      }
    }
  }

  // Last, so a design with a specific broken block hears about that first.
  if (!hasOverview)
    return "Add an Overview section so your design has a description.";

  return null;
}

function checkCaption(caption: string | undefined): string | null {
  if ((caption?.trim().length ?? 0) > CAPTION_MAX_LENGTH)
    return `That caption is too long — keep it under ${CAPTION_MAX_LENGTH} characters.`;
  return null;
}
