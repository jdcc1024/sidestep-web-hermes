// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

// Queries are told apart by function name, not args shape: the page reads
// its order (for the designs behind the by-roster view), the run behind the
// share link, and the collected entries every view projects.
let orderResult: unknown = undefined;
let runResult: unknown = undefined;
let entriesResult: unknown = undefined;

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name === "jerseyRuns:listOrderEntries") return entriesResult;
      if (name.startsWith("jerseyRuns:")) return runResult;
      return orderResult;
    },
    // The page gates its owner-scoped read on Convex auth (B-03); these
    // cases all run as a settled, signed-in captain.
    useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  };
});

import type { Id } from "@/convex/_generated/dataModel";
import JerseyRunResponsesPage from "./page";

const ORDER_ID = "order_1" as Id<"orders">;
const RUN_ID = "run_1" as Id<"jerseyRuns">;
const HOME = { _id: "design_home" as Id<"designs">, title: "Home kit" };
const AWAY = { _id: "design_away" as Id<"designs">, title: "Away kit" };

const RUN = {
  _id: RUN_ID,
  deadline: Date.parse("2026-09-01T12:00:00Z"),
  status: "open",
  effectiveStatus: "open" as const,
  customQuestions: [],
};

function orderWith(designs: { _id: Id<"designs">; title: string }[] = [HOME]) {
  return {
    order: {
      _id: ORDER_ID,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
    },
    designs,
    locked: false,
  };
}

let entryId = 0;
function entry(overrides: Record<string, unknown> = {}) {
  entryId += 1;
  return {
    _id: `entry_${entryId}` as Id<"orderEntries">,
    submitterName: "Sam Fan",
    submitterEmail: "sam@example.com",
    designId: HOME._id,
    designTitle: HOME.title,
    name: "Kobe",
    number: "21",
    size: "M",
    qty: 1,
    customAnswers: {},
    createdAt: Date.parse("2026-06-01T12:00:00Z"),
    ...overrides,
  };
}

// The page reads its route params with `use()`, so it suspends on first
// render — awaiting inside act lets the resolved params commit.
async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<p>Loading page</p>}>
        <JerseyRunResponsesPage params={Promise.resolve({ id: ORDER_ID })} />
      </Suspense>,
    );
  });
}

async function switchTo(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("tab", { name }));
  });
}

afterEach(() => {
  vi.clearAllMocks();
  orderResult = undefined;
  runResult = undefined;
  entriesResult = undefined;
});

describe("/portal/orders/[id]/run/responses — view switcher (C-02)", () => {
  it("opens on the detailed table so nothing a captain relied on is lost", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = { run: RUN, entries: [entry()] };
    await renderPage();

    // The submitter/email columns only the raw table carries are still here.
    expect(
      screen.getByRole("columnheader", { name: /submitter/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /all responses/i }),
    ).toHaveAttribute("data-active");
  });

  it("offers a by-roster and a by-fan view alongside it", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = { run: RUN, entries: [entry()] };
    await renderPage();

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "All responses",
      "By roster",
      "By fan",
    ]);
  });

  it("shows the collected jerseys per design under By roster", async () => {
    orderResult = orderWith([HOME, AWAY]);
    runResult = RUN;
    entriesResult = {
      run: RUN,
      entries: [
        entry({ name: "Kobe", number: "21", size: "M" }),
        entry({ name: "Kobe", number: "21", size: "M" }),
        entry({
          designId: AWAY._id,
          designTitle: AWAY.title,
          name: "Bryant",
          number: "6",
          size: "S",
        }),
      ],
    };
    await renderPage();
    await switchTo(/by roster/i);

    const home = within(screen.getByLabelText("Roster: Home kit"));
    // The two identical jerseys collapse into one production line of 2.
    expect(
      within(home.getByRole("listitem", { name: /kobe #21/i })).getByText("×2"),
    ).toBeInTheDocument();
    expect(home.queryByText(/bryant/i)).toBeNull();

    expect(
      within(screen.getByLabelText("Roster: Away kit")).getByRole("listitem", {
        name: /bryant #6/i,
      }),
    ).toHaveTextContent("S");
  });

  it("gives each fan one heading and a row per jersey under By fan", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = {
      run: RUN,
      entries: [
        entry({ name: "Kobe", number: "21", size: "M" }),
        entry({ name: "Kobe", number: "21", size: "L" }),
        entry({ name: "Bryant", number: "6", size: "S" }),
        entry({
          submitterName: "Ana Ref",
          submitterEmail: "ana@example.com",
          name: "Ana",
          number: "3",
          size: "S",
        }),
      ],
    };
    await renderPage();
    await switchTo(/by fan/i);

    const sam = within(screen.getByLabelText("Fan: sam@example.com"));
    expect(sam.getByText("Sam Fan")).toBeInTheDocument();
    // Three jerseys, three rows — not one collapsed line.
    expect(sam.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Kobe #21M",
      "Kobe #21L",
      "Bryant #6S",
    ]);

    const ana = within(screen.getByLabelText("Fan: ana@example.com"));
    expect(ana.getAllByRole("listitem")).toHaveLength(1);
    expect(ana.queryByText(/kobe/i)).toBeNull();
  });

  it("reads a fan as one group however they typed their email", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = {
      run: RUN,
      entries: [
        entry({ submitterEmail: "Sam@Example.com", size: "M" }),
        entry({ submitterEmail: "sam@example.com", size: "L" }),
      ],
    };
    await renderPage();
    await switchTo(/by fan/i);

    expect(screen.getAllByLabelText(/^Fan: /)).toHaveLength(1);
    expect(
      within(screen.getByLabelText("Fan: sam@example.com")).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(2);
  });

  it("switches back to the detailed table", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = { run: RUN, entries: [entry()] };
    await renderPage();

    await switchTo(/by fan/i);
    expect(screen.queryByRole("columnheader", { name: /submitter/i })).toBeNull();

    await switchTo(/all responses/i);
    expect(
      screen.getByRole("columnheader", { name: /submitter/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Fan: /)).toBeNull();
  });

  it("shows the combined size breakdown regardless of the view", async () => {
    orderResult = orderWith([HOME, AWAY]);
    runResult = RUN;
    entriesResult = {
      run: RUN,
      entries: [
        entry({ size: "M", qty: 3 }),
        entry({ size: "S" }),
        entry({ designId: AWAY._id, designTitle: AWAY.title, size: "M", qty: 2 }),
      ],
    };
    await renderPage();

    const breakdown = () =>
      within(screen.getByRole("list", { name: /size breakdown/i }))
        .getAllByRole("listitem")
        .map((li) => li.textContent);

    expect(breakdown()).toEqual(["S ×1", "M ×5"]);
    await switchTo(/by fan/i);
    expect(breakdown()).toEqual(["S ×1", "M ×5"]);
  });

  it("leaves a since-removed design's jerseys out of the derived views", async () => {
    orderResult = orderWith([HOME]);
    runResult = RUN;
    entriesResult = {
      run: RUN,
      entries: [
        entry(),
        entry({
          designId: "design_warmup",
          designTitle: "Warmup",
          submitterName: "Gone Fan",
          submitterEmail: "gone@example.com",
          name: "Bure",
          number: "10",
          size: "XL",
        }),
      ],
    };
    await renderPage();

    // The raw table is the receipt (O-08) and still lists it…
    expect(screen.getByText("Warmup")).toBeInTheDocument();
    // …but it doesn't inflate the combined breakdown…
    expect(
      within(screen.getByRole("list", { name: /size breakdown/i })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);

    // …or show up as a fan of a design the order no longer carries.
    await switchTo(/by fan/i);
    expect(screen.queryByLabelText("Fan: gone@example.com")).toBeNull();
  });

  it("keeps the share-link empty state and offers no views for an empty run", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = { run: RUN, entries: [] };
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /no responses yet/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`/run/${RUN_ID}`))).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("list", { name: /size breakdown/i })).toBeNull();
  });
});

// The entries query is skipped until a run is found, so `undefined` entries
// mean two different things — "still loading" and "there is nothing to load".
// Only the run tells them apart (B-04). The skeleton renders no headings at
// all, which is what distinguishes it from every settled state below.
describe("/portal/orders/[id]/run/responses — no-run-yet gate (B-04)", () => {
  it("sends a captain with no run yet to start one instead of hanging", async () => {
    orderResult = orderWith();
    runResult = null;
    entriesResult = undefined;
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /no jersey run yet/i }),
    ).toBeInTheDocument();
    // The order page owns run creation since M-05; /run/setup only manages a
    // run that already exists.
    expect(
      screen.getByRole("link", { name: /start collecting/i }),
    ).toHaveAttribute("href", `/portal/orders/${ORDER_ID}`);
  });

  it("keeps the skeleton while the run itself is still loading", async () => {
    orderResult = orderWith();
    runResult = undefined;
    entriesResult = undefined;
    await renderPage();

    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("keeps the skeleton while a found run's entries are still loading", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = undefined;
    await renderPage();

    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("shows not-found when the run is there but its entries come back null", async () => {
    orderResult = orderWith();
    runResult = RUN;
    entriesResult = null;
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /couldn.t find that jersey run/i }),
    ).toBeInTheDocument();
  });
});
