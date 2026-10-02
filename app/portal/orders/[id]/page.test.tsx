// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";

// Queries are told apart by function name, not args shape, so the page can
// grow another query without silently re-pointing one of these stubs. The
// page reads its order, the run behind the collect CTA and names mode, the
// order's items (L-02: one `orderItems.listForOrder` subscription behind the
// order list, chips, footer and CSV), and (through RemovedDesigns) the O-08
// receipt.
let orderResult: unknown = undefined;
let runResult: unknown = null;
let itemsResult: unknown = undefined;
let removedResult: unknown = [];
// Every query name the page subscribed to, so a test can pin "one list".
const queried = new Set<string>();
// Convex's view of auth (B-03). Settled-and-signed-in is the resting state;
// the flash tests below rewind it to the token-attach window.
let auth = { isLoading: false, isAuthenticated: true };

// L-03: the order list writes through the orderItems mutations. One stub per
// mutation, told apart by function name, so a test can assert "add was called
// with this" without guessing which mutation fired. Anything else (the run
// the collect card creates, names mode) shares `mutationStub`.
const {
  mutationStub,
  addItem,
  addMany,
  updateItem,
  removeItem,
  restoreItem,
  copyToDesign,
  toastFn,
  toastError,
  toastSuccess,
} = vi.hoisted(() => ({
  mutationStub: vi.fn(async (_args?: unknown) => undefined),
  addItem: vi.fn(async (_args?: unknown) => "item_new"),
  addMany: vi.fn(async (_args?: unknown) => ["item_a", "item_b"]),
  updateItem: vi.fn(async (_args?: unknown) => null),
  removeItem: vi.fn(async (_args?: unknown) => null),
  restoreItem: vi.fn(async (_args?: unknown) => null),
  copyToDesign: vi.fn(async (_args?: unknown) => ({ copied: 2, skipped: 0 })),
  toastFn: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

// A callable Sonner mock (the Undo toast is `toast(message, { action })`)
// that also carries the existing error/success methods. The real <Toaster>
// is not rendered in jsdom: it needs matchMedia. The Undo action callback is
// captured from the call and invoked directly.
vi.mock("sonner", () => ({
  toast: Object.assign(toastFn, {
    error: toastError,
    success: toastSuccess,
  }),
}));

// L-02: the legacy readers are gone from this page. A stub that answered them
// would let a half-migrated page pass on stale numbers, so they throw.
const LEGACY_READERS = new Set([
  "orderEntries:countsByRun",
  "jerseyRuns:listOrderEntries",
  "rosterEntries:listForRun",
]);

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const byName: Record<string, unknown> = {
    "orderItems:add": addItem,
    "orderItems:addMany": addMany,
    "orderItems:update": updateItem,
    "orderItems:remove": removeItem,
    "orderItems:restore": restoreItem,
    "orderItems:copyToDesign": copyToDesign,
  };
  return {
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
      byName[getFunctionName(ref)] ?? mutationStub,
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      queried.add(name);
      if (LEGACY_READERS.has(name))
        throw new Error(`L-02: the order page must not read ${name}`);
      if (name === "orderItems:listForOrder") return itemsResult;
      if (name.startsWith("jerseyRuns:")) return runResult;
      if (name.startsWith("orderEntries:")) return removedResult;
      return orderResult;
    },
    useConvexAuth: () => auth,
  };
});

import type { Id } from "@/convex/_generated/dataModel";
import { summarize, type SummaryItem } from "@/lib/orderItem/summary";
import OrderDetailPage from "./page";

const ORDER_ID = "order_1" as Id<"orders">;

const TITLES: Record<string, string> = {
  design_home: "Home kit",
  design_away: "Away kit",
  design_warmup: "Warmup",
};

type FixtureItem = Partial<SummaryItem> & { designId?: string };

// What `orderItems.listForOrder` returns for these items, built with the real
// `summarize` read model so the fixture can't drift from the server's shape.
// The linked designs are the current `orderResult`'s; an item on any other
// design lands in `removedDesigns`, as it does on the server.
function setItems(
  items: FixtureItem[],
  opts: {
    locked?: boolean;
    namesMode?: "open" | "fixed" | null;
  } = {},
) {
  const order = orderResult as { designs: { _id: string }[]; locked?: boolean };
  const designIds = order.designs.map((d) => d._id);
  const full = items.map((item, i) => ({
    _id: `item_${i}`,
    designId: "design_home",
    qty: 1,
    source: "captain" as const,
    createdAt: 1_000 + i,
    ...item,
  }));
  const run = runResult as
    | { _id: string; namesMode?: "open" | "fixed" }
    | null;
  const namesMode =
    opts.namesMode !== undefined
      ? opts.namesMode
      : run
        ? (run.namesMode ?? "open")
        : null;
  const locked = opts.locked ?? order.locked ?? false;
  itemsResult = {
    ...summarize(full, { designIds, titles: TITLES, namesMode }),
    locked,
    canEdit: !locked,
    form: run ? { runId: run._id, namesMode: namesMode ?? "open" } : null,
  };
}

// N sized jerseys on one design, unnamed (a bulk line).
function sized(designId: string, size: string, qty: number): FixtureItem {
  return { designId, size, qty };
}

function design(overrides: Record<string, unknown> = {}) {
  return {
    _id: "design_home" as Id<"designs">,
    title: "Home kit",
    overview: "Navy with gold accents.",
    fileCount: 3,
    mainImage: {
      url: "https://example.test/crest.png",
      filename: "crest.png",
      contentType: "image/png",
    },
    ...overrides,
  };
}

function orderWith(
  designs: ReturnType<typeof design>[],
  overrides: { locked?: boolean } = {},
) {
  return {
    order: {
      _id: ORDER_ID,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      internalStages: [{ name: "Order received", completedAt: 1 }],
      createdAt: Date.parse("2026-03-01T12:00:00Z"),
      updatedAt: Date.parse("2026-03-02T12:00:00Z"),
    },
    designs,
    locked: overrides.locked ?? false,
  };
}

// The page reads its route params with `use()`, so it suspends on first
// render — awaiting inside act lets the resolved params commit. The element
// (and its params promise) is built once so `refresh()` can re-render the same
// tree after a test changes the fixture, which is how a Convex subscription
// push reaches the page. This proves presentation from refreshed query data,
// not network delivery; live reactivity is a real-browser review check.
let mounted: { rerender: (ui: React.ReactElement) => void; ui: React.ReactElement } | null =
  null;

async function renderPage() {
  const ui = (
    <Suspense fallback={<p>Loading page</p>}>
      <OrderDetailPage params={Promise.resolve({ id: ORDER_ID })} />
    </Suspense>
  );
  await act(async () => {
    const view = render(ui);
    mounted = { rerender: view.rerender, ui };
  });
}

async function refresh() {
  await act(async () => {
    mounted!.rerender(mounted!.ui);
  });
}

function sectionFor(title: string) {
  return screen.getByLabelText(`Design: ${title}`);
}

// ---- order list helpers (contract: the list card is the `Order list` region;
// each design is a `group` named by its title; rows are listitems) ---------

function listCard() {
  return within(screen.getByRole("region", { name: "Order list" }));
}

function groupFor(title: string) {
  return within(listCard().getByRole("group", { name: title }));
}

const isChipItem = (li: HTMLElement) =>
  /size breakdown/i.test(li.closest("ul,ol")?.getAttribute("aria-label") ?? "");

// A row is a list item that is not a size chip.
function rowsIn(scope: ReturnType<typeof within>): HTMLElement[] {
  return scope.queryAllByRole("listitem").filter((li) => !isChipItem(li));
}

function rowOf(scope: ReturnType<typeof within>, text: string): HTMLElement {
  const row = rowsIn(scope).find((li) => li.textContent?.includes(text));
  if (!row) throw new Error(`no row containing "${text}"`);
  return row;
}

function chipsOf(scope: ReturnType<typeof within>): string[] {
  return within(scope.getByRole("list", { name: /size breakdown/i }))
    .getAllByRole("listitem")
    .map((li) => (li.textContent ?? "").replace(/\s+/g, ""));
}

// The footer line: "6 items · S×1 M×2 …". Found by its text, which starts
// with the item count.
function footerText(count: number): string {
  const el = listCard().getByText(new RegExp(`^${count} items?\\b.*[·•]`));
  return (el.textContent ?? "").replace(/\s+/g, " ");
}

function chipTotal(chips: string[]): number {
  return chips.reduce((sum, chip) => sum + Number(chip.split("×")[1] ?? 0), 0);
}

// Every string a toast was given: the message and any description.
function toastTexts(): string[] {
  const calls = [
    ...toastFn.mock.calls,
    ...toastError.mock.calls,
    ...toastSuccess.mock.calls,
  ];
  return calls.flatMap(([message, opts]) => [
    String(message),
    ...(opts && typeof opts === "object" && "description" in opts
      ? [String((opts as { description: unknown }).description)]
      : []),
  ]);
}

function undoAction(): () => unknown {
  const call = toastFn.mock.calls.find(([m]) => /^Removed /.test(String(m)));
  expect(call, "a `Removed …` toast").toBeDefined();
  const action = (call![1] as { action?: { label: string; onClick: () => unknown } })
    ?.action;
  expect(action?.label).toBe("Undo");
  return action!.onClick;
}

// The size pills are single-choice controls named by their size; radios or
// toggle buttons both satisfy the contract.
function sizePill(dialog: ReturnType<typeof within>, size: string) {
  const name = new RegExp(`^${size}$`);
  return (
    dialog.queryByRole("radio", { name }) ?? dialog.getByRole("button", { name })
  );
}

const FORBIDDEN_NEW_COPY = /roster|slot|jersey run|collected|responses/i;
const LEAKS = /CONVEX|ConvexError|Request ID|\/(?:app|convex|home|lib)\//;
const FALLBACK = "Could not save that item. Please try again.";

const RUN = {
  _id: "run_1" as Id<"jerseyRuns">,
  deadline: Date.parse("2026-04-01T12:00:00Z"),
  status: "open",
  effectiveStatus: "open" as const,
};

afterEach(() => {
  vi.clearAllMocks();
  addItem.mockResolvedValue("item_new");
  addMany.mockResolvedValue(["item_a", "item_b"]);
  updateItem.mockResolvedValue(null);
  removeItem.mockResolvedValue(null);
  restoreItem.mockResolvedValue(null);
  copyToDesign.mockResolvedValue({ copied: 2, skipped: 0 });
  orderResult = undefined;
  runResult = null;
  itemsResult = undefined;
  removedResult = [];
  queried.clear();
  mounted = null;
  auth = { isLoading: false, isAuthenticated: true };
});

describe("/portal/orders/[id] — no 'not found' flash while auth loads (B-03)", () => {
  it("should show a loading state when a null order arrives while auth is loading", async () => {
    auth = { isLoading: true, isAuthenticated: false };
    orderResult = null;
    await renderPage();

    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText(/order not found/i)).toBeNull();
  });

  it("should show a loading state when the token has not attached yet", async () => {
    auth = { isLoading: false, isAuthenticated: false };
    orderResult = null;
    await renderPage();

    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText(/order not found/i)).toBeNull();
  });

  it("should still say 'not found' for an order that genuinely isn't there", async () => {
    orderResult = null;
    await renderPage();

    expect(screen.getByText(/order not found/i)).toBeInTheDocument();
  });
});

describe("/portal/orders/[id] — design main image (D-07)", () => {
  it("shows the design's main image beside its file count, not instead of it", async () => {
    orderResult = orderWith([design()]);
    await renderPage();

    const section = within(sectionFor("Home kit"));
    const image = section.getByRole("img", { name: /home kit/i });
    expect(image).toHaveAttribute("src", "https://example.test/crest.png");
    expect(section.getByText("3 files")).toBeInTheDocument();
  });

  it("falls back to a placeholder when the design has no image", async () => {
    orderResult = orderWith([
      design({ title: "Docs only", fileCount: 0, mainImage: null }),
    ]);
    await renderPage();

    const section = within(sectionFor("Docs only"));
    expect(section.queryByRole("img", { name: /main image/i })).toBeNull();
    expect(
      section.getByRole("img", { name: /no image yet/i }),
    ).toBeInTheDocument();
    expect(section.getByText("No files yet")).toBeInTheDocument();
  });

  it("falls back when the main file is not something a browser can render", async () => {
    orderResult = orderWith([
      design({
        mainImage: {
          url: "https://example.test/print.pdf",
          filename: "print.pdf",
          contentType: "application/pdf",
        },
      }),
    ]);
    await renderPage();

    const section = within(sectionFor("Home kit"));
    expect(
      section.getByRole("img", { name: /no image yet/i }),
    ).toBeInTheDocument();
  });

  it("falls back when the storage URL has expired since the query resolved", async () => {
    orderResult = orderWith([design()]);
    await renderPage();

    const section = within(sectionFor("Home kit"));
    fireEvent.error(section.getByRole("img", { name: /home kit/i }));

    expect(
      section.getByRole("img", { name: /no image yet/i }),
    ).toBeInTheDocument();
  });

  it("falls back when the file is gone and the query resolved no URL", async () => {
    orderResult = orderWith([
      design({
        mainImage: {
          url: null,
          filename: "crest.png",
          contentType: "image/png",
        },
      }),
    ]);
    await renderPage();

    expect(
      within(sectionFor("Home kit")).getByRole("img", { name: /no image yet/i }),
    ).toBeInTheDocument();
  });

  it("gives every linked design its own thumbnail", async () => {
    orderResult = orderWith([
      design(),
      design({
        _id: "design_away" as Id<"designs">,
        title: "Away kit",
        fileCount: 1,
        mainImage: {
          url: "https://example.test/away.png",
          filename: "away.png",
          contentType: "image/png",
        },
      }),
    ]);
    await renderPage();

    expect(
      within(sectionFor("Home kit")).getByRole("img", { name: /home kit/i }),
    ).toHaveAttribute("src", "https://example.test/crest.png");
    expect(
      within(sectionFor("Away kit")).getByRole("img", { name: /away kit/i }),
    ).toHaveAttribute("src", "https://example.test/away.png");
  });
});


// ---------------------------------------------------------------------------
// L-03 — the Order list card. Contract the build must meet (from the issue and
// UX §4/§7/§8): a region named `Order list` holds one `group` per design
// (named by the design title), rows are listitems, size chips are a list named
// "Size breakdown", `+ Add item` / `Paste a list` / `Copy from <design>` /
// `Download CSV` sit per design, a row menu button is named `Edit <label>`, and
// the add/edit sheet is a dialog titled `Add an item` / `Edit item`.
// ---------------------------------------------------------------------------

async function openAddSheet(
  user: ReturnType<typeof userEvent.setup>,
  title = "Home kit",
) {
  await user.click(groupFor(title).getByRole("button", { name: /^\+ add item$/i }));
  return within(await screen.findByRole("dialog", { name: /add an item/i }));
}

async function openEditSheet(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(
    listCard().getByRole("button", { name: new RegExp(`^edit ${label}$`, "i") }),
  );
  return within(await screen.findByRole("dialog", { name: /edit item/i }));
}

describe("/portal/orders/[id] — the order list card (L-03, UX §4)", () => {
  it("shows the Order list heading, the help line and a group per design", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Order list" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Everything we'll make for this order. Add items yourself, or share the order form and let players add their own.",
      ),
    ).toBeInTheDocument();
    expect(listCard().getByRole("group", { name: "Home kit" })).toBeInTheDocument();
    expect(listCard().getByRole("group", { name: "Away kit" })).toBeInTheDocument();
  });

  it("puts the Order list above the order details", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const list = screen.getByRole("heading", { name: "Order list" });
    const basics = screen.getByText("The basics");
    expect(
      list.compareDocumentPosition(basics) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("reads each design's line as `<n> items · <m> needs a size` with its size chips", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L", qty: 2 },
      { name: "Sosa", number: "25", size: "S" },
      { name: "Bure", number: "10" },
    ]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(home.getByText(/^3 items\s*·\s*1 needs a size$/)).toBeInTheDocument();
    expect(chipsOf(home)).toEqual(["S×1", "L×2"]);
  });

  it("drops the `needs a size` half when nothing needs one", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    expect(groupFor("Home kit").getByText(/^1 item$/)).toBeInTheDocument();
    expect(listCard().queryByText(/needs a size/i)).toBeNull();
  });

  it("shows the footer as `<n> items · <sizes>` and the Needs-size count beside it", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "M", qty: 2 },
      { name: "Sosa", number: "25", size: "S" },
      { designId: "design_away", name: "Luongo", number: "1", size: "2XL", qty: 2 },
      { name: "Bure", number: "10" },
    ]);
    await renderPage();

    expect(footerText(5)).toBe("5 items · S×1 M×2 2XL×2");
    expect(listCard().getAllByText("1 needs a size").length).toBeGreaterThan(0);
  });

  it("shows the empty-design state with the approved sentence", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(home.getByText("Nothing on the list yet")).toBeInTheDocument();
    expect(
      home.getByText(
        "Add your players one at a time, paste a list from a spreadsheet, or share the order form and let them add themselves.",
      ),
    ).toBeInTheDocument();
    expect(home.getByRole("button", { name: /^\+ add item$/i })).toBeEnabled();
    expect(home.getByRole("button", { name: /^paste a list$/i })).toBeEnabled();
  });

  it("renders a row as `<Name> #<Number>` with its size, ×qty and `Added by you`", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Sidestep", number: "72", size: "M", qty: 3 }]);
    await renderPage();

    const row = rowOf(groupFor("Home kit"), "Sidestep #72");
    expect(row).toHaveTextContent("M");
    expect(row).toHaveTextContent("×3");
    expect(within(row).getByText("Added by you")).toBeInTheDocument();
  });

  it("omits ×qty when the quantity is one", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Sidestep", number: "72", size: "M" }]);
    await renderPage();

    expect(rowOf(groupFor("Home kit"), "Sidestep #72")).not.toHaveTextContent("×");
  });

  it("credits a player-sent row to the submitter's first name", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      {
        name: "Sosa",
        number: "25",
        size: "S",
        source: "fan",
        submitterName: "Riley Chen",
        submitterEmail: "riley@example.test",
      },
    ]);
    await renderPage();

    const row = rowOf(groupFor("Home kit"), "Sosa #25");
    expect(within(row).getByText("Added by Riley")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("Chen");
    expect(row).not.toHaveTextContent("riley@example.test");
  });

  it("credits a captain-seeded row a player filled in to the player", async () => {
    orderResult = orderWith([design()]);
    runResult = { ...RUN, namesMode: "fixed" as const };
    setItems([
      {
        name: "Gretzky",
        number: "99",
        size: "L",
        source: "captain",
        submitterName: "Wayne Gretzky",
        submitterEmail: "wayne@example.test",
      },
    ]);
    await renderPage();

    expect(
      within(rowOf(groupFor("Home kit"), "Gretzky #99")).getByText("Added by Wayne"),
    ).toBeInTheDocument();
  });

  it("shows `No name` for a row with neither name nor number", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([sized("design_home", "XL", 4)]);
    await renderPage();

    const row = rowOf(groupFor("Home kit"), "No name");
    expect(row).toHaveTextContent("XL");
    expect(row).toHaveTextContent("×4");
  });

  it("marks the captain and assistant-captain letters on their rows", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L", designation: "C" },
      { name: "Bure", number: "10", size: "M", designation: "A" },
      { name: "Sosa", number: "25", size: "S" },
    ]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(within(rowOf(home, "Gretzky #99")).getByText("Captain")).toBeInTheDocument();
    expect(
      within(rowOf(home, "Bure #10")).getByText("Assistant captain"),
    ).toBeInTheDocument();
    const sosa = rowOf(home, "Sosa #25");
    expect(within(sosa).queryByText("Captain")).toBeNull();
    expect(within(sosa).queryByText("Assistant captain")).toBeNull();
  });

  it("flags a name two different players both claimed (open names mode)", async () => {
    orderResult = orderWith([design()]);
    runResult = { ...RUN, namesMode: "open" as const };
    setItems([
      { name: "Gretzky", number: "99", size: "L", source: "fan", submitterName: "Ann", submitterEmail: "a@example.test" },
      { name: "Gretzky", number: "99", size: "M", source: "fan", submitterName: "Bo", submitterEmail: "b@example.test" },
      { name: "Sosa", number: "25", size: "S" },
    ]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(
      within(rowsIn(home).filter((r) => r.textContent?.includes("Gretzky"))[0]).getByText(
        /two people claimed this/i,
      ),
    ).toBeInTheDocument();
    expect(within(rowOf(home, "Sosa #25")).queryByText(/two people claimed/i)).toBeNull();
  });

  it("shows a long list in full, first row to last", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems(
      Array.from({ length: 15 }, (_, i) => ({
        name: `Player ${i}`,
        number: `${i}`,
        size: "M",
      })),
    );
    await renderPage();

    const home = groupFor("Home kit");
    expect(rowsIn(home)).toHaveLength(15);
    expect(rowOf(home, "Player 0 #0")).toBeInTheDocument();
    expect(rowOf(home, "Player 14 #14")).toBeInTheDocument();
    expect(home.queryByText(/\bmore\b/i)).toBeNull();
  });

  it("gives each design only its own rows and leaves removed-design items out", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L" },
      { designId: "design_away", name: "Luongo", number: "1", size: "M" },
      { designId: "design_warmup", name: "Stray", number: "7", size: "M" },
    ]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(rowOf(home, "Gretzky #99")).toBeInTheDocument();
    expect(home.queryByText(/luongo/i)).toBeNull();
    expect(rowOf(groupFor("Away kit"), "Luongo #1")).toBeInTheDocument();
    expect(listCard().queryByText(/stray/i)).toBeNull();
  });

  it("renders no rows and no counts before the list has loaded", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    itemsResult = undefined;
    await renderPage();

    expect(screen.getByRole("heading", { name: "Order list" })).toBeInTheDocument();
    expect(listCard().queryAllByRole("listitem")).toHaveLength(0);
    expect(listCard().queryByRole("button", { name: /^\+ add item$/i })).toBeNull();
  });

  it("is the page's only reader: one orderItems.listForOrder subscription, no legacy readers", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    expect(queried.has("orderItems:listForOrder")).toBe(true);
    for (const legacy of LEGACY_READERS) expect(queried.has(legacy)).toBe(false);
  });
});

describe("/portal/orders/[id] — item counts always agree (L-03 Q8 = A, L-02 §7.9)", () => {
  it("makes every scope's item count equal the sum of that scope's chips", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L", qty: 2 },
      { name: "Sosa", number: "25", size: "S" },
      sized("design_home", "M", 2),
      { name: "Bure", number: "10" },
      { designId: "design_away", name: "Luongo", number: "1", size: "M", qty: 4 },
      { designId: "design_away", name: "Cole", number: "4" },
      { designId: "design_warmup", name: "Stray", number: "7", size: "M", qty: 9 },
    ]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(chipTotal(chipsOf(home))).toBe(5);
    expect(home.getByText(/^5 items\b/)).toBeInTheDocument();

    const away = groupFor("Away kit");
    expect(chipTotal(chipsOf(away))).toBe(4);
    expect(away.getByText(/^4 items\b/)).toBeInTheDocument();

    // Footer = the design scopes together; the removed design is out.
    const footer = footerText(9);
    expect(footer).toBe("9 items · S×1 M×6 L×2");
    expect(
      chipTotal(
        footer
          .split("·")[1]
          .trim()
          .split(" ")
          .map((c) => c.trim()),
      ),
    ).toBe(9);
  });

  it("counts sized quantity only: a Needs-size item is separate and not in any item count", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      sized("design_home", "M", 2),
      { name: "Bure", number: "10", qty: 3 },
    ]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(home.getByText(/^2 items\s*·\s*3 needs a size$/)).toBeInTheDocument();
    expect(footerText(2)).toBe("2 items · M×2");
  });

  it("reads 0 for an empty list and never falls back to the intake estimate", async () => {
    orderResult = orderWith([design()]); // estimatedQuantity is 12
    runResult = RUN;
    setItems([]);
    await renderPage();

    expect(listCard().queryByText(/\b12\b/)).toBeNull();
    expect(listCard().queryByText(/^0 items?\b.*×/)).toBeNull();
    expect(groupFor("Home kit").getByText("Nothing on the list yet")).toBeInTheDocument();
  });

  it("counts the captain's sized items on an order with no order form yet", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([sized("design_home", "M", 2), sized("design_home", "L", 1)]);
    await renderPage();

    expect(groupFor("Home kit").getByText(/^3 items\b/)).toBeInTheDocument();
    expect(footerText(3)).toBe("3 items · M×2 L×1");
  });

  it("leaves a since-removed design's jerseys out of the list's chips and footer", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L" },
      { designId: "design_warmup", name: "Bure", number: "10", size: "M" },
    ]);
    await renderPage();

    expect(footerText(1)).toBe("1 item · L×1");
  });
});

describe("/portal/orders/[id] — add an item (L-03, UX §8.3, §8.6)", () => {
  it("adds `Sidestep #72 · M` from the order page and the row appears without navigation (§8.3)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Sidestep");
    await user.type(sheet.getByLabelText("Number"), "72");
    await user.click(sizePill(sheet, "M"));
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          designId: "design_home",
          name: "Sidestep",
          number: "72",
          size: "M",
          qty: 1,
        }),
      ),
    );

    // The subscription pushes the new row; the page re-renders in place.
    setItems([{ name: "Sidestep", number: "72", size: "M" }]);
    await refresh();
    expect(rowOf(groupFor("Home kit"), "Sidestep #72")).toHaveTextContent("M");
    expect(screen.getByRole("heading", { name: "Order list" })).toBeInTheDocument();
    expect(window.location.pathname).not.toMatch(/roster|responses/);
  });

  it("titles the sheet `Add an item` with the design as its subtitle and the approved hints", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    expect(sheet.getByText("Home kit")).toBeInTheDocument();
    expect(sheet.getByLabelText("Name on jersey")).toBeInTheDocument();
    expect(sheet.getByLabelText("Number")).toBeInTheDocument();
    expect(
      sheet.getByText("Leave either one blank if you don't want it printed."),
    ).toBeInTheDocument();
    expect(
      sheet.getByText(`Not sure yet? Skip it and we'll mark it "needs size".`),
    ).toBeInTheDocument();
    expect(sheet.getByText("How many")).toBeInTheDocument();
    expect(sheet.getByText("Captain letter")).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: /^add and start another$/i })).toBeInTheDocument();
  });

  it("offers every catalog size as a pill", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    for (const size of ["XS", "S", "M", "L", "XL", "2XL"])
      expect(sizePill(sheet, size)).toBeInTheDocument();
  });

  it("works on an order with no order form: `+ Add item` and `Paste a list` render and adding succeeds (§8.6)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(home.getByRole("button", { name: /^paste a list$/i })).toBeInTheDocument();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Lemieux");
    await user.type(sheet.getByLabelText("Number"), "66");
    await user.click(sizePill(sheet, "L"));
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          designId: "design_home",
          name: "Lemieux",
          number: "66",
          size: "L",
        }),
      ),
    );
    expect(addItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ runId: expect.anything() }),
    );
  });

  it("asks for no deadline anywhere in the add flow", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([]);
    await renderPage();

    expect(listCard().queryByLabelText(/deadline/i)).toBeNull();
    const sheet = await openAddSheet(user);
    expect(sheet.queryByLabelText(/deadline/i)).toBeNull();
    expect(sheet.queryByText(/deadline|closes/i)).toBeNull();
    await user.click(sheet.getByRole("button", { name: /^add$/i }));
    expect(screen.queryByLabelText(/deadline/i)).toBeNull();
  });

  it("saves an item with no size and shows it as `Needs size` (§8.7)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Bure");
    await user.type(sheet.getByLabelText("Number"), "10");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(addItem).toHaveBeenCalledTimes(1));
    const args = addItem.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toMatchObject({ name: "Bure", number: "10", qty: 1 });
    expect(args.size).toBeUndefined();

    setItems([{ name: "Bure", number: "10" }]);
    await refresh();
    const home = groupFor("Home kit");
    expect(within(rowOf(home, "Bure #10")).getByText("Needs size")).toBeInTheDocument();
    expect(home.getByText(/^0 items\s*·\s*1 needs a size$/)).toBeInTheDocument();
    expect(listCard().getAllByText("1 needs a size").length).toBeGreaterThan(0);
  });

  it("sends the captain letter picked in the sheet", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Gretzky");
    await user.type(sheet.getByLabelText("Number"), "99");
    await user.click(sizePill(sheet, "L"));
    await user.click(sheet.getByRole("radio", { name: /^c\b|captain/i }));
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Gretzky", designation: "C" }),
      ),
    );
  });

  it("adds under the right design when the order has several", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user, "Away kit");
    expect(sheet.getByText("Away kit")).toBeInTheDocument();
    await user.type(sheet.getByLabelText("Name on jersey"), "Luongo");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({ designId: "design_away", name: "Luongo" }),
      ),
    );
  });

  it("`Add and start another` saves, keeps the sheet open, clears the fields and refocuses the name", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Sosa");
    await user.type(sheet.getByLabelText("Number"), "25");
    await user.click(sizePill(sheet, "S"));
    await user.click(sheet.getByRole("button", { name: /^add and start another$/i }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Sosa", number: "25", size: "S" }),
      ),
    );
    const open = within(screen.getByRole("dialog", { name: /add an item/i }));
    await waitFor(() => expect(open.getByLabelText("Name on jersey")).toHaveValue(""));
    expect(open.getByLabelText("Number")).toHaveValue("");
    expect(open.getByLabelText("Name on jersey")).toHaveFocus();
  });

  it("closes the sheet after a plain `Add`", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Sosa");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("allows an item with a size but neither name nor number (a bulk line)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.click(sizePill(sheet, "XL"));
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID, designId: "design_home", size: "XL", qty: 1 }),
      ),
    );
  });

  it("shows the server's sentence when an add is rejected, and keeps the sheet open", async () => {
    const user = userEvent.setup();
    addItem.mockRejectedValueOnce(new ConvexError("The order is locked"));
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Sosa");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(toastTexts()).toContain("The order is locked"));
    expect(screen.getByRole("dialog", { name: /add an item/i })).toBeInTheDocument();
    expect(sheet.getByLabelText("Name on jersey")).toHaveValue("Sosa");
  });
});

describe("/portal/orders/[id] — edit an item (L-03, UX §8.4)", () => {
  const RILEY = {
    name: "Sidestep",
    number: "72",
    size: "M",
    qty: 2,
    designation: "A" as const,
    source: "fan" as const,
    submitterName: "Riley Chen",
    submitterEmail: "riley@example.test",
    customAnswers: { "Shirt colour?": "Navy", "Allergies?": "None" },
  };

  it("names each row's menu button `Edit <label>`", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Sidestep", number: "72", size: "M" }, { name: "Bure", number: "10" }]);
    await renderPage();

    expect(listCard().getByRole("button", { name: "Edit Sidestep #72" })).toBeInTheDocument();
    expect(listCard().getByRole("button", { name: "Edit Bure #10" })).toBeInTheDocument();
  });

  it("opens `Edit item` prefilled with the row's fields", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([RILEY]);
    await renderPage();

    const sheet = await openEditSheet(user, "Sidestep #72");
    expect(sheet.getByLabelText("Name on jersey")).toHaveValue("Sidestep");
    expect(sheet.getByLabelText("Number")).toHaveValue("72");
    expect(sheet.getByText("Home kit")).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: /^remove$/i })).toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: /add and start another/i })).toBeNull();
  });

  it("changes a player-submitted item's size M → L; the row, chips and footer follow in one render, no reload (§8.4)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([RILEY, { name: "Sosa", number: "25", size: "S" }]);
    await renderPage();

    expect(chipsOf(groupFor("Home kit"))).toEqual(["S×1", "M×2"]);
    expect(footerText(3)).toBe("3 items · S×1 M×2");

    const sheet = await openEditSheet(user, "Sidestep #72");
    await user.click(sizePill(sheet, "L"));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item_0", size: "L" }),
      ),
    );

    setItems([{ ...RILEY, size: "L" }, { name: "Sosa", number: "25", size: "S" }]);
    await refresh();

    const home = groupFor("Home kit");
    expect(rowOf(home, "Sidestep #72")).toHaveTextContent("L");
    expect(rowOf(home, "Sidestep #72")).not.toHaveTextContent("M");
    // Every affected scope, from the same update.
    expect(chipsOf(home)).toEqual(["S×1", "L×2"]);
    expect(footerText(3)).toBe("3 items · S×1 L×2");
    expect(screen.getByRole("heading", { name: "Order list" })).toBeInTheDocument();
  });

  it("sends the whole item back on save: unchanged name, number, qty and letter ride along (full replacement)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([RILEY]);
    await renderPage();

    const sheet = await openEditSheet(user, "Sidestep #72");
    await user.click(sizePill(sheet, "L"));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem.mock.calls[0][0]).toMatchObject({
      itemId: "item_0",
      name: "Sidestep",
      number: "72",
      size: "L",
      qty: 2,
      designation: "A",
    });
  });

  it("keeps a Needs-size item's size empty when only its name is edited", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Bure", number: "10" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Bure #10");
    const name = sheet.getByLabelText("Name on jersey");
    await user.clear(name);
    await user.type(name, "Bure P");
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    const args = updateItem.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toMatchObject({ itemId: "item_0", name: "Bure P", number: "10", qty: 1 });
    expect(args.size).toBeUndefined();
  });

  it("gives a Needs-size item a size, and it moves into the chips", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Bure", number: "10" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Bure #10");
    await user.click(sizePill(sheet, "M"));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item_0", size: "M" }),
      ),
    );

    setItems([{ name: "Bure", number: "10", size: "M" }]);
    await refresh();
    const home = groupFor("Home kit");
    expect(within(rowOf(home, "Bure #10")).queryByText("Needs size")).toBeNull();
    expect(home.getByText(/^1 item$/)).toBeInTheDocument();
    expect(listCard().queryByText(/needs a size/i)).toBeNull();
    expect(footerText(1)).toBe("1 item · M×1");
  });

  it("pins the captain letter from the edit sheet", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Gretzky #99");
    await user.click(sheet.getByRole("radio", { name: /^c\b|captain/i }));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(updateItem).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "item_0", designation: "C" }),
      ),
    );
  });

  it("takes a letter back off", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L", designation: "C" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Gretzky #99");
    await user.click(sheet.getByRole("radio", { name: /^none$|no letter/i }));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect((updateItem.mock.calls[0][0] as Record<string, unknown>).designation).toBeUndefined();
  });

  it("shows who added a player item, with their custom answers, read-only (UX §4)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([RILEY]);
    await renderPage();

    const sheet = await openEditSheet(user, "Sidestep #72");
    expect(sheet.getByText("Added by")).toBeInTheDocument();
    expect(sheet.getByText(/Riley Chen/)).toBeInTheDocument();
    expect(sheet.getByText(/riley@example\.test/)).toBeInTheDocument();
    expect(sheet.getByText(/through the order form/)).toBeInTheDocument();
    expect(sheet.getByText("Shirt colour?")).toBeInTheDocument();
    expect(sheet.getByText("Navy")).toBeInTheDocument();
    expect(sheet.getByText("Allergies?")).toBeInTheDocument();
    expect(sheet.getByText("None")).toBeInTheDocument();
    // Read-only: no input carries the submitter's email or answers.
    for (const input of sheet.getAllByRole("textbox"))
      expect(input).not.toHaveValue("riley@example.test");
  });

  it("leaves the player's name, email and answers out of the update call (provenance is never sent back)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([RILEY]);
    await renderPage();

    const sheet = await openEditSheet(user, "Sidestep #72");
    await user.click(sizePill(sheet, "L"));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    const args = updateItem.mock.calls[0][0] as Record<string, unknown>;
    for (const key of ["submitterName", "submitterEmail", "customAnswers", "source"])
      expect(args).not.toHaveProperty(key);
  });

  it("shows no `Added by … through the order form` block for the captain's own item", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Gretzky #99");
    expect(sheet.queryByText(/through the order form/)).toBeNull();
  });

  it("leaves the item alone when the sheet is dismissed without saving", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Gretzky #99");
    await user.click(sizePill(sheet, "XL"));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateItem).not.toHaveBeenCalled();
    expect(rowOf(groupFor("Home kit"), "Gretzky #99")).toHaveTextContent("L");
  });

  it("shows the server's sentence when a save is rejected", async () => {
    const user = userEvent.setup();
    updateItem.mockRejectedValueOnce(new ConvexError("The order is locked"));
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Gretzky #99");
    await user.click(sizePill(sheet, "XL"));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(toastTexts()).toContain("The order is locked"));
  });
});

describe("/portal/orders/[id] — remove with Undo (L-03, UX §8.5)", () => {
  const SIDESTEP = {
    name: "Sidestep",
    number: "72",
    size: "M",
    qty: 2,
    designation: "C" as const,
    source: "fan" as const,
    submitterName: "Riley Chen",
    submitterEmail: "riley@example.test",
  };

  async function removeFromSheet(user: ReturnType<typeof userEvent.setup>, label: string) {
    const sheet = await openEditSheet(user, label);
    await user.click(sheet.getByRole("button", { name: /^remove$/i }));
  }

  it("removes without a confirmation step, by item id", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([SIDESTEP]);
    await renderPage();

    await removeFromSheet(user, "Sidestep #72");

    await waitFor(() => expect(removeItem).toHaveBeenCalledWith({ itemId: "item_0" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText(/are you sure/i)).toBeNull();
  });

  it("toasts `Removed <Name> #<Number> (<Size>)` with an Undo action", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([SIDESTEP]);
    await renderPage();

    await removeFromSheet(user, "Sidestep #72");

    await waitFor(() =>
      expect(toastFn).toHaveBeenCalledWith(
        "Removed Sidestep #72 (M)",
        expect.objectContaining({
          action: expect.objectContaining({ label: "Undo", onClick: expect.any(Function) }),
        }),
      ),
    );
  });

  it("names a Needs-size item without a size in brackets", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Bure", number: "10" }]);
    await renderPage();

    await removeFromSheet(user, "Bure #10");

    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    const message = String(toastFn.mock.calls[0][0]);
    expect(message).toMatch(/^Removed Bure #10/);
    expect(message).not.toMatch(/undefined|\(\s*\)/);
  });

  it("drops the row and fixes the chips and footer when the list refreshes", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([SIDESTEP, { name: "Sosa", number: "25", size: "S" }]);
    await renderPage();
    expect(footerText(3)).toBe("3 items · S×1 M×2");

    await removeFromSheet(user, "Sidestep #72");
    await waitFor(() => expect(removeItem).toHaveBeenCalled());

    setItems([{ name: "Sosa", number: "25", size: "S" }]);
    await refresh();
    const home = groupFor("Home kit");
    expect(home.queryByText(/sidestep/i)).toBeNull();
    expect(chipsOf(home)).toEqual(["S×1"]);
    expect(footerText(1)).toBe("1 item · S×1");
  });

  it("Undo calls orderItems.restore with the removed item's id and brings the same row back (§8.5)", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    const before = [
      { name: "Gretzky", number: "99", size: "L" },
      SIDESTEP,
      { name: "Sosa", number: "25", size: "S" },
    ];
    setItems(before);
    await renderPage();

    await removeFromSheet(user, "Sidestep #72");
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    setItems([before[0], before[2]]);
    await refresh();
    expect(groupFor("Home kit").queryByText(/sidestep/i)).toBeNull();

    await act(async () => {
      await undoAction()();
    });
    expect(restoreItem).toHaveBeenCalledWith({ itemId: "item_1" });

    // Restore returns the same item (backend covers identity and original
    // position in convex/orderItems.test.ts); here the refreshed data shows it.
    setItems(before);
    await refresh();
    const home = groupFor("Home kit");
    const rows = rowsIn(home);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Gretzky #99"),
      expect.stringContaining("Sidestep #72"),
      expect.stringContaining("Sosa #25"),
    ]);
    const restored = rowOf(home, "Sidestep #72");
    expect(restored).toHaveTextContent("M");
    expect(restored).toHaveTextContent("×2");
    expect(within(restored).getByText("Captain")).toBeInTheDocument();
    expect(within(restored).getByText("Added by Riley")).toBeInTheDocument();
  });

  it("says so, readably, when Undo fails", async () => {
    const user = userEvent.setup();
    restoreItem.mockRejectedValueOnce(new ConvexError("The order is locked"));
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([SIDESTEP]);
    await renderPage();

    await removeFromSheet(user, "Sidestep #72");
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    await act(async () => {
      await undoAction()();
    });

    await waitFor(() => expect(toastTexts()).toContain("The order is locked"));
  });

  it("falls back to the approved sentence, never raw text, when Undo throws something unexpected", async () => {
    const user = userEvent.setup();
    restoreItem.mockRejectedValueOnce(
      new Error("[CONVEX M(orderItems:restore)] [Request ID: abc123] Server Error"),
    );
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([SIDESTEP]);
    await renderPage();

    await removeFromSheet(user, "Sidestep #72");
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    await act(async () => {
      await undoAction()();
    });

    await waitFor(() =>
      expect(toastError.mock.calls.map(([m]) => String(m))).toContain(
        "Could not restore that item. Please try again.",
      ),
    );
    for (const text of toastTexts()) expect(text).not.toMatch(LEAKS);
  });

  it("shows the server's sentence when a remove is rejected, and no Undo toast", async () => {
    const user = userEvent.setup();
    removeItem.mockRejectedValueOnce(new ConvexError("The order is locked"));
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([SIDESTEP]);
    await renderPage();

    await removeFromSheet(user, "Sidestep #72");

    await waitFor(() => expect(toastTexts()).toContain("The order is locked"));
    expect(toastFn).not.toHaveBeenCalledWith(
      expect.stringMatching(/^Removed /),
      expect.anything(),
    );
  });
});

describe("/portal/orders/[id] — paste a list (L-03; behaviour moved from the roster sheet, L-04 changes it later)", () => {
  // The clipboard, not the keyboard: `type` would mangle the tabs a
  // spreadsheet paste is made of.
  async function pasteInto(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.click(groupFor("Home kit").getByRole("button", { name: /^paste a list$/i }));
    const box = await screen.findByRole("textbox", { name: /paste/i });
    await user.click(box);
    await user.paste(text);
    return box;
  }

  function preview() {
    return within(screen.getByRole("list", { name: /paste preview/i }));
  }

  it("previews what a pasted block would create, with the real count on the button; nothing is written yet", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await pasteInto(user, "Gretzky\t99\n66\tLemieux");

    expect(preview().getByText("Gretzky #99")).toBeInTheDocument();
    expect(preview().getByText("Lemieux #66")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add 2\b/i })).toBeEnabled();
    expect(addMany).not.toHaveBeenCalled();
  });

  it("writes exactly the rows it promised, then returns to the list", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await pasteInto(user, "Gretzky\t99\nBo");
    await user.click(screen.getByRole("button", { name: /add 2\b/i }));

    await waitFor(() =>
      expect(addMany).toHaveBeenCalledWith({
        orderId: ORDER_ID,
        designId: "design_home",
        rows: [
          { name: "Gretzky", number: "99" },
          { name: "Bo", number: undefined },
        ],
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/\b2\b/));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: /paste/i })).toBeNull(),
    );
  });

  it("flags rows already on the design, repeats, and rows it can't read — and excludes all three", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    await pasteInto(user, "gretzky\t99\nLemieux\t66\nLEMIEUX\t66\n99");

    expect(screen.getByText(/already/i)).toBeInTheDocument();
    expect(screen.getByText(/repeated earlier/i)).toBeInTheDocument();
    expect(screen.getByText(/number but no name/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add 1\b/i }));
    await waitFor(() =>
      expect(addMany).toHaveBeenCalledWith({
        orderId: ORDER_ID,
        designId: "design_home",
        rows: [{ name: "Lemieux", number: "66" }],
      }),
    );
  });

  it("offers nothing to commit when every pasted row is already there", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    await pasteInto(user, "Gretzky\t99");

    expect(screen.getByRole("button", { name: /nothing to add/i })).toBeDisabled();
    expect(screen.getByText(/already/i)).toBeInTheDocument();
  });

  it("refuses a paste past the batch bound instead of previewing it", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await pasteInto(
      user,
      Array.from({ length: 201 }, (_, i) => `Player ${i}\t${i}`).join("\n"),
    );

    expect(screen.getByText(/too many rows/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nothing to add/i })).toBeDisabled();
  });

  it("shows a rejected commit's sentence and keeps the paste on screen", async () => {
    const user = userEvent.setup();
    addMany.mockRejectedValueOnce(new ConvexError("This order is locked."));
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await pasteInto(user, "Gretzky\t99");
    await user.click(screen.getByRole("button", { name: /add 1\b/i }));

    await waitFor(() => expect(toastTexts()).toContain("This order is locked."));
    expect(screen.getByRole("textbox", { name: /paste/i })).toBeInTheDocument();
  });

  it("falls back to the approved sentence when a commit throws raw server text", async () => {
    const user = userEvent.setup();
    addMany.mockRejectedValueOnce(
      new Error("[CONVEX M(orderItems:addMany)] [Request ID: abc123] Server Error"),
    );
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await pasteInto(user, "Gretzky\t99");
    await user.click(screen.getByRole("button", { name: /add 1\b/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    for (const text of toastTexts()) expect(text).not.toMatch(LEAKS);
    expect(toastTexts()).toContain(FALLBACK);
  });

  it("leaves the list alone when the paste is cancelled", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await pasteInto(user, "Gretzky\t99");
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(addMany).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: /paste/i })).toBeNull(),
    );
  });

  it("offers Paste a list on an order with no order form", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([]);
    await renderPage();

    await pasteInto(user, "Gretzky\t99");
    await user.click(screen.getByRole("button", { name: /add 1\b/i }));
    await waitFor(() =>
      expect(addMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: ORDER_ID, designId: "design_home" }),
      ),
    );
  });
});

describe("/portal/orders/[id] — copy from another design (L-03; moved from the roster sheet)", () => {
  async function pickSource(user: ReturnType<typeof userEvent.setup>, title: RegExp) {
    await user.click(groupFor("Home kit").getByRole("button", { name: /^copy from/i }));
    await user.click(await screen.findByRole("menuitem", { name: title }));
  }

  function twoDesigns() {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([
      { designId: "design_away", name: "Luongo", number: "1", size: "M" },
    ]);
  }

  it("offers the order's other designs as sources, and nothing is copied until one is picked", async () => {
    const user = userEvent.setup();
    twoDesigns();
    await renderPage();

    await user.click(groupFor("Home kit").getByRole("button", { name: /^copy from/i }));
    expect(await screen.findByRole("menuitem", { name: /away kit/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /home kit/i })).toBeNull();
    expect(copyToDesign).not.toHaveBeenCalled();
  });

  it("copies from the picked design into this one and reports the outcome", async () => {
    const user = userEvent.setup();
    copyToDesign.mockResolvedValueOnce({ copied: 18, skipped: 2 });
    twoDesigns();
    await renderPage();

    await pickSource(user, /away kit/i);

    await waitFor(() =>
      expect(copyToDesign).toHaveBeenCalledWith({
        orderId: ORDER_ID,
        sourceDesignId: "design_away",
        targetDesignId: "design_home",
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith("18 copied, 2 already there");
  });

  it("reads as already-done when the copy skipped everything", async () => {
    const user = userEvent.setup();
    copyToDesign.mockResolvedValueOnce({ copied: 0, skipped: 15 });
    twoDesigns();
    await renderPage();

    await pickSource(user, /away kit/i);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/already/i)),
    );
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says nothing about copying when the order has only one design", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    expect(listCard().queryByRole("button", { name: /copy from/i })).toBeNull();
  });

  it("shows a rejected copy's sentence", async () => {
    const user = userEvent.setup();
    copyToDesign.mockRejectedValueOnce(new ConvexError("This order is locked."));
    twoDesigns();
    await renderPage();

    await pickSource(user, /away kit/i);

    await waitFor(() => expect(toastTexts()).toContain("This order is locked."));
  });
});

describe("/portal/orders/[id] — locked: the list is read-only (L-03, UX §8.9)", () => {
  const ITEMS: FixtureItem[] = [
    { name: "Gretzky", number: "99", size: "L", designation: "C" },
    { name: "Bure", number: "10" },
  ];

  async function lockedPage(opts: { form?: boolean } = { form: true }) {
    orderResult = orderWith(
      [design(), design({ _id: "design_away" as Id<"designs">, title: "Away kit" })],
      { locked: true },
    );
    runResult = opts.form ? { ...RUN, status: "open", effectiveStatus: "locked" } : null;
    setItems(ITEMS, { locked: true });
    await renderPage();
  }

  it("renders no add, paste, copy, edit or remove control when canEdit is false", async () => {
    await lockedPage();

    const card = listCard();
    expect(card.queryByRole("button", { name: /add item/i })).toBeNull();
    expect(card.queryByRole("button", { name: /paste a list/i })).toBeNull();
    expect(card.queryByRole("button", { name: /copy from/i })).toBeNull();
    expect(card.queryByRole("button", { name: /^edit /i })).toBeNull();
    expect(card.queryByRole("button", { name: /remove/i })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps every row, chip and the footer visible", async () => {
    await lockedPage();

    const home = groupFor("Home kit");
    expect(rowOf(home, "Gretzky #99")).toHaveTextContent("L");
    expect(within(rowOf(home, "Gretzky #99")).getByText("Captain")).toBeInTheDocument();
    expect(within(rowOf(home, "Bure #10")).getByText("Needs size")).toBeInTheDocument();
    expect(footerText(1)).toBe("1 item · L×1");
  });

  it("still offers Download CSV, enabled where there are items", async () => {
    await lockedPage();

    expect(
      groupFor("Home kit").getByRole("button", { name: /download csv/i }),
    ).toBeEnabled();
  });

  it("is read-only on an order with no form too", async () => {
    await lockedPage({ form: false });

    expect(listCard().queryByRole("button", { name: /add item|paste a list|^edit /i })).toBeNull();
    expect(
      groupFor("Home kit").getByRole("button", { name: /download csv/i }),
    ).toBeEnabled();
  });

  it("brings the controls back when the same order is unlocked (no stale lock)", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems(ITEMS, { locked: true });
    await renderPage();
    expect(listCard().queryByRole("button", { name: /add item/i })).toBeNull();

    setItems(ITEMS, { locked: false });
    await refresh();
    expect(listCard().getByRole("button", { name: /add item/i })).toBeInTheDocument();
    expect(listCard().getByRole("button", { name: "Edit Gretzky #99" })).toBeInTheDocument();
  });
});

describe("/portal/orders/[id] — export a design's list (M-08, retargeted by L-03)", () => {
  const GRETZKY: FixtureItem = { name: "Gretzky", number: "99", size: "L" };

  it("puts Download CSV on the design's group", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([GRETZKY]);
    await renderPage();

    const home = groupFor("Home kit");
    expect(home.getByRole("button", { name: /download csv/i })).toBeEnabled();
    expect(home.queryByRole("button", { name: /export csv|manage roster/i })).toBeNull();
  });

  it("offers it on an order with no form yet", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([GRETZKY]);
    await renderPage();

    expect(groupFor("Home kit").getByRole("button", { name: /download csv/i })).toBeEnabled();
  });

  it("offers it for a design whose only items still need a size (they export with a blank size)", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Bure", number: "10" }]);
    await renderPage();

    expect(groupFor("Home kit").getByRole("button", { name: /download csv/i })).toBeEnabled();
  });

  it("disables it on a design with nothing on its list", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    expect(groupFor("Home kit").getByRole("button", { name: /download csv/i })).toBeDisabled();
  });

  it("gives each design its own button", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([GRETZKY]);
    await renderPage();

    expect(groupFor("Home kit").getByRole("button", { name: /download csv/i })).toBeEnabled();
    expect(groupFor("Away kit").getByRole("button", { name: /download csv/i })).toBeDisabled();
  });
});

describe("/portal/orders/[id] — no raw server text reaches the captain (L-03, UX §8.10)", () => {
  const RAW = new Error(
    "[CONVEX M(orderItems:add)] [Request ID: 9f3a1c] Server Error Uncaught ConvexError at /app/convex/orderItems.ts:41",
  );

  it("turns a raw add rejection into the approved sentence", async () => {
    const user = userEvent.setup();
    addItem.mockRejectedValueOnce(RAW);
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    await user.type(sheet.getByLabelText("Name on jersey"), "Sosa");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(toastTexts()).toContain(FALLBACK));
    for (const text of toastTexts()) expect(text).not.toMatch(LEAKS);
    expect(document.body.textContent).not.toMatch(LEAKS);
  });

  it("turns a raw save rejection into the approved sentence", async () => {
    const user = userEvent.setup();
    updateItem.mockRejectedValueOnce(RAW);
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Gretzky #99");
    await user.click(sizePill(sheet, "XL"));
    await user.click(sheet.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(toastTexts()).toContain(FALLBACK));
    for (const text of toastTexts()) expect(text).not.toMatch(LEAKS);
    expect(document.body.textContent).not.toMatch(LEAKS);
  });

  it("turns a raw remove rejection into the approved sentence", async () => {
    const user = userEvent.setup();
    removeItem.mockRejectedValueOnce(RAW);
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Gretzky #99");
    await user.click(sheet.getByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastTexts()).toContain(FALLBACK);
    for (const text of toastTexts()) expect(text).not.toMatch(LEAKS);
  });

  it("turns a raw copy rejection into a sentence with no server text", async () => {
    const user = userEvent.setup();
    copyToDesign.mockRejectedValueOnce(RAW);
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([{ designId: "design_away", name: "Luongo", number: "1", size: "M" }]);
    await renderPage();

    await user.click(groupFor("Home kit").getByRole("button", { name: /^copy from/i }));
    await user.click(await screen.findByRole("menuitem", { name: /away kit/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    for (const text of toastTexts()) expect(text).not.toMatch(LEAKS);
  });
});

describe("/portal/orders/[id] — the new list's words (L-03, UX §8.13)", () => {
  it("uses none of roster, slot, jersey run, collected or responses in the list card", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L", designation: "C" },
      { name: "Bure", number: "10" },
      { name: "Sosa", number: "25", size: "S", source: "fan", submitterName: "Riley Chen", submitterEmail: "r@example.test" },
    ]);
    await renderPage();

    expect(screen.getByRole("region", { name: "Order list" }).textContent).not.toMatch(
      FORBIDDEN_NEW_COPY,
    );
  });

  it("uses none of them in the empty state or the locked list either", async () => {
    orderResult = orderWith([design()], { locked: true });
    runResult = RUN;
    setItems([], { locked: true });
    await renderPage();

    expect(screen.getByRole("region", { name: "Order list" }).textContent).not.toMatch(
      FORBIDDEN_NEW_COPY,
    );
  });

  it("uses none of them in the add sheet", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await openAddSheet(user);
    expect(screen.getByRole("dialog").textContent).not.toMatch(FORBIDDEN_NEW_COPY);
  });

  it("uses none of them in the edit sheet for a player's item", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      {
        name: "Sosa",
        number: "25",
        size: "S",
        source: "fan",
        submitterName: "Riley Chen",
        submitterEmail: "r@example.test",
      },
    ]);
    await renderPage();

    await openEditSheet(user, "Sosa #25");
    // The player's own answers are theirs to word; everything else is ours.
    const text = (screen.getByRole("dialog").textContent ?? "").replace(/Riley Chen|r@example\.test/g, "");
    expect(text).not.toMatch(FORBIDDEN_NEW_COPY);
  });

  it("uses none of them in the paste and copy surfaces", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    await user.click(groupFor("Home kit").getByRole("button", { name: /^copy from/i }));
    const menu = await screen.findByRole("menuitem", { name: /away kit/i });
    expect(menu.closest("[role=menu]")?.textContent ?? "").not.toMatch(FORBIDDEN_NEW_COPY);
    await user.keyboard("{Escape}");

    await user.click(groupFor("Home kit").getByRole("button", { name: /^paste a list$/i }));
    await user.click(await screen.findByRole("textbox", { name: /paste/i }));
    await user.paste("Gretzky\t99\ngretzky\t99\n99");
    const surface = (screen.queryByRole("dialog") ?? listCard().getByRole("group", { name: "Home kit" })) as HTMLElement;
    expect(surface.textContent).not.toMatch(FORBIDDEN_NEW_COPY);
  });

  it("uses none of them in the toasts it raises", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Sidestep", number: "72", size: "M" }]);
    await renderPage();

    const sheet = await openEditSheet(user, "Sidestep #72");
    await user.click(sheet.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    for (const text of toastTexts()) expect(text).not.toMatch(FORBIDDEN_NEW_COPY);
  });
});

describe("/portal/orders/[id] — keyboard and screen-reader semantics (L-03, UX §8.11, jsdom part)", () => {
  it("reaches `+ Add item`, Paste a list and every row menu with Tab, in reading order", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L" },
      { name: "Sosa", number: "25", size: "S" },
    ]);
    await renderPage();

    const seen: string[] = [];
    for (let i = 0; i < 60; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      if (el === document.body) break;
      seen.push(
        el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName,
      );
    }
    const at = (name: RegExp) => seen.findIndex((s) => name.test(s));
    expect(at(/^\+ add item$/i)).toBeGreaterThanOrEqual(0);
    expect(at(/^paste a list$/i)).toBeGreaterThanOrEqual(0);
    expect(at(/^edit gretzky #99$/i)).toBeGreaterThanOrEqual(0);
    expect(at(/^edit sosa #25$/i)).toBeGreaterThan(at(/^edit gretzky #99$/i));
  });

  it("makes every list control a real button or menu item (no clickable divs)", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    for (const name of [/^\+ add item$/i, /^paste a list$/i, /^edit gretzky #99$/i, /download csv/i]) {
      const el = listCard().getByRole("button", { name });
      expect(["BUTTON", "A"]).toContain(el.tagName);
    }
  });

  it("opens a row's sheet from the keyboard and moves focus into it", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    listCard().getByRole("button", { name: "Edit Gretzky #99" }).focus();
    await user.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog", { name: /edit item/i });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  });

  it("keeps Tab inside the open sheet", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await openAddSheet(user);
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 25; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("returns focus to the control that opened the sheet when Escape closes it", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const opener = listCard().getByRole("button", { name: "Edit Gretzky #99" });
    await user.click(opener);
    await screen.findByRole("dialog", { name: /edit item/i });
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("labels the size pills and the letter choice so a screen reader can name them", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    const sheet = await openAddSheet(user);
    expect(sizePill(sheet, "M")).toHaveAccessibleName("M");
    expect(sheet.getAllByRole("radio").length).toBeGreaterThanOrEqual(3);
  });
});

describe("/portal/orders/[id] — a refreshed query updates every scope at once (L-03, §8.4/§8.5, jsdom part)", () => {
  it("moves the row, the design line, the chips and the footer together when an item changes size, is added and is removed", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "M" }]);
    await renderPage();
    expect(footerText(1)).toBe("1 item · M×1");

    setItems([
      { name: "Gretzky", number: "99", size: "L" },
      { name: "Sosa", number: "25", size: "S" },
      { name: "Bure", number: "10" },
    ]);
    await refresh();
    const home = groupFor("Home kit");
    expect(home.getByText(/^2 items\s*·\s*1 needs a size$/)).toBeInTheDocument();
    expect(chipsOf(home)).toEqual(["S×1", "L×1"]);
    expect(footerText(2)).toBe("2 items · S×1 L×1");
    expect(rowsIn(home)).toHaveLength(3);

    setItems([]);
    await refresh();
    expect(rowsIn(groupFor("Home kit"))).toHaveLength(0);
    expect(groupFor("Home kit").getByText("Nothing on the list yet")).toBeInTheDocument();
  });
});


// M-05: the run is created here, from a deadline and nothing else, and the
// names-mode switch sits beside the designs whose rosters it governs.
describe("/portal/orders/[id] — start collecting & names mode (M-05)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2099-04-01T12:00:00Z"),
    namesMode: "open" as const,
    status: "open",
    effectiveStatus: "open" as const,
  };

  it("starts a run from a deadline alone — no sizes, no names mode", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = null;
    await renderPage();

    await user.click(screen.getByRole("button", { name: /start collecting/i }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.queryByRole("checkbox", { name: /^xl$/i })).toBeNull();
    expect(dialog.queryByRole("radio", { name: /fixed roster/i })).toBeNull();

    await user.type(dialog.getByLabelText(/deadline/i), "2099-08-01");
    await user.click(
      dialog.getByRole("button", { name: /start collecting/i }),
    );

    await waitFor(() => {
      expect(mutationStub).toHaveBeenCalledTimes(1);
    });
    expect(mutationStub).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      deadline: Date.parse("2099-08-01T23:59:59.999Z"),
    });
  });

  it("refuses to start collecting without a deadline", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = null;
    await renderPage();

    await user.click(screen.getByRole("button", { name: /start collecting/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: /start collecting/i }));

    expect(await dialog.findByRole("alert")).toHaveTextContent(/deadline/i);
    expect(mutationStub).not.toHaveBeenCalled();
  });

  it("offers no way to start collecting before a design is attached", async () => {
    orderResult = orderWith([]);
    runResult = null;
    await renderPage();

    expect(
      screen.queryByRole("button", { name: /start collecting/i }),
    ).toBeNull();
    expect(screen.getByText(/attach a design above first/i)).toBeInTheDocument();
  });

  it("switches names mode to fixed from beside the designs", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    await user.click(screen.getByRole("radio", { name: /fixed roster/i }));

    await waitFor(() => {
      expect(mutationStub).toHaveBeenCalledWith({
        jerseyRunId: RUN._id,
        namesMode: "fixed",
      });
    });
  });

  // The reverse direction matters as much: nothing is lost either way, so the
  // captain is never trapped in a mode they picked by accident.
  it("switches back to open names with no confirmation", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = { ...RUN, namesMode: "fixed" as const };
    setItems([]);
    await renderPage();

    await user.click(
      screen.getByRole("radio", { name: /each person types their own/i }),
    );

    await waitFor(() => {
      expect(mutationStub).toHaveBeenCalledWith({
        jerseyRunId: RUN._id,
        namesMode: "open",
      });
    });
  });

  it("offers no names-mode switch before a run exists", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    await renderPage();

    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("warns that nobody can order a fixed-mode design with no players", async () => {
    orderResult = orderWith([design()]);
    runResult = { ...RUN, namesMode: "fixed" as const };
    setItems([]);
    await renderPage();

    const warning = within(sectionFor("Home kit")).getByRole("note", {
      name: /nobody can order home kit/i,
    });
    expect(warning).toHaveTextContent(/nobody can order this design/i);
    // A warning, not a block: the list editor is still right there.
    expect(
      groupFor("Home kit").getByRole("button", {
        name: /^\+ add item$/i,
      }),
    ).toBeInTheDocument();
  });

  it("drops the warning once the design has a player", async () => {
    orderResult = orderWith([design()]);
    runResult = { ...RUN, namesMode: "fixed" as const };
    setItems([{ name: "Gretzky", number: "99" }]);
    await renderPage();

    expect(
      within(sectionFor("Home kit")).queryByRole("note", {
        name: /nobody can order/i,
      }),
    ).toBeNull();
  });

  it("does not warn an open-mode design with no players", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    expect(
      within(sectionFor("Home kit")).queryByRole("note", {
        name: /nobody can order/i,
      }),
    ).toBeNull();
  });
});
describe("/portal/orders/[id] — frozen once the roster is locked (O-06)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
  };

  function editLinks() {
    return screen.queryAllByRole("link", {
      name: /edit order|manage designs|attach a design/i,
    });
  }

  it("keeps every edit affordance while the roster is unlocked", async () => {
    orderResult = orderWith([design()]);
    runResult = { ...RUN, status: "open", effectiveStatus: "open" };
    await renderPage();

    expect(
      screen.getByRole("link", { name: /edit order/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /manage designs/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("drops the edit affordances and explains who to contact when locked", async () => {
    orderResult = orderWith([design()], { locked: true });
    runResult = { ...RUN, status: "locked", effectiveStatus: "locked" };
    await renderPage();

    expect(editLinks()).toHaveLength(0);
    const note = screen.getByRole("note", { name: /locked/i });
    expect(note).toHaveTextContent(/locked/i);
    expect(note).toHaveTextContent(/sidestep/i);
  });

  it("still offers the design's own page when locked — designs stay editable", async () => {
    orderResult = orderWith([design()], { locked: true });
    runResult = { ...RUN, status: "locked", effectiveStatus: "locked" };
    await renderPage();

    expect(
      within(sectionFor("Home kit")).getByRole("link", { name: /view design/i }),
    ).toBeInTheDocument();
  });

  // With no design attached the unlocked page nudges "Attach a design"; a
  // locked order can't attach one, so the empty state must not pretend it can.
  it("does not invite attaching a design to a locked order with none", async () => {
    orderResult = orderWith([], { locked: true });
    runResult = { ...RUN, status: "locked", effectiveStatus: "locked" };
    await renderPage();

    expect(editLinks()).toHaveLength(0);
  });

  // Lazy auto-lock (R-06): the run row still reads "open" past its deadline,
  // so the badge has to follow `effectiveStatus`, not the stored status.
  it("shows the run as locked when it has auto-locked past its deadline", async () => {
    orderResult = orderWith([design()], { locked: true });
    runResult = { ...RUN, status: "open", effectiveStatus: "locked" };
    await renderPage();

    expect(screen.getByText(/roster locked/i)).toBeInTheDocument();
    expect(screen.queryByText(/^collecting$/i)).toBeNull();
  });
});
