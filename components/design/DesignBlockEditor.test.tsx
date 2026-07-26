// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";

// One vi.fn per Convex mutation, looked up by its function name, so a test can
// assert "moveBlock was called with toIndex 2" without caring which of the four
// mutations the editor mounted first.
const { mutationFor, mutationCalls, resetMutations } = vi.hoisted(() => {
  const registry = new Map<string, ReturnType<typeof vi.fn>>();
  const failures = new Map<string, string>();
  return {
    mutationFor(name: string) {
      let fn = registry.get(name);
      if (!fn) {
        fn = vi.fn(async () => {
          const message = failures.get(name);
          if (message) throw new Error(message);
          return undefined;
        });
        registry.set(name, fn);
      }
      return fn;
    },
    mutationCalls(name: string) {
      return registry.get(name)?.mock.calls ?? [];
    },
    resetMutations() {
      for (const fn of registry.values()) fn.mockClear();
      failures.clear();
      return failures;
    },
  };
});

vi.mock("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    mutationFor(getFunctionName(reference)),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import type { Id } from "@/convex/_generated/dataModel";
import type { StoredDesignBlock } from "@/convex/_designBlocks";
import { DesignBlockEditor } from "./DesignBlockEditor";

const designId = "design_1" as Id<"designs">;

const overview = {
  id: "b-overview",
  kind: "text",
  field: "overview",
  body: "Navy and gold, bold numbers.",
} satisfies StoredDesignBlock;
const notes = {
  id: "b-notes",
  kind: "text",
  field: "notes",
  body: "Ship by March.",
} satisfies StoredDesignBlock;
const galleryBlock = {
  id: "b-gallery",
  kind: "gallery",
  caption: "Mood board",
  assetIds: ["a1" as Id<"designAssets">],
} satisfies StoredDesignBlock;
const paletteBlock = {
  id: "b-palette",
  kind: "palette",
  swatches: [{ id: "s1", hex: "#102A44", role: "primary" }],
} satisfies StoredDesignBlock;

const assets = [
  {
    _id: "a1",
    filename: "mood.png",
    contentType: "image/png",
    url: "https://example.test/mood.png",
  },
];

function allFourSections(): StoredDesignBlock[] {
  return [
    overview,
    notes,
    { id: "b-c", kind: "text", field: "concept", body: "c" },
    { id: "b-i", kind: "text", field: "inspiration", body: "i" },
  ];
}

function renderEditor(blocks: StoredDesignBlock[] = [overview]) {
  return render(
    <DesignBlockEditor designId={designId} blocks={blocks} assets={assets} />,
  );
}

const NAMES = {
  add: "designs:addBlock",
  update: "designs:updateBlock",
  remove: "designs:removeBlock",
  move: "designs:moveBlock",
};

// One h3 per block card, in DOM order — so this list IS the assertion for
// "renders in the stored order". Scoped by heading level rather than by list
// item because a gallery block renders its own <li> per image.
function blockHeadings() {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
}

// The block cards, excluding the <li>s a gallery renders for its images.
function blockCards() {
  return within(
    screen.getByRole("list", { name: /brief blocks/i }),
  ).getAllByTestId("block-card");
}

describe("DesignBlockEditor", () => {
  beforeEach(() => {
    resetMutations();
    toastError.mockClear();
  });

  it("renders the design's blocks in their stored order", () => {
    renderEditor([galleryBlock, overview, paletteBlock]);
    expect(blockHeadings()).toEqual(["Mood board", "Overview", "Palette"]);
  });

  it("offers an empty-brief prompt when the design has no blocks", () => {
    renderEditor([]);
    expect(screen.getByText(/nothing written yet/i)).toBeInTheDocument();
  });

  describe("adding a section", () => {
    it("offers only the sections the design isn't already using", () => {
      renderEditor([overview, notes]);

      expect(
        screen.getByRole("button", { name: /add concept/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /add inspiration/i }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /add overview/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /add notes/i })).toBeNull();
    });

    it("still offers the palette once all four sections are in use", () => {
      renderEditor(allFourSections());

      expect(screen.queryByRole("button", { name: /add notes/i })).toBeNull();
      expect(
        screen.getByRole("button", { name: /add palette/i }),
      ).toBeInTheDocument();
    });

    it("says so when every section and the palette are in use", () => {
      renderEditor([...allFourSections(), paletteBlock]);

      expect(screen.queryByRole("button", { name: /^add /i })).toBeNull();
      expect(
        screen.getByText(/every section and the palette are in use/i),
      ).toBeInTheDocument();
    });

    it("writes the new section through addBlock once the body is filled in", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /add concept/i }));
      await user.type(
        screen.getByLabelText(/concept/i),
        "Retro stripes, modern cut.",
      );
      await user.click(screen.getByRole("button", { name: /^add section$/i }));

      expect(mutationCalls(NAMES.add)).toHaveLength(1);
      const [args] = mutationCalls(NAMES.add)[0] as [
        { designId: string; block: StoredDesignBlock },
      ];
      expect(args.designId).toBe(designId);
      expect(args.block).toMatchObject({
        kind: "text",
        field: "concept",
        body: "Retro stripes, modern cut.",
      });
      expect(args.block.id).toBeTruthy();
    });

    it("refuses to add an empty section without calling the server", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /add concept/i }));
      await user.click(screen.getByRole("button", { name: /^add section$/i }));

      expect(await screen.findByText(/can't be empty/i)).toBeInTheDocument();
      expect(mutationCalls(NAMES.add)).toHaveLength(0);
    });

    it("discards the draft on cancel", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /add concept/i }));
      await user.type(screen.getByLabelText(/concept/i), "Never mind.");
      await user.click(screen.getByRole("button", { name: /^cancel$/i }));

      expect(mutationCalls(NAMES.add)).toHaveLength(0);
      // The section is on offer again, so nothing was half-added.
      expect(
        screen.getByRole("button", { name: /add concept/i }),
      ).toBeInTheDocument();
    });
  });

  describe("editing a section", () => {
    it("saves the edited body through updateBlock", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /edit overview/i }));
      const textarea = screen.getByLabelText(/overview/i);
      await user.clear(textarea);
      await user.type(textarea, "Charcoal with a gold sash.");
      await user.click(screen.getByRole("button", { name: /^save$/i }));

      expect(mutationCalls(NAMES.update)).toHaveLength(1);
      const [args] = mutationCalls(NAMES.update)[0] as [
        { block: StoredDesignBlock },
      ];
      expect(args.block).toEqual({
        ...overview,
        body: "Charcoal with a gold sash.",
      });
    });

    it("leaves the stored body alone on cancel", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /edit overview/i }));
      await user.clear(screen.getByLabelText(/overview/i));
      await user.type(screen.getByLabelText(/overview/i), "Discard me.");
      await user.click(screen.getByRole("button", { name: /^cancel$/i }));

      expect(mutationCalls(NAMES.update)).toHaveLength(0);
      expect(screen.getByText(overview.body!)).toBeInTheDocument();
    });

    it("refuses to save an empty body without calling the server", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /edit overview/i }));
      await user.clear(screen.getByLabelText(/overview/i));
      await user.click(screen.getByRole("button", { name: /^save$/i }));

      expect(await screen.findByText(/can't be empty/i)).toBeInTheDocument();
      expect(mutationCalls(NAMES.update)).toHaveLength(0);
    });

    it("surfaces a server rejection as a toast and stays in edit mode", async () => {
      const user = userEvent.setup();
      resetMutations().set(NAMES.update, "Overview is too long.");
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /edit overview/i }));
      await user.type(screen.getByLabelText(/overview/i), " more");
      await user.click(screen.getByRole("button", { name: /^save$/i }));

      expect(toastError).toHaveBeenCalled();
      expect(screen.getByLabelText(/overview/i)).toBeInTheDocument();
    });

    it("has no inline editor for gallery blocks yet", () => {
      renderEditor([overview, galleryBlock, paletteBlock]);
      expect(screen.queryByRole("button", { name: /edit mood board/i })).toBeNull();
    });

    it("still renders gallery and palette contents read-only", () => {
      renderEditor([overview, galleryBlock, paletteBlock]);
      expect(screen.getByAltText("mood.png")).toBeInTheDocument();
      expect(screen.getByText("#102A44")).toBeInTheDocument();
    });
  });

  describe("removing a section", () => {
    it("removes a block through removeBlock", async () => {
      const user = userEvent.setup();
      renderEditor([overview, notes]);

      await user.click(screen.getByRole("button", { name: /remove notes/i }));

      expect(mutationCalls(NAMES.remove)).toEqual([
        [{ designId, blockId: "b-notes" }],
      ]);
    });

    it("does not offer to remove the Overview — every list reads it", () => {
      renderEditor([overview, notes]);
      expect(screen.queryByRole("button", { name: /remove overview/i })).toBeNull();
      expect(
        screen.getByRole("button", { name: /remove notes/i }),
      ).toBeInTheDocument();
    });
  });

  describe("reordering", () => {
    it("moves a block down through moveBlock", async () => {
      const user = userEvent.setup();
      renderEditor([overview, notes, galleryBlock]);

      await user.click(screen.getByRole("button", { name: /move overview down/i }));

      expect(mutationCalls(NAMES.move)).toEqual([
        [{ designId, blockId: "b-overview", toIndex: 1 }],
      ]);
    });

    it("moves a block up through moveBlock", async () => {
      const user = userEvent.setup();
      renderEditor([overview, notes, galleryBlock]);

      await user.click(screen.getByRole("button", { name: /move mood board up/i }));

      expect(mutationCalls(NAMES.move)).toEqual([
        [{ designId, blockId: "b-gallery", toIndex: 1 }],
      ]);
    });

    it("has no move-up on the first block or move-down on the last", () => {
      renderEditor([overview, notes]);
      expect(screen.queryByRole("button", { name: /move overview up/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /move notes down/i })).toBeNull();
    });

    it("offers no reorder controls at all for a single block", () => {
      renderEditor([overview]);
      expect(screen.queryByRole("button", { name: /^move /i })).toBeNull();
    });

    it("reorders on a drag from one block's handle onto another", () => {
      renderEditor([overview, notes, galleryBlock]);
      const items = blockCards();

      const handle = within(items[0]!).getByTestId("block-drag-handle");
      fireEvent.dragStart(handle);
      fireEvent.dragOver(items[2]!);
      fireEvent.drop(items[2]!);

      expect(mutationCalls(NAMES.move)).toEqual([
        [{ designId, blockId: "b-overview", toIndex: 2 }],
      ]);
    });

    it("ignores a drop back onto the block being dragged", () => {
      renderEditor([overview, notes]);
      const items = blockCards();

      const handle = within(items[0]!).getByTestId("block-drag-handle");
      fireEvent.dragStart(handle);
      fireEvent.drop(items[0]!);

      expect(mutationCalls(NAMES.move)).toHaveLength(0);
    });

    it("ignores a drop that didn't start from a handle", () => {
      renderEditor([overview, notes]);
      const items = blockCards();

      fireEvent.drop(items[1]!);

      expect(mutationCalls(NAMES.move)).toHaveLength(0);
    });
  });

  // --- Palette (D-04) -------------------------------------------------------
  // The palette is the one block with structure inside it, so it's edited as a
  // whole draft: swatches are added, reordered and typed into locally, and one
  // save carries the block.
  describe("the palette", () => {
    function paletteWith(...swatches: { id: string; hex: string }[]) {
      return {
        id: "b-palette",
        kind: "palette",
        swatches,
      } satisfies StoredDesignBlock;
    }

    function savedPalette() {
      const [args] = mutationCalls(NAMES.update)[0] as [
        { block: StoredDesignBlock },
      ];
      return args.block.kind === "palette" ? args.block : null;
    }

    function addedPalette() {
      const [args] = mutationCalls(NAMES.add)[0] as [
        { block: StoredDesignBlock },
      ];
      return args.block.kind === "palette" ? args.block : null;
    }

    it("offers to add a palette while the design hasn't got one", () => {
      renderEditor([overview]);
      expect(
        screen.getByRole("button", { name: /add palette/i }),
      ).toBeInTheDocument();
    });

    it("does not offer a second palette — a design has at most one", () => {
      renderEditor([overview, paletteBlock]);
      expect(screen.queryByRole("button", { name: /add palette/i })).toBeNull();
    });

    it("writes a new palette through addBlock with the colors picked so far", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /add palette/i }));
      await user.click(screen.getByRole("button", { name: /add color/i }));
      const hex = screen.getByLabelText(/swatch 1 hex/i);
      await user.clear(hex);
      await user.type(hex, "#C8102E");
      await user.selectOptions(
        screen.getByLabelText(/swatch 1 role/i),
        "accent",
      );
      await user.type(screen.getByLabelText(/swatch 1 pantone code/i), "186 C");
      await user.click(screen.getByRole("button", { name: /save palette/i }));

      expect(mutationCalls(NAMES.update)).toHaveLength(0);
      expect(addedPalette()?.swatches).toEqual([
        {
          id: expect.any(String),
          hex: "#C8102E",
          role: "accent",
          pantoneCode: "186 C",
        },
      ]);
    });

    it("carries the palette's caption", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /add palette/i }));
      await user.type(screen.getByLabelText(/palette caption/i), "Kit colors");
      await user.click(screen.getByRole("button", { name: /save palette/i }));

      expect(addedPalette()).toMatchObject({
        caption: "Kit colors",
        swatches: [],
      });
    });

    it("discards a new palette on cancel without calling the server", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /add palette/i }));
      await user.click(screen.getByRole("button", { name: /add color/i }));
      await user.click(screen.getByRole("button", { name: /^cancel$/i }));

      expect(mutationCalls(NAMES.add)).toHaveLength(0);
      expect(
        screen.getByRole("button", { name: /add palette/i }),
      ).toBeInTheDocument();
    });

    it("keeps the picker and the hex field showing one color", async () => {
      const user = userEvent.setup();
      renderEditor([overview]);

      await user.click(screen.getByRole("button", { name: /add palette/i }));
      await user.click(screen.getByRole("button", { name: /add color/i }));
      fireEvent.change(screen.getByLabelText(/swatch 1 color/i), {
        target: { value: "#c8102e" },
      });

      expect(screen.getByLabelText(/swatch 1 hex/i)).toHaveValue("#C8102E");
    });

    it("edits an existing palette through updateBlock", async () => {
      const user = userEvent.setup();
      renderEditor([overview, paletteBlock]);

      await user.click(screen.getByRole("button", { name: /edit palette/i }));
      expect(screen.getByLabelText(/swatch 1 hex/i)).toHaveValue("#102A44");
      expect(screen.getByLabelText(/swatch 1 role/i)).toHaveValue("primary");

      await user.type(screen.getByLabelText(/swatch 1 label/i), "Sash");
      await user.click(screen.getByRole("button", { name: /save palette/i }));

      expect(mutationCalls(NAMES.add)).toHaveLength(0);
      expect(savedPalette()).toEqual({
        ...paletteBlock,
        swatches: [{ id: "s1", hex: "#102A44", role: "primary", label: "Sash" }],
      });
    });

    it("adds and removes swatches before anything is saved", async () => {
      const user = userEvent.setup();
      renderEditor([overview, paletteBlock]);

      await user.click(screen.getByRole("button", { name: /edit palette/i }));
      await user.click(screen.getByRole("button", { name: /add color/i }));
      expect(screen.getAllByTestId("swatch-row")).toHaveLength(2);

      await user.click(screen.getByRole("button", { name: /remove swatch 1/i }));
      expect(screen.getAllByTestId("swatch-row")).toHaveLength(1);
      expect(mutationCalls(NAMES.update)).toHaveLength(0);

      await user.click(screen.getByRole("button", { name: /save palette/i }));
      expect(savedPalette()?.swatches).toEqual([
        { id: expect.any(String), hex: "#000000" },
      ]);
    });

    it("reorders swatches — the list order is the palette's order", async () => {
      const user = userEvent.setup();
      renderEditor([
        overview,
        paletteWith({ id: "s1", hex: "#102A44" }, { id: "s2", hex: "#FFFFFF" }),
      ]);

      await user.click(screen.getByRole("button", { name: /edit palette/i }));
      await user.click(
        screen.getByRole("button", { name: /move swatch 2 up/i }),
      );
      await user.click(screen.getByRole("button", { name: /save palette/i }));

      expect(savedPalette()?.swatches).toEqual([
        { id: "s2", hex: "#FFFFFF" },
        { id: "s1", hex: "#102A44" },
      ]);
    });

    it("clears a role back to none", async () => {
      const user = userEvent.setup();
      renderEditor([overview, paletteBlock]);

      await user.click(screen.getByRole("button", { name: /edit palette/i }));
      await user.selectOptions(screen.getByLabelText(/swatch 1 role/i), "");
      await user.click(screen.getByRole("button", { name: /save palette/i }));

      expect(savedPalette()?.swatches).toEqual([{ id: "s1", hex: "#102A44" }]);
    });

    it("refuses a hex that isn't a color without calling the server", async () => {
      const user = userEvent.setup();
      renderEditor([overview, paletteBlock]);

      await user.click(screen.getByRole("button", { name: /edit palette/i }));
      const hex = screen.getByLabelText(/swatch 1 hex/i);
      await user.clear(hex);
      await user.type(hex, "navy");
      await user.click(screen.getByRole("button", { name: /save palette/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/color/i);
      expect(mutationCalls(NAMES.update)).toHaveLength(0);
    });

    it("leaves the stored palette alone on cancel", async () => {
      const user = userEvent.setup();
      renderEditor([overview, paletteBlock]);

      await user.click(screen.getByRole("button", { name: /edit palette/i }));
      await user.click(screen.getByRole("button", { name: /remove swatch 1/i }));
      await user.click(screen.getByRole("button", { name: /^cancel$/i }));

      expect(mutationCalls(NAMES.update)).toHaveLength(0);
      // Back to the read-only rendering of what's actually stored.
      expect(screen.getByText("#102A44")).toBeInTheDocument();
    });

    it("closes an open text editor when the palette opens", async () => {
      const user = userEvent.setup();
      renderEditor([overview, paletteBlock]);

      await user.click(screen.getByRole("button", { name: /edit overview/i }));
      await user.click(screen.getByRole("button", { name: /edit palette/i }));

      expect(screen.queryByLabelText(/^overview$/i)).toBeNull();
      expect(screen.getByLabelText(/swatch 1 hex/i)).toBeInTheDocument();
    });

    it("surfaces a server rejection as a toast and stays open", async () => {
      const user = userEvent.setup();
      resetMutations().set(NAMES.update, "Nope.");
      renderEditor([overview, paletteBlock]);

      await user.click(screen.getByRole("button", { name: /edit palette/i }));
      await user.click(screen.getByRole("button", { name: /save palette/i }));

      expect(toastError).toHaveBeenCalled();
      expect(screen.getByLabelText(/swatch 1 hex/i)).toBeInTheDocument();
    });
  });
});
