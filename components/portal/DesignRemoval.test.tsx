// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";

// Both components read exactly one query, so a single mutable result backs
// the mock; each test stocks it before rendering.
let queryResult: unknown = undefined;

vi.mock("convex/react", () => ({
  useQuery: () => queryResult,
}));

import { DesignRemovalWarning, RemovedDesigns } from "./DesignRemoval";

const runId = "run_1" as Id<"jerseyRuns">;
const designId = "design_a" as Id<"designs">;

afterEach(() => {
  queryResult = undefined;
});

describe("DesignRemovalWarning", () => {
  it("names the affected submitters and the jerseys that would drop", () => {
    queryResult = {
      designId,
      title: "Home kit",
      entryCount: 3,
      total: 4,
      submitters: [
        { name: "Ana Ruiz", email: "ana@x.com", qty: 2 },
        { name: "Ben Chu", email: "ben@x.com", qty: 2 },
      ],
    };
    render(<DesignRemovalWarning runId={runId} designId={designId} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Home kit");
    expect(alert).toHaveTextContent("4 jerseys");
    expect(alert).toHaveTextContent("Ana Ruiz (2) and Ben Chu (2)");
  });

  it("reassures that nothing is deleted — the warning is soft, not a stop", () => {
    queryResult = {
      designId,
      title: "Home kit",
      entryCount: 1,
      total: 1,
      submitters: [{ name: "Ana Ruiz", email: "ana@x.com", qty: 1 }],
    };
    render(<DesignRemovalWarning runId={runId} designId={designId} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent ?? "").toMatch(/stay|saved|keep/i);
    // No confirm/block affordance — saving is never gated on this warning.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays silent when the design has no submissions to orphan", () => {
    queryResult = {
      designId,
      title: "Warmup",
      entryCount: 0,
      total: 0,
      submitters: [],
    };
    render(<DesignRemovalWarning runId={runId} designId={designId} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing while the query is still loading", () => {
    queryResult = undefined;
    const { container } = render(
      <DesignRemovalWarning runId={runId} designId={designId} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("RemovedDesigns", () => {
  it("keeps removed designs visible with a removed indicator and who's affected", () => {
    queryResult = [
      {
        designId,
        title: "Away kit",
        entryCount: 2,
        total: 3,
        submitters: [
          { name: "Ana Ruiz", email: "ana@x.com", qty: 2 },
          { name: "Ben Chu", email: "ben@x.com", qty: 1 },
        ],
      },
    ];
    render(<RemovedDesigns runId={runId} />);

    const region = screen.getByRole("region", { name: /removed/i });
    expect(region).toHaveTextContent("Away kit");
    expect(region).toHaveTextContent("Removed");
    expect(region).toHaveTextContent("3 jerseys");
    expect(region).toHaveTextContent("Ana Ruiz (2) and Ben Chu (1)");
  });

  it("says the entries are kept, not deleted", () => {
    queryResult = [
      {
        designId,
        title: "Away kit",
        entryCount: 1,
        total: 1,
        submitters: [{ name: "Ana Ruiz", email: "ana@x.com", qty: 1 }],
      },
    ];
    render(<RemovedDesigns runId={runId} />);

    expect(
      screen.getByRole("region", { name: /removed/i }).textContent ?? "",
    ).toMatch(/still here|saved|nothing was deleted/i);
  });

  it("renders nothing when no design has been removed", () => {
    queryResult = [];
    const { container } = render(<RemovedDesigns runId={runId} />);

    expect(container).toBeEmptyDOMElement();
  });

  // Stocked with data on purpose: with no run there is nothing to read, so
  // the component must bail on the missing runId rather than on an empty
  // query result (the real query is skipped and never resolves).
  it("renders nothing when the order has no run yet", () => {
    queryResult = [
      {
        designId,
        title: "Away kit",
        entryCount: 1,
        total: 1,
        submitters: [{ name: "Ana Ruiz", email: "ana@x.com", qty: 1 }],
      },
    ];
    const { container } = render(<RemovedDesigns runId={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
