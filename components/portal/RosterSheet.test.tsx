// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getFunctionName } from "convex/server";

// One stub per mutation, told apart by function name so a test can assert
// "create was called with this designId" without guessing which of the three
// roster mutations fired.
const { create, update, remove } = vi.hoisted(() => ({
  create: vi.fn(async (_args: unknown) => "slot_new"),
  update: vi.fn(async (_args: unknown) => "slot_1"),
  remove: vi.fn(async (_args: unknown) => "slot_1"),
}));

vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (name === "rosterEntries:create") return create;
    if (name === "rosterEntries:update") return update;
    if (name === "rosterEntries:remove") return remove;
    throw new Error(`Unexpected mutation: ${name}`);
  },
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

import type { Id } from "@/convex/_generated/dataModel";
import { RosterSheet, type RosterSheetSlot } from "./RosterSheet";

const RUN_ID = "run_1" as Id<"jerseyRuns">;
const DESIGN_ID = "design_home" as Id<"designs">;

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

function renderSheet(
  props: Partial<React.ComponentProps<typeof RosterSheet>> = {},
) {
  return render(
    <RosterSheet
      runId={RUN_ID}
      designId={DESIGN_ID}
      designTitle="Home kit"
      slots={[slot()]}
      locked={false}
      {...props}
    />,
  );
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /roster/i }));
  return within(await screen.findByRole("dialog"));
}

beforeEach(() => {
  create.mockClear();
  update.mockClear();
  remove.mockClear();
  toastError.mockClear();
  create.mockResolvedValue("slot_new");
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
  });

  it("says why the roster can't be edited", async () => {
    const user = userEvent.setup();
    renderSheet({ locked: true });

    const sheet = await openSheet(user);
    expect(sheet.getByText(/locked/i)).toBeInTheDocument();
  });
});
