// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Id } from "@/convex/_generated/dataModel";

// Run Setup is management-only since M-05: the run is created from the order
// page, so what this surface reads back is either "no run yet" or an existing
// run whose deadline and custom questions it edits.
type ManagedRun = {
  _id: Id<"orderForms">;
  customQuestions: { id: string; label: string }[];
  deadline: number;
  effectiveStatus: "open" | "closed" | "locked";
};

const DEADLINE = Date.parse("2099-06-15T23:59:59.999Z");

function openRun(overrides: Partial<ManagedRun> = {}): ManagedRun {
  return {
    _id: "run_1" as Id<"orderForms">,
    customQuestions: [],
    deadline: DEADLINE,
    effectiveStatus: "open",
    ...overrides,
  };
}

let runResult: ManagedRun | null | undefined = openRun();
const updateSettings = vi.fn(async (_args?: unknown) => undefined);

vi.mock("convex/react", () => ({
  useQuery: () => runResult,
  useMutation: () => updateSettings,
}));

import { OrderFormSettings } from "./OrderFormSettings";

const fakeOrderId = "order_test_id" as Id<"orders">;

describe("OrderFormSettings — management only (M-05)", () => {
  beforeEach(() => {
    updateSettings.mockClear();
    runResult = openRun();
  });

  it("sends the captain back to the order page when no run exists yet", async () => {
    runResult = null;
    render(<OrderFormSettings orderId={fakeOrderId} />);

    expect(
      screen.getByText(/haven't started collecting yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to your order/i }),
    ).toHaveAttribute("href", `/portal/orders/${fakeOrderId}`);
    // Creating a run from here is exactly what this slice removed.
    expect(
      screen.queryByRole("button", { name: /collect|create/i }),
    ).toBeNull();
  });

  it("holds the share link, the deadline, and the custom questions", () => {
    runResult = openRun({
      customQuestions: [{ id: "q1", label: "How should we deliver?" }],
    });
    render(<OrderFormSettings orderId={fakeOrderId} />);

    expect(screen.getByLabelText(/shareable link/i)).toHaveValue(
      "http://localhost:3000/run/run_1",
    );
    expect(screen.getByLabelText(/deadline/i)).toHaveValue("2099-06-15");
    expect(screen.getByLabelText(/^question 1$/i)).toHaveValue(
      "How should we deliver?",
    );
    expect(
      screen.getByRole("link", { name: /view responses/i }),
    ).toBeInTheDocument();
  });

  it("asks nothing about sizes, names mode, or locking", () => {
    render(<OrderFormSettings orderId={fakeOrderId} />);

    expect(screen.queryByText(/jersey sizes/i)).toBeNull();
    expect(screen.queryByText(/names & numbers/i)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /^xl$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /lock|unlock/i })).toBeNull();
  });

  it("saves an edited deadline and a new question", async () => {
    const user = userEvent.setup();
    render(<OrderFormSettings orderId={fakeOrderId} />);

    await user.clear(screen.getByLabelText(/deadline/i));
    await user.type(screen.getByLabelText(/deadline/i), "2099-07-20");
    await user.click(screen.getByRole("button", { name: /add question/i }));
    await user.type(screen.getByLabelText(/^question 1$/i), "Allergies?");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledTimes(1);
    });
    const args = updateSettings.mock.calls[0][0] as {
      orderFormId: string;
      deadline: number;
      customQuestions: { label: string }[];
    };
    expect(args.orderFormId).toBe("run_1");
    expect(args.deadline).toBe(Date.parse("2099-07-20T23:59:59.999Z"));
    expect(args.customQuestions.map((q) => q.label)).toEqual(["Allergies?"]);
  });

  it("refuses to save without a deadline", async () => {
    const user = userEvent.setup();
    render(<OrderFormSettings orderId={fakeOrderId} />);

    await user.clear(screen.getByLabelText(/deadline/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/pick a deadline date/i)).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("goes read-only once the run has locked", () => {
    runResult = openRun({
      effectiveStatus: "locked",
      customQuestions: [{ id: "q1", label: "How should we deliver?" }],
    });
    render(<OrderFormSettings orderId={fakeOrderId} />);

    expect(screen.getByText(/roster locked/i)).toBeInTheDocument();
    expect(screen.getByText(/how should we deliver\?/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
    expect(screen.queryByLabelText(/^question 1$/i)).toBeNull();
    // The share link stays — a locked run's link still explains itself.
    expect(screen.getByLabelText(/shareable link/i)).toBeInTheDocument();
  });
});

