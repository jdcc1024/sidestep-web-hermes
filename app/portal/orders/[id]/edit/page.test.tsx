// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";

// The edit surface reads one query (the order) and, when editable, hands off
// to OrderForm — which reads its own queries. Told apart by function name so
// the freeze branch below can't accidentally be fed the order doc.
let orderResult: unknown = undefined;

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name.startsWith("orders:getMyOrder")) return orderResult;
      if (name.startsWith("designs:")) return [];
      return null;
    },
    useMutation: () => vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import type { Id } from "@/convex/_generated/dataModel";
import EditOrderPage from "./page";

const ORDER_ID = "order_1" as Id<"orders">;

function result({ locked }: { locked: boolean }) {
  return {
    order: {
      _id: ORDER_ID,
      teamName: "Falcons",
      sport: "Soccer",
      estimatedQuantity: 12,
      hasOwnDesign: false,
      designIds: [],
      internalStages: [{ name: "Order received", completedAt: 1 }],
      createdAt: Date.parse("2026-03-01T12:00:00Z"),
      updatedAt: Date.parse("2026-03-02T12:00:00Z"),
    },
    designs: [],
    locked,
  };
}

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<p>Loading page</p>}>
        <EditOrderPage params={Promise.resolve({ id: ORDER_ID })} />
      </Suspense>,
    );
  });
}

afterEach(() => {
  vi.clearAllMocks();
  orderResult = undefined;
});

describe("/portal/orders/[id]/edit — freeze when locked (O-06)", () => {
  it("renders the editable form while the roster is unlocked", async () => {
    orderResult = result({ locked: false });
    await renderPage();

    expect(screen.getByLabelText(/team name/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeInTheDocument();
  });

  it("replaces the form with a read-only summary once locked", async () => {
    orderResult = result({ locked: true });
    await renderPage();

    expect(screen.queryByLabelText(/team name/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
  });

  it("says the order is locked and who to contact about it", async () => {
    orderResult = result({ locked: true });
    await renderPage();

    const note = screen.getByRole("note", { name: /locked/i });
    expect(note).toHaveTextContent(/locked/i);
    expect(note).toHaveTextContent(/sidestep/i);
  });

  it("still shows the order's details so the locked page isn't a dead end", async () => {
    orderResult = result({ locked: true });
    await renderPage();

    const summary = within(screen.getByLabelText(/what we.re making/i));
    expect(summary.getByText("Falcons")).toBeInTheDocument();
    expect(summary.getByText("Soccer")).toBeInTheDocument();
    expect(summary.getByText("12 jerseys")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to order/i }),
    ).toBeInTheDocument();
  });
});
