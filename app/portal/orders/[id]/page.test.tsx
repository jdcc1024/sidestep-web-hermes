// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

// Queries are told apart by function name, not args shape, so the page can
// grow another query without silently re-pointing one of these stubs. The
// page reads its order, the run behind the collect CTA, the derived roster
// counts (O-07), the collected entries behind the roster breakdown (C-01),
// and (through RemovedDesigns) the O-08 receipt.
let orderResult: unknown = undefined;
let runResult: unknown = null;
let countsResult: unknown = undefined;
let entriesResult: unknown = undefined;
let removedResult: unknown = [];
// Convex's view of auth (B-03). Settled-and-signed-in is the resting state;
// the flash tests below rewind it to the token-attach window.
let auth = { isLoading: false, isAuthenticated: true };

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name === "jerseyRuns:listOrderEntries") return entriesResult;
      if (name.startsWith("jerseyRuns:")) return runResult;
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

describe("/portal/orders/[id] — collected roster and size breakdown (C-01)", () => {
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

  it("lists each design's collected jerseys as name / number / size", async () => {
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
    entriesResult = {
      entries: [
        entry(),
        entry({ name: "Sosa", number: "25", size: "S" }),
        entry({
          designId: "design_away",
          designTitle: "Away kit",
          name: "Luongo",
          number: "1",
          size: "M",
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
    // The away jersey belongs to the away design's section, not this one.
    expect(home.queryByText(/luongo/i)).toBeNull();

    expect(
      within(sectionFor("Away kit")).getByRole("listitem", {
        name: /luongo #1/i,
      }),
    ).toHaveTextContent("M");
  });

  it("shows a nameless bulk jersey as a blank line with its quantity", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 4,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 4 }],
    };
    entriesResult = {
      entries: [
        entry({ name: undefined, number: undefined, size: "XL", qty: 4 }),
      ],
    };
    await renderPage();

    const blank = within(sectionFor("Home kit")).getByRole("listitem", {
      name: /blank/i,
    });
    expect(blank).toHaveTextContent("XL");
    expect(blank).toHaveTextContent("×4");
  });

  it("keeps the empty treatment for a design nobody has ordered", async () => {
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
    entriesResult = { entries: [entry()] };
    await renderPage();

    const away = within(sectionFor("Away kit"));
    expect(away.getByText(/no jerseys collected yet/i)).toBeInTheDocument();
    expect(away.queryByRole("list", { name: /collected jerseys/i })).toBeNull();
  });

  it("reconciles each design's lines with the count already shown", async () => {
    orderResult = orderWith([design()]);
    runResult = RUN;
    countsResult = {
      total: 5,
      byDesign: [{ designId: "design_home", title: "Home kit", total: 5 }],
    };
    entriesResult = {
      entries: [
        entry({ size: "L", qty: 1 }),
        entry({ size: "L", qty: 2 }),
        entry({ name: "Sosa", number: "25", size: "S", qty: 2 }),
      ],
    };
    await renderPage();

    const home = within(sectionFor("Home kit"));
    // The rollup says 5; the lines below it add up to the same 5.
    expect(home.getByText("5")).toBeInTheDocument();
    expect(
      within(home.getByRole("listitem", { name: /gretzky #99/i })).getByText(
        "×3",
      ),
    ).toBeInTheDocument();
    expect(
      within(home.getByRole("listitem", { name: /sosa #25/i })).getByText("×2"),
    ).toBeInTheDocument();
  });

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

  it("renders without a roster before a run exists", async () => {
    orderResult = orderWith([design()]);
    runResult = null;
    entriesResult = undefined;
    await renderPage();

    expect(
      within(sectionFor("Home kit")).getByText(/no jerseys collected yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /size breakdown/i })).toBeNull();
  });

  it("leaves a since-removed design's jerseys out of the linked sections", async () => {
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

    expect(screen.queryByText(/bure/i)).toBeNull();
    // …and it doesn't inflate the combined breakdown either.
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
