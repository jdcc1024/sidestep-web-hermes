// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

// Queries are told apart by function name, not args shape, so the page can
// grow another query without silently re-pointing one of these stubs. The
// page reads its order, the run behind the collect CTA, and (through
// RemovedDesigns) the O-08 receipt.
let orderResult: unknown = undefined;
let runResult: unknown = null;
let removedResult: unknown = [];

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name.startsWith("jerseyRuns:")) return runResult;
      if (name.startsWith("orderEntries:")) return removedResult;
      return orderResult;
    },
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

function orderWith(designs: ReturnType<typeof design>[]) {
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
  removedResult = [];
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
