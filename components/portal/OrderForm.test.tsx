// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// One spy backs both useMutation(createOrder) and useMutation(updateOrder);
// New vs Edit is told apart by whether the payload carries an orderId.
const mutate = vi.fn(async () => "order_returned_id");
const push = vi.fn();

// Mutable so individual tests can stock each query. The mock factory reads
// these lazily (at useQuery call time), so reassigning before render works.
// Queries are told apart by name via getFunctionName rather than by args
// shape, so adding a query to the form doesn't silently re-point an existing
// stub.
let designsResult: unknown = [];
let runResult: unknown = null;
let affectedResult: unknown = undefined;

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name.startsWith("jerseyRuns:")) return runResult;
      // L-04: the warning reads the order's items, so it works with no run.
      if (name.startsWith("orderEntries:"))
        throw new Error(`L-04: ${name} is deleted; read orderItems instead`);
      if (name === "orderItems:affectedByDesignRemoval") return affectedResult;
      return designsResult;
    },
    useMutation: () => mutate,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { OrderForm } from "./OrderForm";
import type { EditableOrder } from "./OrderForm";

const existingOrder: EditableOrder = {
  _id: "order_123" as EditableOrder["_id"],
  teamName: "Westside FC",
  sport: "Ultimate Frisbee",
  estimatedQuantity: 18,
  hasOwnDesign: true,
  designIds: ["design_a"] as unknown as EditableOrder["designIds"],
};

// The status caption rendered alongside each progress milestone. Exact-match
// the label so it doesn't also catch copy like "No design attached yet".
function milestoneCaption(label: string): string {
  const item = screen.getByText(label, { exact: true }).closest("li");
  if (!item) throw new Error(`No milestone item for ${label}`);
  const caption = within(item).getByText(/^(Done|In progress|Locked)$/);
  return caption.textContent ?? "";
}

afterEach(() => {
  vi.clearAllMocks();
  designsResult = [];
  runResult = null;
  affectedResult = undefined;
});

describe("OrderForm — validation", () => {
  it("surfaces RHF + zod validation errors when the user submits an empty form", async () => {
    const user = userEvent.setup();
    render(<OrderForm />);

    await user.click(screen.getByRole("button", { name: /create order/i }));

    expect(
      await screen.findByText(/give your team a name/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/what sport or activity is this for/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/order at least 1 jersey/i)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("OrderForm — progress gate", () => {
  it("renders the design milestone as Locked with no design linked, and nudges", () => {
    render(<OrderForm />);

    expect(milestoneCaption("Design attached")).toBe("Locked");
    expect(milestoneCaption("Ready to collect")).toBe("Locked");
    expect(
      screen.getByText(/no design attached yet/i),
    ).toBeInTheDocument();
  });

  it("clears the design milestone once a design is checked", async () => {
    designsResult = [{ _id: "design_a", title: "Home kit", fileCount: 0 }];
    const user = userEvent.setup();
    render(<OrderForm />);

    expect(milestoneCaption("Design attached")).toBe("Locked");

    await user.click(screen.getByRole("checkbox", { name: /home kit/i }));

    expect(milestoneCaption("Design attached")).toBe("Done");
    expect(screen.queryByText(/no design attached yet/i)).not.toBeInTheDocument();
  });
});

describe("OrderForm — edit mode", () => {
  it("pre-populates fields from the order and labels the action 'Save changes'", () => {
    render(<OrderForm order={existingOrder} />);

    expect(screen.getByLabelText(/team name/i)).toHaveValue("Westside FC");
    expect(screen.getByLabelText(/sport or activity/i)).toHaveValue(
      "Ultimate Frisbee",
    );
    expect(screen.getByLabelText(/estimated quantity/i)).toHaveValue(18);
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();
    // The order already carries a design, so the gate is cleared on load.
    expect(milestoneCaption("Design attached")).toBe("Done");
  });

  it("submits through updateOrder with the orderId and navigates to the order", async () => {
    const user = userEvent.setup();
    render(<OrderForm order={existingOrder} />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order_123",
        teamName: "Westside FC",
        estimatedQuantity: 18,
      }),
    );
    expect(push).toHaveBeenCalledWith("/portal/orders/order_returned_id");
  });
});

// O-08: unchecking a design that people already ordered warns instead of
// silently orphaning them — and the warning never blocks the save.
describe("OrderForm — removing a design with submissions", () => {
  const collectingRun = { _id: "run_1", deadline: 0, status: "open" };
  const affectedHomeKit = {
    itemCount: 4,
    submitters: [
      { name: "Ana Ruiz", email: "ana@x.com", qty: 2 },
      { name: "Ben Chu", email: "ben@x.com", qty: 2 },
    ],
  };
  // Two captain-added items, no player ever submitted: the order-form-less case.
  const affectedCaptainOnly = { itemCount: 2, submitters: [] };

  it("names the affected submitters when a linked design is unchecked", async () => {
    designsResult = [{ _id: "design_a", title: "Home kit", fileCount: 0 }];
    runResult = collectingRun;
    affectedResult = affectedHomeKit;
    const user = userEvent.setup();
    render(<OrderForm order={existingOrder} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /home kit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/\b4 (items|jerseys)\b/);
    expect(alert).toHaveTextContent("Ana Ruiz (2) and Ben Chu (2)");
  });

  it("still saves the removal — the warning is soft, never a hard stop", async () => {
    designsResult = [{ _id: "design_a", title: "Home kit", fileCount: 0 }];
    runResult = collectingRun;
    affectedResult = affectedHomeKit;
    const user = userEvent.setup();
    render(<OrderForm order={existingOrder} />);

    await user.click(screen.getByRole("checkbox", { name: /home kit/i }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order_123", designIds: [] }),
    );
    expect(push).toHaveBeenCalledWith("/portal/orders/order_returned_id");
  });

  it("warns about captain items when the order has no order form (L-04: unlinking Away Kit warns about 2 items)", async () => {
    designsResult = [{ _id: "design_a", title: "Away Kit", fileCount: 0 }];
    runResult = null;
    affectedResult = affectedCaptainOnly;
    const user = userEvent.setup();
    render(<OrderForm order={existingOrder} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /away kit/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/\b2 (items|jerseys)\b/);
  });

  it("stays quiet when the design has no items to lose, with or without an order form", async () => {
    designsResult = [{ _id: "design_a", title: "Home kit", fileCount: 0 }];
    runResult = null;
    affectedResult = { itemCount: 0, submitters: [] };
    const user = userEvent.setup();
    render(<OrderForm order={existingOrder} />);

    await user.click(screen.getByRole("checkbox", { name: /home kit/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not warn on a brand-new order, which can't have removals", async () => {
    designsResult = [{ _id: "design_a", title: "Home kit", fileCount: 0 }];
    runResult = collectingRun;
    affectedResult = affectedHomeKit;
    const user = userEvent.setup();
    render(<OrderForm />);

    await user.click(screen.getByRole("checkbox", { name: /home kit/i }));
    await user.click(screen.getByRole("checkbox", { name: /home kit/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
