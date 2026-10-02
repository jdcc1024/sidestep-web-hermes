// @vitest-environment jsdom
// L-04 §2 acceptance tests (initiative 0004): the design-removal warning and
// the removed-designs section read the ORDER's items, not the run's entries.
// Contract the build must meet:
//   <DesignRemovalWarning orderId designId />  → orderItems.affectedByDesignRemoval({ orderId, designId })
//        result { itemCount, submitters: [{ name, email, qty }] }
//   <RemovedDesigns orderId />                 → orderItems.listForOrder({ orderId }).removedDesigns
//        entries { designId, title, itemCount, submitters }
// Neither may touch `orderEntries.*` (those two queries are deleted).
// The count noun ("items" or the old "jerseys") is the builder's call; the
// number is not.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Id } from "@/convex/_generated/dataModel";

let affectedResult: unknown = undefined;
let listResult: unknown = undefined;
const calls: { name: string; args: unknown }[] = [];

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      const name = getFunctionName(ref);
      calls.push({ name, args });
      if (name.startsWith("orderEntries:"))
        throw new Error(`L-04: ${name} is deleted; read orderItems instead`);
      if (args === "skip") return undefined;
      if (name === "orderItems:affectedByDesignRemoval") return affectedResult;
      if (name === "orderItems:listForOrder") return listResult;
      throw new Error(`unexpected query ${name}`);
    },
  };
});

import { DesignRemovalWarning, RemovedDesigns } from "./DesignRemoval";

const orderId = "order_1" as Id<"orders">;
const designId = "design_a" as Id<"designs">;

afterEach(() => {
  affectedResult = undefined;
  listResult = undefined;
  calls.length = 0;
});

describe("DesignRemovalWarning reads orderItems.affectedByDesignRemoval({ orderId, designId })", () => {
  it("asks the order-keyed query, with the order and the design", () => {
    affectedResult = { itemCount: 0, submitters: [] };
    render(<DesignRemovalWarning orderId={orderId} designId={designId} />);

    const call = calls.find((c) => c.name === "orderItems:affectedByDesignRemoval");
    expect(call?.args).toEqual({ orderId, designId });
    expect(calls.some((c) => c.name.startsWith("orderEntries:"))).toBe(false);
  });

  it("names the affected submitters and the count that would drop", () => {
    affectedResult = {
      itemCount: 4,
      submitters: [
        { name: "Ana Ruiz", email: "ana@x.com", qty: 2 },
        { name: "Ben Chu", email: "ben@x.com", qty: 2 },
      ],
    };
    render(<DesignRemovalWarning orderId={orderId} designId={designId} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/\b4 (items|jerseys)\b/);
    expect(alert).toHaveTextContent("Ana Ruiz (2) and Ben Chu (2)");
  });

  it("warns about captain-added items when nobody submitted (an order with no order form)", () => {
    affectedResult = { itemCount: 2, submitters: [] };
    render(<DesignRemovalWarning orderId={orderId} designId={designId} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/\b2 (items|jerseys)\b/);
  });

  it("counts one in the singular", () => {
    affectedResult = { itemCount: 1, submitters: [] };
    render(<DesignRemovalWarning orderId={orderId} designId={designId} />);

    expect(screen.getByRole("alert").textContent ?? "").toMatch(
      /\b1 (item|jersey)\b(?!s)/,
    );
  });

  it("reassures that nothing is deleted — the warning is soft, not a stop", () => {
    affectedResult = { itemCount: 2, submitters: [] };
    render(<DesignRemovalWarning orderId={orderId} designId={designId} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent ?? "").toMatch(/stay|saved|keep/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays silent when the design has no items to orphan", () => {
    affectedResult = { itemCount: 0, submitters: [] };
    render(<DesignRemovalWarning orderId={orderId} designId={designId} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing while the query is still loading", () => {
    affectedResult = undefined;
    const { container } = render(
      <DesignRemovalWarning orderId={orderId} designId={designId} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("uses no word from the retired list in its copy (§8.13)", () => {
    affectedResult = { itemCount: 3, submitters: [] };
    render(<DesignRemovalWarning orderId={orderId} designId={designId} />);

    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(
      /roster|slot|jersey run|collected|responses|CONVEX|Request ID/i,
    );
  });
});

describe("RemovedDesigns reads orderItems.listForOrder({ orderId }).removedDesigns", () => {
  const away = {
    designId,
    title: "Away Kit",
    itemCount: 2,
    submitters: [] as { name: string; email: string; qty: number }[],
  };

  it("asks the order-keyed list, never the run-keyed query", () => {
    listResult = { removedDesigns: [] };
    render(<RemovedDesigns orderId={orderId} />);

    const call = calls.find((c) => c.name === "orderItems:listForOrder");
    expect(call?.args).toEqual({ orderId });
    expect(calls.some((c) => c.name.startsWith("orderEntries:"))).toBe(false);
  });

  it("lists a removed design that held only captain items (no order form, no submitters)", () => {
    listResult = { removedDesigns: [away] };
    render(<RemovedDesigns orderId={orderId} />);

    const region = screen.getByRole("region", { name: /removed/i });
    expect(region).toHaveTextContent("Away Kit");
    expect(region).toHaveTextContent("Removed");
    expect(region).toHaveTextContent(/\b2 (items|jerseys)\b/);
  });

  it("names submitters when players sent items", () => {
    listResult = {
      removedDesigns: [
        {
          ...away,
          itemCount: 3,
          submitters: [
            { name: "Ana Ruiz", email: "ana@x.com", qty: 2 },
            { name: "Ben Chu", email: "ben@x.com", qty: 1 },
          ],
        },
      ],
    };
    render(<RemovedDesigns orderId={orderId} />);

    const region = screen.getByRole("region", { name: /removed/i });
    expect(region).toHaveTextContent(/\b3 (items|jerseys)\b/);
    expect(region).toHaveTextContent("Ana Ruiz (2) and Ben Chu (1)");
  });

  it("says the items are kept, not deleted", () => {
    listResult = { removedDesigns: [away] };
    render(<RemovedDesigns orderId={orderId} />);

    expect(
      screen.getByRole("region", { name: /removed/i }).textContent ?? "",
    ).toMatch(/still here|saved|nothing was deleted/i);
  });

  it("renders nothing when no design has been removed", () => {
    listResult = { removedDesigns: [] };
    const { container } = render(<RemovedDesigns orderId={orderId} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading, and when the list is null (signed out / not found)", () => {
    listResult = undefined;
    const a = render(<RemovedDesigns orderId={orderId} />);
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();

    listResult = null;
    const b = render(<RemovedDesigns orderId={orderId} />);
    expect(b.container).toBeEmptyDOMElement();
  });

  it("reveals the section when a design is dropped while the page is open", async () => {
    listResult = { removedDesigns: [] };
    const { container, rerender } = render(<RemovedDesigns orderId={orderId} />);
    expect(container).toBeEmptyDOMElement();

    listResult = { removedDesigns: [away] };
    rerender(<RemovedDesigns orderId={orderId} />);

    expect(
      await screen.findByRole("region", { name: /removed/i }),
    ).toHaveTextContent("Away Kit");
  });

  it("takes the section away again when the last removed design comes back", async () => {
    listResult = { removedDesigns: [away] };
    const { rerender } = render(<RemovedDesigns orderId={orderId} />);
    expect(screen.getByRole("region", { name: /removed/i })).toBeInTheDocument();

    listResult = { removedDesigns: [] };
    rerender(<RemovedDesigns orderId={orderId} />);

    await waitFor(
      () =>
        expect(
          screen.queryByRole("region", { name: /removed/i }),
        ).not.toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
