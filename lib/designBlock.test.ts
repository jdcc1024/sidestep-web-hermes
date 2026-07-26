import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX_LENGTH,
  DEFAULT_SWATCH_HEX,
  PANTONE_CODE_MAX_LENGTH,
  SWATCH_LABEL_MAX_LENGTH,
  TEXT_BODY_MAX_LENGTH,
  TEXT_FIELDS,
  TEXT_FIELD_LABELS,
  addSwatch,
  availableTextFields,
  blockHeading,
  hasPalette,
  indexOfBlock,
  isRequiredBlock,
  isSwatchRole,
  isTextField,
  moveBlockTo,
  moveSwatch,
  newBlockId,
  newGalleryBlock,
  newPaletteBlock,
  newSwatch,
  newTextBlock,
  normalizeBlocks,
  normalizeHex,
  overviewOf,
  patchSwatch,
  removeAssetFromBlocks,
  removeSwatchAt,
  toggleGalleryAsset,
  validateBlocks,
  withOverview,
  type DesignBlock,
  type GalleryBlock,
  type PaletteBlock,
  type TextBlock,
} from "./designBlock";

function text(overrides: Partial<TextBlock> = {}): TextBlock {
  return {
    id: "b-text",
    kind: "text",
    field: "overview",
    body: "Navy and gold, bold numbers.",
    ...overrides,
  };
}

function gallery(overrides: Partial<GalleryBlock> = {}): GalleryBlock {
  return { id: "b-gallery", kind: "gallery", assetIds: ["a1"], ...overrides };
}

function palette(overrides: Partial<PaletteBlock> = {}): PaletteBlock {
  return {
    id: "b-palette",
    kind: "palette",
    swatches: [{ id: "s1", hex: "#102A44" }],
    ...overrides,
  };
}

// Every valid arrangement starts from a design that has its required
// Overview, so a test only has to state the thing it's actually varying.
function blocks(...rest: DesignBlock[]): DesignBlock[] {
  return [text(), ...rest];
}

describe("availableTextFields", () => {
  it("offers every section on an empty design", () => {
    expect(availableTextFields([])).toEqual([...TEXT_FIELDS]);
  });

  it("drops sections the design already uses", () => {
    const used = [text(), text({ id: "b2", field: "notes", body: "Later." })];
    expect(availableTextFields(used)).toEqual(["concept", "inspiration"]);
  });

  it("returns nothing once all four sections are used", () => {
    const all = TEXT_FIELDS.map((field) =>
      text({ id: `b-${field}`, field, body: "x" }),
    );
    expect(availableTextFields(all)).toEqual([]);
  });

  it("keeps the fixed menu order regardless of block order", () => {
    const reversed = [
      text({ id: "b1", field: "notes", body: "n" }),
      text({ id: "b2", field: "overview", body: "o" }),
    ];
    expect(availableTextFields(reversed)).toEqual(["concept", "inspiration"]);
  });

  it("ignores gallery and palette blocks", () => {
    expect(availableTextFields([gallery(), palette()])).toEqual([
      ...TEXT_FIELDS,
    ]);
  });
});

describe("newTextBlock", () => {
  it("mints a text block for the requested section", () => {
    const block = newTextBlock("concept", "Retro stripes.", () => "fixed-id");
    expect(block).toEqual({
      id: "fixed-id",
      kind: "text",
      field: "concept",
      body: "Retro stripes.",
    });
  });

  it("starts with an empty body when none is given", () => {
    expect(newTextBlock("notes").body).toBe("");
  });
});

describe("isRequiredBlock", () => {
  it("marks the Overview section required — every list reads it", () => {
    expect(isRequiredBlock(text({ field: "overview" }))).toBe(true);
  });

  it("leaves the other sections removable", () => {
    expect(isRequiredBlock(text({ field: "concept" }))).toBe(false);
    expect(isRequiredBlock(gallery())).toBe(false);
    expect(isRequiredBlock(palette())).toBe(false);
  });
});

describe("indexOfBlock", () => {
  it("finds a block by id", () => {
    expect(indexOfBlock(blocks(gallery({ id: "g1" })), "g1")).toBe(1);
  });

  it("returns -1 for an id that isn't on the design", () => {
    expect(indexOfBlock(blocks(), "nope")).toBe(-1);
  });
});

describe("moveBlockTo", () => {
  const three = [
    text({ id: "a" }),
    gallery({ id: "b" }),
    palette({ id: "c" }),
  ];
  const ids = (list: readonly DesignBlock[]) => list.map((b) => b.id);

  it("moves a block down to the requested index", () => {
    expect(ids(moveBlockTo(three, 0, 2))).toEqual(["b", "c", "a"]);
  });

  it("moves a block up to the requested index", () => {
    expect(ids(moveBlockTo(three, 2, 0))).toEqual(["c", "a", "b"]);
  });

  it("clamps a destination past the end", () => {
    expect(ids(moveBlockTo(three, 0, 99))).toEqual(["b", "c", "a"]);
  });

  it("clamps a negative destination to the top", () => {
    expect(ids(moveBlockTo(three, 2, -5))).toEqual(["c", "a", "b"]);
  });

  it("is a no-op when the block is already there", () => {
    expect(ids(moveBlockTo(three, 1, 1))).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    moveBlockTo(three, 0, 2);
    expect(ids(three)).toEqual(["a", "b", "c"]);
  });

  it("returns the array unchanged for an out-of-range source", () => {
    expect(ids(moveBlockTo(three, 7, 0))).toEqual(["a", "b", "c"]);
  });
});

describe("normalizeHex", () => {
  it("uppercases and prefixes a bare six-digit hex", () => {
    expect(normalizeHex("102a44")).toBe("#102A44");
  });

  it("expands three-digit shorthand", () => {
    expect(normalizeHex("#0af")).toBe("#00AAFF");
  });

  it("tolerates surrounding whitespace", () => {
    expect(normalizeHex("  #102A44  ")).toBe("#102A44");
  });

  it("returns null for a value that isn't a hex color", () => {
    expect(normalizeHex("rebeccapurple")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("#gggggg")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("field and role guards", () => {
  it("accepts every declared text field and rejects anything else", () => {
    for (const field of TEXT_FIELDS) expect(isTextField(field)).toBe(true);
    expect(isTextField("brief")).toBe(false);
  });

  it("accepts the three swatch roles and rejects anything else", () => {
    expect(isSwatchRole("primary")).toBe(true);
    expect(isSwatchRole("accent")).toBe(true);
    expect(isSwatchRole("tertiary")).toBe(false);
  });

  it("labels every text field", () => {
    for (const field of TEXT_FIELDS)
      expect(TEXT_FIELD_LABELS[field]).toBeTruthy();
  });
});

describe("newBlockId", () => {
  it("returns distinct non-empty ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newBlockId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});

describe("blockHeading", () => {
  it("uses the field's display name for a text block", () => {
    expect(blockHeading(text({ field: "inspiration" }))).toBe("Inspiration");
  });

  it("uses the caption for a gallery, falling back to a generic heading", () => {
    expect(blockHeading(gallery({ caption: "Mood board" }))).toBe("Mood board");
    expect(blockHeading(gallery())).toBe("Gallery");
  });

  it("uses the caption for a palette, falling back to a generic heading", () => {
    expect(blockHeading(palette({ caption: "Kit colors" }))).toBe("Kit colors");
    expect(blockHeading(palette())).toBe("Palette");
  });
});

describe("overviewOf", () => {
  it("returns the body of the overview text block", () => {
    expect(overviewOf(blocks(gallery()))).toBe("Navy and gold, bold numbers.");
  });

  it("returns an empty string when there is no overview", () => {
    expect(overviewOf([gallery(), palette()])).toBe("");
    expect(overviewOf([])).toBe("");
  });

  it("ignores other text sections", () => {
    const notes = text({ id: "b2", field: "notes", body: "Ship by June." });
    expect(overviewOf([gallery(), notes])).toBe("");
  });
});

describe("withOverview", () => {
  it("adds an overview at the top when the design has none", () => {
    const result = withOverview([gallery()], "Navy kit", () => "new-id");
    expect(result[0]).toEqual({
      id: "new-id",
      kind: "text",
      field: "overview",
      body: "Navy kit",
    });
    expect(result[1]).toEqual(gallery());
  });

  it("replaces the body of an existing overview in place", () => {
    const result = withOverview(
      [gallery(), text({ id: "keep-me" }), palette()],
      "Rewritten",
    );
    expect(result.map((b) => b.id)).toEqual([
      "b-gallery",
      "keep-me",
      "b-palette",
    ]);
    expect(overviewOf(result)).toBe("Rewritten");
  });

  it("leaves other text sections alone", () => {
    const notes = text({ id: "b-notes", field: "notes", body: "Ship by June." });
    const result = withOverview([text(), notes], "Rewritten");
    expect(result).toContainEqual(notes);
  });
});

describe("normalizeBlocks", () => {
  it("trims text bodies", () => {
    const [block] = normalizeBlocks([text({ body: "  Navy kit  " })]);
    expect((block as TextBlock).body).toBe("Navy kit");
  });

  it("drops a caption that is only whitespace", () => {
    const [block] = normalizeBlocks([gallery({ caption: "   " })]);
    expect(block).not.toHaveProperty("caption");
  });

  it("keeps and trims a real caption", () => {
    const [block] = normalizeBlocks([gallery({ caption: " Mood board " })]);
    expect((block as GalleryBlock).caption).toBe("Mood board");
  });

  it("normalizes every swatch hex and drops blank labels", () => {
    const [block] = normalizeBlocks([
      palette({
        swatches: [
          { id: "s1", hex: "102a44", label: "  ", pantoneCode: " 289 C " },
        ],
      }),
    ]);
    const swatch = (block as PaletteBlock).swatches[0]!;
    expect(swatch.hex).toBe("#102A44");
    expect(swatch).not.toHaveProperty("label");
    expect(swatch.pantoneCode).toBe("289 C");
  });

  it("leaves an unrecognizable hex alone so validation can report it", () => {
    const [block] = normalizeBlocks([
      palette({ swatches: [{ id: "s1", hex: "not-a-color" }] }),
    ]);
    expect((block as PaletteBlock).swatches[0]!.hex).toBe("not-a-color");
  });

  it("preserves block order", () => {
    const input = blocks(gallery(), palette());
    expect(normalizeBlocks(input).map((b) => b.id)).toEqual(
      input.map((b) => b.id),
    );
  });
});

describe("validateBlocks", () => {
  it("accepts a design with one of each block kind", () => {
    expect(validateBlocks(blocks(gallery(), palette()))).toBeNull();
  });

  it("accepts every optional text section alongside the overview", () => {
    const optional = TEXT_FIELDS.filter((f) => f !== "overview").map((field) =>
      text({ id: `b-${field}`, field, body: `About ${field}` }),
    );
    expect(validateBlocks([text(), ...optional])).toBeNull();
  });

  it("requires an overview section", () => {
    expect(validateBlocks([gallery()])).toMatch(/overview/i);
    expect(validateBlocks([])).toMatch(/overview/i);
  });

  it("rejects an overview whose body is empty", () => {
    expect(validateBlocks([text({ body: "" })])).toMatch(/overview/i);
  });

  it("rejects a text section used twice", () => {
    const twice = [text(), text({ id: "b2", field: "notes", body: "One" }),
      text({ id: "b3", field: "notes", body: "Two" })];
    expect(validateBlocks(twice)).toMatch(/notes/i);
  });

  it("rejects an unknown text field", () => {
    const rogue = { ...text({ id: "b2" }), field: "budget" } as unknown as TextBlock;
    expect(validateBlocks([text(), rogue])).toBeTruthy();
  });

  it("rejects an empty body on an optional section", () => {
    expect(
      validateBlocks(blocks(text({ id: "b2", field: "concept", body: "  " }))),
    ).toMatch(/concept/i);
  });

  it("rejects a body over the max length", () => {
    const long = text({ body: "x".repeat(TEXT_BODY_MAX_LENGTH + 1) });
    expect(validateBlocks([long])).toMatch(/too long/i);
  });

  it("accepts a body at exactly the max length", () => {
    expect(
      validateBlocks([text({ body: "x".repeat(TEXT_BODY_MAX_LENGTH) })]),
    ).toBeNull();
  });

  it("rejects a second palette block", () => {
    expect(
      validateBlocks(blocks(palette(), palette({ id: "b-palette-2" }))),
    ).toMatch(/one palette/i);
  });

  it("rejects a swatch with an invalid hex", () => {
    expect(
      validateBlocks(
        blocks(palette({ swatches: [{ id: "s1", hex: "navy" }] })),
      ),
    ).toMatch(/color/i);
  });

  it("rejects a swatch with an unknown role", () => {
    const rogue = palette({
      swatches: [
        { id: "s1", hex: "#102A44", role: "tertiary" as PaletteBlock["swatches"][number]["role"] },
      ],
    });
    expect(validateBlocks(blocks(rogue))).toMatch(/role/i);
  });

  it("accepts each declared swatch role", () => {
    const swatches = (["primary", "secondary", "accent"] as const).map(
      (role, i) => ({ id: `s${i}`, hex: "#102A44", role }),
    );
    expect(validateBlocks(blocks(palette({ swatches })))).toBeNull();
  });

  it("accepts a palette with no swatches yet", () => {
    expect(validateBlocks(blocks(palette({ swatches: [] })))).toBeNull();
  });

  it("rejects duplicate swatch ids", () => {
    const dupes = palette({
      swatches: [
        { id: "s1", hex: "#102A44" },
        { id: "s1", hex: "#FFFFFF" },
      ],
    });
    expect(validateBlocks(blocks(dupes))).toMatch(/id/i);
  });

  it("rejects duplicate block ids", () => {
    expect(validateBlocks([text(), gallery({ id: "b-text" })])).toMatch(/id/i);
  });

  it("rejects a block with a blank id", () => {
    expect(validateBlocks([text({ id: " " })])).toMatch(/id/i);
  });

  it("accepts a gallery with no images yet", () => {
    expect(validateBlocks(blocks(gallery({ assetIds: [] })))).toBeNull();
  });

  it("rejects the same asset twice in one gallery", () => {
    expect(
      validateBlocks(blocks(gallery({ assetIds: ["a1", "a1"] }))),
    ).toBeTruthy();
  });

  it("allows one asset to appear in two galleries", () => {
    expect(
      validateBlocks(
        blocks(
          gallery({ id: "g1", assetIds: ["a1"] }),
          gallery({ id: "g2", assetIds: ["a1"] }),
        ),
      ),
    ).toBeNull();
  });

  it("rejects an over-long caption", () => {
    expect(
      validateBlocks(
        blocks(gallery({ caption: "x".repeat(CAPTION_MAX_LENGTH + 1) })),
      ),
    ).toMatch(/too long/i);
  });

  it("rejects an over-long swatch label or Pantone code", () => {
    const longLabel = palette({
      swatches: [
        {
          id: "s1",
          hex: "#102A44",
          label: "x".repeat(SWATCH_LABEL_MAX_LENGTH + 1),
        },
      ],
    });
    const longCode = palette({
      swatches: [
        {
          id: "s1",
          hex: "#102A44",
          pantoneCode: "x".repeat(PANTONE_CODE_MAX_LENGTH + 1),
        },
      ],
    });
    expect(validateBlocks(blocks(longLabel))).toMatch(/too long/i);
    expect(validateBlocks(blocks(longCode))).toMatch(/too long/i);
  });
});

// --- Palette editing (D-04) -------------------------------------------------
// The swatch list is edited entirely through these four pure functions, so the
// palette editor's behaviour is specified here rather than through the DOM.

describe("hasPalette", () => {
  it("is true once the design carries its one palette", () => {
    expect(hasPalette(blocks(palette()))).toBe(true);
  });

  it("is false for a design of text and galleries", () => {
    expect(hasPalette(blocks(gallery()))).toBe(false);
  });
});

describe("newSwatch", () => {
  it("starts from a neutral default the picker can open on", () => {
    const swatch = newSwatch(undefined, () => "s-new");
    expect(swatch).toEqual({ id: "s-new", hex: DEFAULT_SWATCH_HEX });
  });

  it("carries no role, label or Pantone code until one is typed", () => {
    const swatch = newSwatch("#102A44");
    expect(swatch.hex).toBe("#102A44");
    expect(swatch).not.toHaveProperty("role");
    expect(swatch).not.toHaveProperty("label");
    expect(swatch).not.toHaveProperty("pantoneCode");
  });

  it("mints a distinct id per swatch", () => {
    expect(newSwatch().id).not.toBe(newSwatch().id);
  });
});

describe("newPaletteBlock", () => {
  it("is storable straight away — an empty palette is a valid block", () => {
    const block = newPaletteBlock([], () => "b-new");
    expect(block).toEqual({ id: "b-new", kind: "palette", swatches: [] });
    expect(validateBlocks([text(), block])).toBeNull();
  });
});

describe("addSwatch", () => {
  it("appends a new swatch, leaving the existing ones in order", () => {
    const next = addSwatch(palette(), undefined, () => "s2");
    expect(next.swatches.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(next.swatches[1]!.hex).toBe(DEFAULT_SWATCH_HEX);
  });

  it("keeps the block's caption and id", () => {
    const next = addSwatch(palette({ caption: "Kit colors" }));
    expect(next.id).toBe("b-palette");
    expect(next.caption).toBe("Kit colors");
  });

  it("does not mutate the block it was given", () => {
    const block = palette();
    addSwatch(block);
    expect(block.swatches).toHaveLength(1);
  });
});

describe("removeSwatchAt", () => {
  it("drops the swatch at that position", () => {
    const block = palette({
      swatches: [
        { id: "s1", hex: "#102A44" },
        { id: "s2", hex: "#FFFFFF" },
      ],
    });
    expect(removeSwatchAt(block, 0).swatches.map((s) => s.id)).toEqual(["s2"]);
  });

  it("leaves the palette alone for an index that isn't there", () => {
    expect(removeSwatchAt(palette(), 4).swatches).toHaveLength(1);
  });
});

describe("moveSwatch", () => {
  const three = palette({
    swatches: [
      { id: "s1", hex: "#111111" },
      { id: "s2", hex: "#222222" },
      { id: "s3", hex: "#333333" },
    ],
  });

  it("reorders the swatches — the array order is the palette's order", () => {
    expect(moveSwatch(three, 2, 0).swatches.map((s) => s.id)).toEqual([
      "s3",
      "s1",
      "s2",
    ]);
  });

  it("clamps a destination past the end", () => {
    expect(moveSwatch(three, 0, 9).swatches.map((s) => s.id)).toEqual([
      "s2",
      "s3",
      "s1",
    ]);
  });
});

describe("patchSwatch", () => {
  it("writes a field on one swatch and leaves its neighbours alone", () => {
    const block = palette({
      swatches: [
        { id: "s1", hex: "#102A44" },
        { id: "s2", hex: "#FFFFFF" },
      ],
    });
    const next = patchSwatch(block, 1, { hex: "#C8102E" });
    expect(next.swatches[1]!.hex).toBe("#C8102E");
    expect(next.swatches[0]!.hex).toBe("#102A44");
  });

  it("keeps a swatch's other fields when one changes", () => {
    const block = palette({
      swatches: [{ id: "s1", hex: "#102A44", role: "primary" }],
    });
    const next = patchSwatch(block, 0, { pantoneCode: "289 C" });
    expect(next.swatches[0]).toEqual({
      id: "s1",
      hex: "#102A44",
      role: "primary",
      pantoneCode: "289 C",
    });
  });

  // Clearing an optional field has to remove the key, not leave `undefined`
  // sitting in the object a Convex validator will read.
  it("drops a role, label or Pantone code that was cleared", () => {
    const block = palette({
      swatches: [
        {
          id: "s1",
          hex: "#102A44",
          role: "accent",
          label: "Sash",
          pantoneCode: "289 C",
        },
      ],
    });
    const next = patchSwatch(block, 0, {
      role: undefined,
      label: "",
      pantoneCode: "   ",
    });
    expect(next.swatches[0]).toEqual({ id: "s1", hex: "#102A44" });
  });

  it("ignores an index that isn't in the palette", () => {
    expect(patchSwatch(palette(), 9, { hex: "#000000" })).toEqual(palette());
  });

  it("does not mutate the block it was given", () => {
    const block = palette();
    patchSwatch(block, 0, { hex: "#FFFFFF" });
    expect(block.swatches[0]!.hex).toBe("#102A44");
  });
});

// --- Gallery editing (D-05) -------------------------------------------------

describe("newGalleryBlock", () => {
  it("starts empty so the block lands before its images are picked", () => {
    const block = newGalleryBlock([], () => "g-new");
    expect(block).toEqual({ id: "g-new", kind: "gallery", assetIds: [] });
  });

  it("keeps the ids it was handed, in order", () => {
    expect(newGalleryBlock(["a2", "a1"], () => "g-new").assetIds).toEqual([
      "a2",
      "a1",
    ]);
  });
});

describe("toggleGalleryAsset", () => {
  it("appends an id the gallery doesn't show yet", () => {
    expect(toggleGalleryAsset(gallery(), "a2").assetIds).toEqual(["a1", "a2"]);
  });

  it("removes an id the gallery already shows", () => {
    expect(
      toggleGalleryAsset(gallery({ assetIds: ["a1", "a2"] }), "a1").assetIds,
    ).toEqual(["a2"]);
  });

  // Pick order is gallery order, so re-picking an image puts it at the end
  // rather than back where it used to be.
  it("re-adds at the end after a removal", () => {
    const block = gallery({ assetIds: ["a1", "a2"] });
    const next = toggleGalleryAsset(toggleGalleryAsset(block, "a1"), "a1");
    expect(next.assetIds).toEqual(["a2", "a1"]);
  });

  it("does not mutate the block it was given", () => {
    const block = gallery();
    toggleGalleryAsset(block, "a2");
    expect(block.assetIds).toEqual(["a1"]);
  });
});

// A deleted file must not leave a hole behind: the id is stripped from every
// gallery that hand-picked it, which is what keeps `validateBlocks` happy and
// the page rendering the files that remain.
describe("removeAssetFromBlocks", () => {
  it("strips the id from every gallery that referenced it", () => {
    const blocks: DesignBlock[] = [
      text(),
      gallery({ id: "g1", assetIds: ["a1", "a2"] }),
      gallery({ id: "g2", assetIds: ["a2"] }),
    ];
    expect(removeAssetFromBlocks(blocks, "a2")).toEqual([
      text(),
      gallery({ id: "g1", assetIds: ["a1"] }),
      gallery({ id: "g2", assetIds: [] }),
    ]);
  });

  it("leaves an unrelated brief exactly as it was", () => {
    const blocks: DesignBlock[] = [text(), palette(), gallery()];
    expect(removeAssetFromBlocks(blocks, "a9")).toEqual(blocks);
  });

  it("keeps a gallery that ends up empty rather than dropping the block", () => {
    const blocks: DesignBlock[] = [text(), gallery({ assetIds: ["a1"] })];
    const next = removeAssetFromBlocks(blocks, "a1");
    expect(next).toHaveLength(2);
    expect((next[1] as GalleryBlock).assetIds).toEqual([]);
  });
});
