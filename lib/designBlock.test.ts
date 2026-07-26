import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX_LENGTH,
  PANTONE_CODE_MAX_LENGTH,
  SWATCH_LABEL_MAX_LENGTH,
  TEXT_BODY_MAX_LENGTH,
  TEXT_FIELDS,
  TEXT_FIELD_LABELS,
  availableTextFields,
  blockHeading,
  indexOfBlock,
  isRequiredBlock,
  isSwatchRole,
  isTextField,
  moveBlockTo,
  newBlockId,
  newTextBlock,
  normalizeBlocks,
  normalizeHex,
  overviewOf,
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
