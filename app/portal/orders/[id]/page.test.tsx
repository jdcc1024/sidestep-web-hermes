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

// Queries are told apart by function name, not args shape, so the page can
// grow another query without silently re-pointing one of these stubs. The
// page reads its order, the run behind the collect CTA and names mode, the
// order's items (L-02: one `orderItems.listForOrder` subscription behind the
// total, per-design counts, size chips, roster preview, sheet and CSV), and
// (through RemovedDesigns) the O-08 receipt.
let orderResult: unknown = undefined;
let runResult: unknown = null;
let itemsResult: unknown = undefined;
let removedResult: unknown = [];
// Every query name the page subscribed to, so a test can pin "one list".
const queried = new Set<string>();
// Convex's view of auth (B-03). Settled-and-signed-in is the resting state;
// the flash tests below rewind it to the token-attach window.
let auth = { isLoading: false, isAuthenticated: true };

// The roster sheet (M-02) writes through the orderItems mutations; the page
// itself never calls one, so a shared no-op stub is enough.
const mutationStub = vi.fn(async (_args?: unknown) => undefined);

// L-02: the legacy readers are gone from this page. A stub that answered them
// would let a half-migrated page pass on stale numbers, so they throw.
const LEGACY_READERS = new Set([
  "orderEntries:countsByRun",
  "jerseyRuns:listOrderEntries",
  "rosterEntries:listForRun",
]);

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: () => mutationStub,
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
// render — awaiting inside act lets the resolved params commit.
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<p>Loading page</p>}>
        <OrderDetailPage params={Promise.resolve({ id: ORDER_ID })} />
      </Suspense>,
    );
  });
}

function sectionFor(title: string) {
  return screen.getByLabelText(`Design: ${title}`);
}

afterEach(() => {
  vi.clearAllMocks();
  orderResult = undefined;
  runResult = null;
  itemsResult = undefined;
  removedResult = [];
  queried.clear();
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

describe("/portal/orders/[id] — order total derived from the roster (O-07)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  it("shows the live order total from the roster, not the intake estimate", async () => {
    // estimatedQuantity is 12, but eight jerseys have actually been collected.
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([sized("design_home", "M", 5), sized("design_home", "L", 3)]);
    await renderPage();

    // The derived total (8) is the headline number; the estimate (12) is
    // still shown, but plainly labelled as the intake seed.
    expect(screen.getByText(/8 collected/i)).toBeInTheDocument();
    const estimate = screen.getByText(/estimated at intake/i).closest("div");
    expect(within(estimate as HTMLElement).getByText("12 jerseys")).toBeInTheDocument();
  });

  it("gives each design section its own count derived from its rows", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([sized("design_home", "M", 9), sized("design_away", "L", 6)]);
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(home.getByText("9")).toBeInTheDocument();
    expect(home.getByText(/jerseys collected/i)).toBeInTheDocument();

    const away = within(sectionFor("Away kit"));
    expect(away.getByText("6")).toBeInTheDocument();
    expect(away.getByText(/jerseys collected/i)).toBeInTheDocument();
  });

  it("reads 0 for an empty roster and never falls back to the estimate", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    expect(screen.getByText(/0 collected/i)).toBeInTheDocument();
    // The design section says nothing has been collected yet, not "12".
    const section = within(sectionFor("Home kit"));
    expect(section.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
    expect(section.queryByText("12")).toBeNull();
  });

  it("reads 0 while the list is still loading, never the estimate", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    itemsResult = undefined;
    await renderPage();

    expect(screen.getByText(/0 collected/i)).toBeInTheDocument();
  });

  // L-02 / UX §7.3: items exist before any form, so they count before one.
  it("counts the captain's sized items on an order with no form yet", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([sized("design_home", "M", 2), sized("design_home", "L", 1)]);
    await renderPage();

    expect(screen.getByText(/3 collected/i)).toBeInTheDocument();
    expect(within(sectionFor("Home kit")).getByText("3")).toBeInTheDocument();
  });

  // UX §7.5: a Needs-size item is not a jersey for production yet.
  it("leaves Needs-size and removed-design items out of the total", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      sized("design_home", "M", 2),
      { designId: "design_home", name: "Bure", number: "10" },
      sized("design_warmup", "L", 4),
    ]);
    await renderPage();

    expect(screen.getByText(/2 collected/i)).toBeInTheDocument();
  });
});

// L-02 (§7.9): total, per-design counts, size chips, roster preview and CSV
// all come from one `orderItems.listForOrder` subscription, so they can't
// disagree.
describe("/portal/orders/[id] — one order list behind every count (L-02, §7.9)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  it("subscribes to orderItems.listForOrder and none of the legacy readers", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    expect(queried.has("orderItems:listForOrder")).toBe(true);
    for (const legacy of LEGACY_READERS) expect(queried.has(legacy)).toBe(false);
  });

  it("shows the same number in the header, the design count, the chips and the preview rows", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L", qty: 2 },
      { name: "Sosa", number: "25", size: "S" },
      sized("design_home", "M", 2),
      { name: "Bure", number: "10" },
    ]);
    await renderPage();

    // 2 + 1 + 2 sized; Bure needs a size and counts nowhere.
    expect(screen.getByText(/5 collected/i)).toBeInTheDocument();
    const home = within(sectionFor("Home kit"));
    expect(home.getByText("5")).toBeInTheDocument();
    const chips = within(screen.getByRole("list", { name: /size breakdown/i }));
    expect(chips.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "S ×1",
      "M ×2",
      "L ×2",
    ]);
    expect(home.getByRole("listitem", { name: /gretzky #99/i })).toHaveTextContent(
      "L ×2",
    );
    expect(home.getByRole("listitem", { name: /sosa #25/i })).toHaveTextContent("S");
    expect(home.getByRole("listitem", { name: /bure #10/i })).toHaveTextContent(
      /not yet filled/i,
    );
  });
});

// The design cards read the order's items (M-01, re-plumbed by L-02): a
// player the captain added who has no size yet still shows up here, muted,
// which is the disagreement between this page and the roster editor that the
// read exists to end.
describe("/portal/orders/[id] — per-design roster preview (M-01)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  it("lists each design's roster with the sizes ordered against each player", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L" },
      { name: "Sosa", number: "25", size: "S" },
      { designId: "design_away", name: "Luongo", number: "1", size: "M" },
    ]);
    await renderPage();

    const home = within(sectionFor("Home kit"));
    const gretzky = home.getByRole("listitem", { name: /gretzky #99/i });
    expect(within(gretzky).getByText("L")).toBeInTheDocument();
    expect(
      home.getByRole("listitem", { name: /sosa #25/i }),
    ).toHaveTextContent("S");
    // The away player belongs to the away design's section, not this one.
    expect(home.queryByText(/luongo/i)).toBeNull();

    expect(
      within(sectionFor("Away kit")).getByRole("listitem", {
        name: /luongo #1/i,
      }),
    ).toHaveTextContent("M");
  });

  it("shows a Needs-size player nobody has ordered for, muted", async () => {
    // The count says 0 and the card still proves the captain's entry saved.
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Bure", number: "10" }]);
    await renderPage();

    const home = within(sectionFor("Home kit"));
    const bure = home.getByRole("listitem", { name: /bure #10/i });
    expect(within(bure).getByText(/not yet filled/i)).toBeInTheDocument();
    // The rollup still reads honestly — nothing has a size yet.
    expect(home.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
  });

  it("shows the design's bulk jerseys as a blank line with its quantity", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([sized("design_home", "XL", 4)]);
    await renderPage();

    const blank = within(sectionFor("Home kit")).getByRole("listitem", {
      name: /blank/i,
    });
    expect(blank).toHaveTextContent("XL");
    expect(blank).toHaveTextContent("×4");
  });

  it("keeps the empty treatment for a design with no items at all", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const away = within(sectionFor("Away kit"));
    expect(away.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
    expect(away.queryByRole("list", { name: /roster/i })).toBeNull();
  });

  it("reconciles each design's rows with the count already shown", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L", qty: 3 },
      { name: "Sosa", number: "25", size: "S", qty: 2 },
    ]);
    await renderPage();

    const home = within(sectionFor("Home kit"));
    // The rollup says 5; the rows below it add up to the same 5.
    expect(home.getByText("5")).toBeInTheDocument();
    expect(
      home.getByRole("listitem", { name: /gretzky #99/i }),
    ).toHaveTextContent("L ×3");
    expect(
      home.getByRole("listitem", { name: /sosa #25/i }),
    ).toHaveTextContent("S ×2");
  });

  it("shows a fifteen-player roster in full (M-06)", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems(
      Array.from({ length: 15 }, (_, i) => ({
        name: `Player ${i}`,
        number: `${i}`,
      })),
    );
    await renderPage();

    const home = within(sectionFor("Home kit"));
    // The last player is the one a captain scrolls down to check, so it is
    // the one the old six-row cap always hid.
    expect(home.getByRole("listitem", { name: /player 0 #0/i })).toBeInTheDocument();
    expect(
      home.getByRole("listitem", { name: /player 14 #14/i }),
    ).toBeInTheDocument();
    expect(home.queryByText(/\bmore\b/i)).toBeNull();
  });

  it("leaves removed-design items out of every linked design's preview", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L" },
      { designId: "design_warmup", name: "Stray", number: "7", size: "M" },
    ]);
    await renderPage();

    expect(
      within(sectionFor("Home kit")).queryByRole("listitem", { name: /stray/i }),
    ).toBeNull();
  });

  // L-02 / UX §7.3: items exist before a form, so the preview does too.
  it("renders the captain's items before a form exists", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([{ name: "Gretzky", number: "99", size: "L" }]);
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(
      home.getByRole("listitem", { name: /gretzky #99/i }),
    ).toHaveTextContent("L");
  });

  it("renders no roster before the list has loaded", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    itemsResult = undefined;
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(home.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
    expect(home.queryByRole("list", { name: /roster/i })).toBeNull();
  });
});

// Roster editing lives on the card (M-02): the preview above is the summary,
// the sheet behind this button is the whole roster. Since L-02 an item hangs
// off the order, not a run, so the sheet is there before any form exists.
describe("/portal/orders/[id] — roster sheet on the design card (M-02)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  const GRETZKY: FixtureItem = { name: "Gretzky", number: "99", size: "L" };

  it("opens the design's whole roster from a Manage roster button", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([GRETZKY]);
    await renderPage();

    await user.click(
      within(sectionFor("Home kit")).getByRole("button", {
        name: /manage roster/i,
      }),
    );

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByRole("listitem", { name: /gretzky #99/i })).toBeInTheDocument();
    expect(sheet.getByLabelText(/add player name/i)).toBeInTheDocument();
  });

  // L-02 acceptance: "On an order with no run, the captain can open the
  // roster sheet and add a player (§7.3)."
  it("opens the sheet and adds a player on an order with no form yet", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([]);
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(home.queryByText(/start collecting below/i)).toBeNull();
    await user.click(home.getByRole("button", { name: /manage roster/i }));

    const sheet = within(await screen.findByRole("dialog"));
    await user.type(sheet.getByLabelText(/add player name/i), "Lemieux");
    await user.type(sheet.getByLabelText(/add player number/i), "66");
    await user.click(sheet.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(mutationStub).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          designId: "design_home",
          name: "Lemieux",
          number: "66",
        }),
      ),
    );
    expect(mutationStub).not.toHaveBeenCalledWith(
      expect.objectContaining({ runId: expect.anything() }),
    );
  });

  // L-02 acceptance: "removing a sized player succeeds (§7.4)".
  it("removes a sized player by its item id", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([GRETZKY]);
    await renderPage();

    await user.click(
      within(sectionFor("Home kit")).getByRole("button", {
        name: /manage roster/i,
      }),
    );
    const sheet = within(await screen.findByRole("dialog"));
    await user.click(sheet.getByRole("button", { name: /remove gretzky/i }));

    await waitFor(() =>
      expect(mutationStub).toHaveBeenCalledWith({ itemId: "item_0" }),
    );
  });

  it("opens read-only once the order has locked", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()], { locked: true });
    runResult = { ...RUN, status: "open", effectiveStatus: "locked" };
    setItems([GRETZKY], { locked: true });
    await renderPage();

    await user.click(
      within(sectionFor("Home kit")).getByRole("button", {
        name: /view roster/i,
      }),
    );

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByRole("listitem", { name: /gretzky #99/i })).toBeInTheDocument();
    expect(sheet.queryByLabelText(/add player name/i)).toBeNull();
    expect(sheet.queryByRole("button", { name: /edit gretzky/i })).toBeNull();
  });
});

// M-08: the roster the card is showing, downloadable as a CSV. Only the wiring
// is asserted here — the file's own shape is `lib/rosterExport.test.ts`, and
// the download plumbing is `RosterExportButton.test.tsx`.
describe("/portal/orders/[id] — export a design's roster (M-08)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  const GRETZKY: FixtureItem = { name: "Gretzky", number: "99", size: "L" };

  it("puts Export CSV beside Manage roster on the design card", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([GRETZKY]);
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(home.getByRole("button", { name: /manage roster/i })).toBeInTheDocument();
    expect(home.getByRole("button", { name: /export csv/i })).toBeEnabled();
  });

  it("still offers the export once the order has locked", async () => {
    orderResult = orderWith([design()], { locked: true });
    runResult = { ...RUN, status: "open", effectiveStatus: "locked" };
    setItems([GRETZKY], { locked: true });
    await renderPage();

    expect(
      within(sectionFor("Home kit")).getByRole("button", { name: /export csv/i }),
    ).toBeEnabled();
  });

  // L-02: the captain's items are exportable before a form exists.
  it("offers the export on an order with no form yet", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    setItems([GRETZKY]);
    await renderPage();

    expect(
      within(sectionFor("Home kit")).getByRole("button", { name: /export csv/i }),
    ).toBeEnabled();
  });

  it("disables the export on a design whose roster is still empty", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([]);
    await renderPage();

    expect(
      within(sectionFor("Home kit")).getByRole("button", { name: /export csv/i }),
    ).toBeDisabled();
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
    // A warning, not a block: the roster editor is still right there.
    expect(
      within(sectionFor("Home kit")).getByRole("button", {
        name: /manage roster/i,
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

describe("/portal/orders/[id] — size breakdown across the order (C-01)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  it("shows the combined size breakdown across every design", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "M", qty: 3 },
      { name: "Sosa", number: "25", size: "S" },
      sized("design_away", "M", 2),
    ]);
    await renderPage();

    const breakdown = within(screen.getByRole("list", { name: /size breakdown/i }));
    // Sizes read in canonical order, summed across both designs.
    expect(breakdown.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "S ×1",
      "M ×5",
    ]);
  });

  it("shows no size breakdown before anything has a size", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([{ name: "Bure", number: "10" }]);
    await renderPage();

    expect(screen.queryByRole("list", { name: /size breakdown/i })).toBeNull();
  });

  it("shows no size breakdown before the list has loaded", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    itemsResult = undefined;
    await renderPage();

    expect(screen.queryByRole("list", { name: /size breakdown/i })).toBeNull();
  });

  it("leaves a since-removed design's jerseys out of the breakdown", async () => {
    // Those jerseys keep their own section further down (O-08); they must
    // not inflate the size run of the designs the order still carries.
    orderResult = orderWith([design()]);
    runResult = RUN;
    setItems([
      { name: "Gretzky", number: "99", size: "L" },
      { designId: "design_warmup", name: "Bure", number: "10", size: "M" },
    ]);
    await renderPage();

    const breakdown = within(screen.getByRole("list", { name: /size breakdown/i }));
    expect(breakdown.getAllByRole("listitem")).toHaveLength(1);
    expect(breakdown.getByText("L ×1")).toBeInTheDocument();
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
