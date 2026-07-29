// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Queries are told apart by function name, not args shape, so the page can
// grow another query without silently re-pointing one of these stubs. The
// page reads its order, the run behind the collect CTA, the derived roster
// counts (O-07), the collected entries behind the size breakdown (C-01), the
// unified per-design roster behind the card previews (M-01), and (through
// RemovedDesigns) the O-08 receipt.
let orderResult: unknown = undefined;
let runResult: unknown = null;
let countsResult: unknown = undefined;
let entriesResult: unknown = undefined;
let rosterResult: unknown = undefined;
let removedResult: unknown = [];
// Convex's view of auth (B-03). Settled-and-signed-in is the resting state;
// the flash tests below rewind it to the token-attach window.
let auth = { isLoading: false, isAuthenticated: true };

// The roster sheet (M-02) writes through the rosterEntries mutations; the
// page itself never calls one, so a shared no-op stub is enough.
const mutationStub = vi.fn(async (_args?: unknown) => undefined);

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: () => mutationStub,
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name === "jerseyRuns:listOrderEntries") return entriesResult;
      if (name.startsWith("jerseyRuns:")) return runResult;
      if (name.startsWith("rosterEntries:")) return rosterResult;
      if (name === "orderEntries:countsByRun") return countsResult;
      if (name.startsWith("orderEntries:")) return removedResult;
      return orderResult;
    },
    useConvexAuth: () => auth,
  };
});

import type { Id } from "@/convex/_generated/dataModel";
import OrderDetailPage from "./page";

const ORDER_ID = "order_1" as Id<"orders">;

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
  countsResult = undefined;
  entriesResult = undefined;
  rosterResult = undefined;
  removedResult = [];
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
    countsResult = {
      total: 8,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 8 }],
    };
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
    countsResult = {
      total: 15,
      byDesign: [
        { designId: "design_home", title: "Home kit", total: 9 },
        { designId: "design_away", title: "Away kit", total: 6 },
      ],
    };
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
    countsResult = { total: 0, byDesign: [{ designId: "design_home", title: "Home kit", total: 0 }] };
    await renderPage();

    expect(screen.getByText(/0 collected/i)).toBeInTheDocument();
    // The design section says nothing has been collected yet, not "12".
    const section = within(sectionFor("Home kit"));
    expect(section.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
    expect(section.queryByText("12")).toBeNull();
  });

  it("reads 0 before a run exists, seeding the total from nothing", async () => {
    // No run yet → no roster → the total is 0, not the intake estimate.
    orderResult = orderWith([design()]);
    runResult = null;
    countsResult = undefined;
    await renderPage();

    expect(screen.getByText(/0 collected/i)).toBeInTheDocument();
  });
});

// The design cards read the unified roster (M-01), not the collected
// entries — so a seeded player nobody has ordered for shows up here, which
// is the disagreement between this page and the roster editor that the read
// exists to end.
describe("/portal/orders/[id] — per-design roster preview (M-01)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  function slot(overrides: Record<string, unknown> = {}) {
    return {
      _id: "slot_gretzky",
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

  function designRoster(overrides: Record<string, unknown> = {}) {
    return {
      designId: "design_home",
      title: "Home kit",
      entries: [],
      blankSizes: [],
      ...overrides,
    };
  }

  it("lists each design's roster with the sizes ordered against each slot", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    countsResult = {
      total: 3,
      byDesign: [
        { designId: "design_home", title: "Home kit", total: 2 },
        { designId: "design_away", title: "Away kit", total: 1 },
      ],
    };
    rosterResult = {
      runId: RUN._id,
      designs: [
        designRoster({
          entries: [
            slot(),
            slot({
              _id: "slot_sosa",
              name: "Sosa",
              number: "25",
              sizes: [{ size: "S", qty: 1 }],
            }),
          ],
        }),
        designRoster({
          designId: "design_away",
          title: "Away kit",
          entries: [
            slot({
              _id: "slot_luongo",
              name: "Luongo",
              number: "1",
              sizes: [{ size: "M", qty: 1 }],
            }),
          ],
        }),
      ],
    };
    await renderPage();

    const home = within(sectionFor("Home kit"));
    const gretzky = home.getByRole("listitem", { name: /gretzky #99/i });
    expect(within(gretzky).getByText("L")).toBeInTheDocument();
    expect(
      home.getByRole("listitem", { name: /sosa #25/i }),
    ).toHaveTextContent("S");
    // The away slot belongs to the away design's section, not this one.
    expect(home.queryByText(/luongo/i)).toBeNull();

    expect(
      within(sectionFor("Away kit")).getByRole("listitem", {
        name: /luongo #1/i,
      }),
    ).toHaveTextContent("M");
  });

  it("shows a seeded player nobody has ordered for, muted", async () => {
    // The whole reason for this slice: the count says 0 and the card still
    // proves the captain's seeding saved.
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 0,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 0 }],
    };
    rosterResult = {
      runId: RUN._id,
      designs: [
        designRoster({
          entries: [
            slot({
              name: "Bure",
              number: "10",
              filled: false,
              sizes: [],
              total: 0,
            }),
          ],
        }),
      ],
    };
    await renderPage();

    const home = within(sectionFor("Home kit"));
    const bure = home.getByRole("listitem", { name: /bure #10/i });
    expect(within(bure).getByText(/not yet filled/i)).toBeInTheDocument();
    // The rollup still reads honestly — nothing has been *collected*.
    expect(home.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
  });

  it("shows the design's bulk jerseys as a blank line with its quantity", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 4,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 4 }],
    };
    rosterResult = {
      runId: RUN._id,
      designs: [designRoster({ blankSizes: [{ size: "XL", qty: 4 }] })],
    };
    await renderPage();

    const blank = within(sectionFor("Home kit")).getByRole("listitem", {
      name: /blank/i,
    });
    expect(blank).toHaveTextContent("XL");
    expect(blank).toHaveTextContent("×4");
  });

  it("keeps the empty treatment for a design with no roster at all", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    countsResult = {
      total: 1,
      byDesign: [
        { designId: "design_home", title: "Home kit", total: 1 },
        { designId: "design_away", title: "Away kit", total: 0 },
      ],
    };
    rosterResult = {
      runId: RUN._id,
      designs: [
        designRoster({ entries: [slot()] }),
        designRoster({ designId: "design_away", title: "Away kit" }),
      ],
    };
    await renderPage();

    const away = within(sectionFor("Away kit"));
    expect(away.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
    expect(away.queryByRole("list", { name: /roster/i })).toBeNull();
  });

  it("reconciles each design's rows with the count already shown", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 5,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 5 }],
    };
    rosterResult = {
      runId: RUN._id,
      designs: [
        designRoster({
          entries: [
            slot({ sizes: [{ size: "L", qty: 3 }], total: 3 }),
            slot({
              _id: "slot_sosa",
              name: "Sosa",
              number: "25",
              sizes: [{ size: "S", qty: 2 }],
              total: 2,
            }),
          ],
        }),
      ],
    };
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

  it("caps a long roster and says how many it left out", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 0,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 0 }],
    };
    rosterResult = {
      runId: RUN._id,
      designs: [
        designRoster({
          entries: Array.from({ length: 15 }, (_, i) =>
            slot({
              _id: `slot_${i}`,
              name: `Player ${i}`,
              number: `${i}`,
              filled: false,
              sizes: [],
              total: 0,
            }),
          ),
        }),
      ],
    };
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(home.getByText(/\+ 9 more/)).toBeInTheDocument();
    expect(home.getByRole("listitem", { name: /player 0 #0/i })).toBeInTheDocument();
    expect(home.queryByRole("listitem", { name: /player 14 #14/i })).toBeNull();
  });

  it("renders no roster before a run exists", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    rosterResult = undefined;
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(home.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
    expect(home.queryByRole("list", { name: /roster/i })).toBeNull();
  });
});

// Roster editing lives on the card now (M-02): the preview above is the
// summary, the sheet behind this button is the whole roster. Before a run
// exists there is nothing to edit — roster entries carry a runId — so the
// card points at collecting instead of opening an editor that can't write.
describe("/portal/orders/[id] — roster sheet on the design card (M-02)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  function rosterWith(entries: Record<string, unknown>[]) {
    return {
      runId: RUN._id,
      designs: [
        { designId: "design_home", title: "Home kit", entries, blankSizes: [] },
      ],
    };
  }

  const GRETZKY = {
    _id: "slot_gretzky",
    name: "Gretzky",
    number: "99",
    source: "captain",
    filled: true,
    collision: false,
    sizes: [{ size: "L", qty: 1 }],
    total: 1,
  };

  it("opens the design's whole roster from a Manage roster button", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()]);
    runResult = RUN;
    rosterResult = rosterWith([GRETZKY]);
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

  it("points at collecting instead of the sheet before a run exists", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    rosterResult = undefined;
    await renderPage();

    const home = within(sectionFor("Home kit"));
    expect(home.queryByRole("button", { name: /roster/i })).toBeNull();
    expect(home.getByText(/building this design/i)).toBeInTheDocument();
  });

  it("opens read-only once the run has locked", async () => {
    const user = userEvent.setup();
    orderResult = orderWith([design()], { locked: true });
    runResult = { ...RUN, status: "open", effectiveStatus: "locked" };
    rosterResult = rosterWith([GRETZKY]);
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

describe("/portal/orders/[id] — size breakdown across the order (C-01)", () => {
  const RUN = {
    _id: "run_1" as Id<"jerseyRuns">,
    deadline: Date.parse("2026-04-01T12:00:00Z"),
    status: "open",
    effectiveStatus: "open" as const,
  };

  function entry(overrides: Record<string, unknown> = {}) {
    return {
      designId: "design_home",
      designTitle: "Home kit",
      name: "Gretzky",
      number: "99",
      size: "L",
      qty: 1,
      ...overrides,
    };
  }

  it("shows the combined size breakdown across every design", async () => {
    orderResult = orderWith([
      design(),
      design({ _id: "design_away" as Id<"designs">, title: "Away kit" }),
    ]);
    runResult = RUN;
    countsResult = {
      total: 6,
      byDesign: [
        { designId: "design_home", title: "Home kit", total: 4 },
        { designId: "design_away", title: "Away kit", total: 2 },
      ],
    };
    entriesResult = {
      entries: [
        entry({ size: "M", qty: 3 }),
        entry({ name: "Sosa", number: "25", size: "S", qty: 1 }),
        entry({ designId: "design_away", designTitle: "Away kit", size: "M", qty: 2 }),
      ],
    };
    await renderPage();

    const breakdown = within(screen.getByRole("list", { name: /size breakdown/i }));
    // Sizes read in canonical order, summed across both designs.
    expect(breakdown.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "S ×1",
      "M ×5",
    ]);
  });

  it("shows no size breakdown before anything has been collected", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 0,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 0 }],
    };
    entriesResult = { entries: [] };
    await renderPage();

    expect(screen.queryByRole("list", { name: /size breakdown/i })).toBeNull();
  });

  it("shows no size breakdown before a run exists", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    entriesResult = undefined;
    await renderPage();

    expect(screen.queryByRole("list", { name: /size breakdown/i })).toBeNull();
  });

  it("leaves a since-removed design's jerseys out of the breakdown", async () => {
    // Those jerseys keep their own section further down (O-08); they must
    // not inflate the size run of the designs the order still carries.
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 1,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 1 }],
    };
    entriesResult = {
      entries: [
        entry(),
        entry({
          designId: "design_warmup",
          designTitle: "Warmup",
          name: "Bure",
          number: "10",
          size: "M",
        }),
      ],
    };
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
