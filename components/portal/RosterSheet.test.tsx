// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getFunctionName } from "convex/server";

// One stub per mutation, told apart by function name so a test can assert
// "create was called with this designId" without guessing which of the three
// roster mutations fired.
const { create, createMany, copyToDesign, update, remove } = vi.hoisted(() => ({
  create: vi.fn(async (_args: unknown) => "slot_new"),
  createMany: vi.fn(async (_args: unknown) => ["slot_a", "slot_b"]),
  copyToDesign: vi.fn(async (_args: unknown) => ({ copied: 2, skipped: 0 })),
  update: vi.fn(async (_args: unknown) => "slot_1"),
  remove: vi.fn(async (_args: unknown) => "slot_1"),
}));

vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "rosterEntries:create") return create;
    if (name === "rosterEntries:createMany") return createMany;
    if (name === "rosterEntries:copyToDesign") return copyToDesign;
    if (name === "rosterEntries:update") return update;
    if (name === "rosterEntries:remove") return remove;
    throw new Error(`Unexpected mutation: ${name}`);
  },
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import type { Id } from "@/convex/_generated/dataModel";
import { RosterSheet, type RosterSheetSlot } from "./RosterSheet";

const RUN_ID = "run_1" as Id<"jerseyRuns">;
const DESIGN_ID = "design_home" as Id<"designs">;
const AWAY_ID = "design_away" as Id<"designs">;

function slot(overrides: Partial<RosterSheetSlot> = {}): RosterSheetSlot {
  return {
    _id: "slot_gretzky" as Id<"rosterEntries">,
    name: "Gretzky",
    number: "99",
    source: "captain",
    filled: true,
    collision: false,
    sizes: [{ size: "L", qty: 1 }],
    total: 1,
    ...overrides,
  };
}

// Split from `renderSheet` so a test can re-render the same sheet with a
// different roster — which is how a removal actually reaches this component:
// the mutation resolves, Convex re-pushes the read, and `slots` comes back
// one shorter.
function sheetElement(
  props: Partial<React.ComponentProps<typeof RosterSheet>> = {},
) {
  return (
    <RosterSheet
      runId={RUN_ID}
      designId={DESIGN_ID}
      designTitle="Home kit"
      slots={[slot()]}
      otherDesigns={[{ designId: AWAY_ID, title: "Away kit" }]}
      locked={false}
      {...props}
    />
  );
}

function renderSheet(
  props: Partial<React.ComponentProps<typeof RosterSheet>> = {},
) {
  return render(sheetElement(props));
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /roster/i }));
  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  create.mockClear();
  createMany.mockClear();
  copyToDesign.mockClear();
  update.mockClear();
  remove.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  create.mockResolvedValue("slot_new");
  createMany.mockResolvedValue(["slot_a", "slot_b"]);
  copyToDesign.mockResolvedValue({ copied: 2, skipped: 0 });
  update.mockResolvedValue("slot_1");
  remove.mockResolvedValue("slot_1");
});

describe("RosterSheet — opening", () => {
  it("lists the design's slots with their ordered sizes once opened", async () => {
    const user = userEvent.setup();
    renderSheet({
      slots: [
        slot(),
        slot({
          _id: "slot_sosa" as Id<"rosterEntries">,
          name: "Sosa",
          number: "25",
          sizes: [{ size: "S", qty: 2 }],
          total: 2,
        }),
      ],
    });

    const sheet = await openSheet(user);
    expect(sheet.getByRole("listitem", { name: /gretzky #99/i })).toHaveTextContent(
      "L",
    );
    expect(sheet.getByRole("listitem", { name: /sosa #25/i })).toHaveTextContent(
      "S ×2",
    );
    expect(sheet.getByText("Home kit")).toBeInTheDocument();
  });

  it("keeps the seeded-but-unordered treatment from the card", async () => {
    const user = userEvent.setup();
    renderSheet({
      slots: [slot({ name: "Bure", number: "10", filled: false, sizes: [], total: 0 })],
    });

    const sheet = await openSheet(user);
    const row = sheet.getByRole("listitem", { name: /bure #10/i });
    expect(within(row).getByText(/not yet filled/i)).toBeInTheDocument();
  });

  it("invites the first player when the design has no slots yet", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    expect(sheet.getByText(/no players yet/i)).toBeInTheDocument();
    expect(sheet.getByLabelText(/player name/i)).toBeInTheDocument();
  });
});

describe("RosterSheet — adding", () => {
  it("creates the slot under this design and clears the add row", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await user.type(sheet.getByLabelText(/player name/i), "Lemieux");
    await user.type(sheet.getByLabelText(/player number/i), "66");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    expect(create).toHaveBeenCalledWith({
      runId: RUN_ID,
      designId: DESIGN_ID,
      name: "Lemieux",
      number: "66",
    });
    expect(sheet.getByLabelText(/player name/i)).toHaveValue("");
    expect(sheet.getByLabelText(/player number/i)).toHaveValue("");
  });

  it("omits a blank number rather than persisting an empty one", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await user.type(sheet.getByLabelText(/player name/i), "Lemieux");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    expect(create).toHaveBeenCalledWith({
      runId: RUN_ID,
      designId: DESIGN_ID,
      name: "Lemieux",
      number: undefined,
    });
  });

  it("refuses a nameless slot client-side and says so", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    expect(create).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/name/i),
    );
  });

  it("surfaces a rejected create as a readable toast", async () => {
    const user = userEvent.setup();
    create.mockRejectedValueOnce(new Error("This jersey run is locked."));
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await user.type(sheet.getByLabelText(/player name/i), "Lemieux");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/could not add/i),
      expect.objectContaining({ description: "This jersey run is locked." }),
    );
  });
});

describe("RosterSheet — editing and removing", () => {
  it("saves an edited name and number against the slot's id", async () => {
    const user = userEvent.setup();
    renderSheet();

    const sheet = await openSheet(user);
    await user.click(sheet.getByRole("button", { name: /edit gretzky/i }));
    const name = sheet.getByLabelText(/edit name/i);
    await user.clear(name);
    await user.type(name, "Howe");
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    expect(update).toHaveBeenCalledWith({
      rosterEntryId: "slot_gretzky",
      name: "Howe",
      number: "99",
    });
  });

  it("leaves the slot alone when the edit is cancelled", async () => {
    const user = userEvent.setup();
    renderSheet();

    const sheet = await openSheet(user);
    await user.click(sheet.getByRole("button", { name: /edit gretzky/i }));
    await user.click(sheet.getByRole("button", { name: /^cancel$/i }));

    expect(update).not.toHaveBeenCalled();
    expect(
      sheet.getByRole("listitem", { name: /gretzky #99/i }),
    ).toBeInTheDocument();
  });

  it("removes an empty slot", async () => {
    const user = userEvent.setup();
    renderSheet({
      slots: [slot({ filled: false, sizes: [], total: 0 })],
    });

    const sheet = await openSheet(user);
    await user.click(sheet.getByRole("button", { name: /remove gretzky/i }));

    expect(remove).toHaveBeenCalledWith({ rosterEntryId: "slot_gretzky" });
  });

  // M-06 tried dimming these until the row was hovered; M-07 reverted it on
  // review. They belong on the row at rest, on every device — a phone is
  // where a captain actually seeds a roster, and it has no hover at all.
  it("shows edit and remove on the row without hovering first", async () => {
    const user = userEvent.setup();
    renderSheet();

    const sheet = await openSheet(user);
    const row = sheet.getByRole("listitem", { name: /gretzky #99/i });
    expect(
      within(row).getByRole("button", { name: /edit gretzky/i }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: /remove gretzky/i }),
    ).toBeInTheDocument();
  });

  it("surfaces the server's 'slot has orders on it' rejection as a toast", async () => {
    const user = userEvent.setup();
    remove.mockRejectedValueOnce(
      new Error("This slot has orders on it — remove those first."),
    );
    renderSheet();

    const sheet = await openSheet(user);
    await user.click(sheet.getByRole("button", { name: /remove gretzky/i }));

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/could not remove/i),
      expect.objectContaining({
        description: "This slot has orders on it — remove those first.",
      }),
    );
  });
});

// N-07: rows animate in and out, which means a removed row outlives the read
// that dropped it. Every assertion here is about *which* row that is — the
// rows are keyed on entry id, and an index key would leave the wrong one on
// screen while the wrong one disappeared.
describe("RosterSheet — rows across a re-read", () => {
  const gretzky = slot();
  const sosa = slot({
    _id: "slot_sosa" as Id<"rosterEntries">,
    name: "Sosa",
    number: "25",
  });
  const bure = slot({
    _id: "slot_bure" as Id<"rosterEntries">,
    name: "Bure",
    number: "10",
  });

  it("drops the row that was removed and leaves its siblings alone", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSheet({ slots: [gretzky, sosa, bure] });
    const sheet = await openSheet(user);

    await user.click(sheet.getByRole("button", { name: /remove sosa/i }));
    expect(remove).toHaveBeenCalledWith({ rosterEntryId: "slot_sosa" });

    rerender(sheetElement({ slots: [gretzky, bure] }));

    // `getAllBy`, not `getBy`: with index keys the row held back for its exit
    // would be a *second* copy of the last survivor, so the count is the
    // assertion — the survivors are each on screen exactly once.
    expect(
      sheet.getAllByRole("listitem", { name: /gretzky #99/i }),
    ).toHaveLength(1);
    expect(sheet.getAllByRole("listitem", { name: /bure #10/i })).toHaveLength(
      1,
    );
    await waitFor(() =>
      expect(sheet.queryByRole("listitem", { name: /sosa #25/i })).toBeNull(),
    );
  });

  it("shows a newly created row beside the ones already there", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSheet({ slots: [gretzky] });
    const sheet = await openSheet(user);

    await user.type(sheet.getByLabelText(/add player name/i), "Sosa");
    await user.type(sheet.getByLabelText(/add player number/i), "25");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    rerender(sheetElement({ slots: [gretzky, sosa] }));

    expect(
      sheet.getByRole("listitem", { name: /gretzky #99/i }),
    ).toBeInTheDocument();
    expect(
      sheet.getByRole("listitem", { name: /sosa #25/i }),
    ).toBeInTheDocument();
  });

  it("shows the first player once the empty roster is filled", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSheet({ slots: [] });
    const sheet = await openSheet(user);

    expect(sheet.getByText(/no players yet/i)).toBeInTheDocument();
    rerender(sheetElement({ slots: [gretzky] }));

    expect(
      sheet.getByRole("listitem", { name: /gretzky #99/i }),
    ).toBeInTheDocument();
    expect(sheet.queryByText(/no players yet/i)).toBeNull();
  });
});

// M-03: seeding fifteen people is one paste, and the preview is the only
// safety net — there is no undo, so what the captain approves has to be
// exactly what gets written.
describe("RosterSheet — bulk paste", () => {
  // The clipboard, not the keyboard: `type` would mangle the tabs a
  // spreadsheet paste is made of.
  async function pasteInto(
    sheet: ReturnType<typeof within>,
    user: ReturnType<typeof userEvent.setup>,
    text: string,
  ) {
    await user.click(sheet.getByRole("button", { name: /paste a list/i }));
    const box = sheet.getByLabelText(/paste roster rows/i);
    await user.click(box);
    await user.paste(text);
    return box;
  }

  // The textarea still holds the pasted block, so a bare getByText would
  // match it as well as the preview row it produced.
  function preview(sheet: ReturnType<typeof within>) {
    return within(sheet.getByRole("list", { name: /paste preview/i }));
  }

  it("previews what a pasted block would create, with the real count on the button", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await pasteInto(sheet, user, "Gretzky\t99\n66\tLemieux");

    const rows = preview(sheet);
    expect(rows.getByText("Gretzky #99")).toBeInTheDocument();
    expect(rows.getByText("Lemieux #66")).toBeInTheDocument();
    expect(
      sheet.getByRole("button", { name: /add 2 players/i }),
    ).toBeEnabled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("writes exactly the rows it promised, then returns to the roster", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await pasteInto(sheet, user, "Gretzky\t99\nBo");
    await user.click(sheet.getByRole("button", { name: /add 2 players/i }));

    expect(createMany).toHaveBeenCalledWith({
      runId: RUN_ID,
      designId: DESIGN_ID,
      players: [
        { name: "Gretzky", number: "99" },
        { name: "Bo", number: undefined },
      ],
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/2 players/i),
    );
    expect(sheet.queryByLabelText(/paste roster rows/i)).toBeNull();
  });

  it("flags rows already on the roster, repeats, and rows it can't read — and excludes all three", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [slot({ name: "Gretzky", number: "99" })] });

    const sheet = await openSheet(user);
    await pasteInto(
      sheet,
      user,
      "gretzky\t99\nLemieux\t66\nLEMIEUX\t66\n99",
    );

    expect(sheet.getByText(/already on this roster/i)).toBeInTheDocument();
    expect(sheet.getByText(/repeated earlier/i)).toBeInTheDocument();
    expect(sheet.getByText(/number but no name/i)).toBeInTheDocument();

    await user.click(sheet.getByRole("button", { name: /add 1 player$/i }));
    expect(createMany).toHaveBeenCalledWith({
      runId: RUN_ID,
      designId: DESIGN_ID,
      players: [{ name: "Lemieux", number: "66" }],
    });
  });

  it("offers nothing to commit when every pasted row is already there", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [slot({ name: "Gretzky", number: "99" })] });

    const sheet = await openSheet(user);
    await pasteInto(sheet, user, "Gretzky\t99");

    expect(sheet.getByRole("button", { name: /nothing to add/i })).toBeDisabled();
    expect(sheet.getByText(/already on this roster/i)).toBeInTheDocument();
  });

  it("refuses a paste past the batch bound instead of previewing it", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await pasteInto(
      sheet,
      user,
      Array.from({ length: 201 }, (_, i) => `Player ${i}\t${i}`).join("\n"),
    );

    expect(sheet.getByText(/too many rows/i)).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: /nothing to add/i })).toBeDisabled();
  });

  it("surfaces a rejected commit as a toast and keeps the paste on screen", async () => {
    const user = userEvent.setup();
    createMany.mockRejectedValueOnce(new Error("This jersey run is locked."));
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await pasteInto(sheet, user, "Gretzky\t99");
    await user.click(sheet.getByRole("button", { name: /add 1 player/i }));

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/could not add/i),
      expect.objectContaining({ description: "This jersey run is locked." }),
    );
    expect(sheet.getByLabelText(/paste roster rows/i)).toBeInTheDocument();
  });

  it("leaves the roster alone when the paste is cancelled", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [] });

    const sheet = await openSheet(user);
    await pasteInto(sheet, user, "Gretzky\t99");
    await user.click(sheet.getByRole("button", { name: /^cancel$/i }));

    expect(createMany).not.toHaveBeenCalled();
    expect(sheet.queryByLabelText(/paste roster rows/i)).toBeNull();
    expect(sheet.getByLabelText(/add player name/i)).toBeInTheDocument();
  });
});

// M-04: the same fifteen people across a home and an away kit, entered once.
// Pull direction — the captain is in the sheet for the design that's missing
// players, and picks where to fill it from.
describe("RosterSheet — mirror", () => {
  // The menu portals out of the sheet, so it's found on the document rather
  // than inside the dialog.
  async function pickSource(
    sheet: ReturnType<typeof within>,
    user: ReturnType<typeof userEvent.setup>,
    title: RegExp,
  ) {
    await user.click(sheet.getByRole("button", { name: /copy roster from/i }));
    await user.click(await screen.findByRole("menuitem", { name: title }));
  }

  it("offers the order's other designs as sources", async () => {
    const user = userEvent.setup();
    renderSheet({
      otherDesigns: [
        { designId: AWAY_ID, title: "Away kit" },
        { designId: "design_warmup" as Id<"designs">, title: "Warmup" },
      ],
    });

    const sheet = await openSheet(user);
    await user.click(sheet.getByRole("button", { name: /copy roster from/i }));

    expect(
      await screen.findByRole("menuitem", { name: /away kit/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /warmup/i })).toBeInTheDocument();
    expect(copyToDesign).not.toHaveBeenCalled();
  });

  it("copies from the picked design into this one and reports the outcome", async () => {
    const user = userEvent.setup();
    copyToDesign.mockResolvedValueOnce({ copied: 18, skipped: 2 });
    renderSheet();

    const sheet = await openSheet(user);
    await pickSource(sheet, user, /away kit/i);

    expect(copyToDesign).toHaveBeenCalledWith({
      runId: RUN_ID,
      sourceDesignId: AWAY_ID,
      targetDesignId: DESIGN_ID,
    });
    expect(toastSuccess).toHaveBeenCalledWith("18 copied, 2 already there");
  });

  it("reads as already-done when the copy skipped everything", async () => {
    const user = userEvent.setup();
    copyToDesign.mockResolvedValueOnce({ copied: 0, skipped: 15 });
    renderSheet();

    const sheet = await openSheet(user);
    await pickSource(sheet, user, /away kit/i);

    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/already/i),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says nothing about copying when this is the order's only design", async () => {
    const user = userEvent.setup();
    renderSheet({ otherDesigns: [] });

    const sheet = await openSheet(user);
    expect(sheet.queryByRole("button", { name: /copy roster from/i })).toBeNull();
  });

  it("surfaces a rejected copy as a readable toast", async () => {
    const user = userEvent.setup();
    copyToDesign.mockRejectedValueOnce(new Error("This jersey run is locked."));
    renderSheet();

    const sheet = await openSheet(user);
    await pickSource(sheet, user, /away kit/i);

    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/could not copy/i),
      expect.objectContaining({ description: "This jersey run is locked." }),
    );
  });
});

describe("RosterSheet — collisions", () => {
  it("flags a slot two different people both claimed", async () => {
    const user = userEvent.setup();
    renderSheet({ slots: [slot({ collision: true })] });

    const sheet = await openSheet(user);
    const row = sheet.getByRole("listitem", { name: /gretzky #99/i });
    expect(within(row).getByText(/two people/i)).toBeInTheDocument();
  });

  it("says nothing about collisions on an ordinary slot", async () => {
    const user = userEvent.setup();
    renderSheet();

    const sheet = await openSheet(user);
    expect(sheet.queryByText(/two people/i)).toBeNull();
  });
});

describe("RosterSheet — locked run", () => {
  it("opens read-only with no add, edit, or remove affordances", async () => {
    const user = userEvent.setup();
    renderSheet({ locked: true });

    const sheet = await openSheet(user);
    expect(sheet.getByRole("listitem", { name: /gretzky #99/i })).toBeInTheDocument();
    expect(sheet.queryByLabelText(/player name/i)).toBeNull();
    expect(sheet.queryByRole("button", { name: /^add$/i })).toBeNull();
    expect(sheet.queryByRole("button", { name: /edit gretzky/i })).toBeNull();
    expect(sheet.queryByRole("button", { name: /remove gretzky/i })).toBeNull();
    expect(sheet.queryByRole("button", { name: /paste a list/i })).toBeNull();
    expect(sheet.queryByRole("button", { name: /copy roster from/i })).toBeNull();
  });

  it("says why the roster can't be edited", async () => {
    const user = userEvent.setup();
    renderSheet({ locked: true });

    const sheet = await openSheet(user);
    expect(sheet.getByText(/locked/i)).toBeInTheDocument();
  });
});
