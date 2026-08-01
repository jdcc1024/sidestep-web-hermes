// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Id } from "@/convex/_generated/dataModel";

// The panel is a Base UI dialog, so its enter/exit is CSS (see N-06). What is
// worth pinning here is the behaviour that animation must not disturb: the
// panel's fields exist only while it is open, closing genuinely unmounts them
// rather than leaving orphaned content behind, and the create path still
// validates, calls the mutation, and closes.

const createRun = vi.fn(async (_args?: unknown) => undefined);

vi.mock("convex/react", () => ({
  useMutation: () => createRun,
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

import { StartCollecting } from "./StartCollecting";

const fakeOrderId = "order_test_id" as Id<"orders">;

/** Comfortably future-dated so these never go stale or flake near midnight. */
const FUTURE_DATE = "2099-06-15";
const PAST_DATE = "2020-01-02";

function trigger() {
  return screen.getByRole("button", { name: /start collecting/i });
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(trigger());
  return await screen.findByLabelText(/deadline/i);
}

describe("StartCollecting", () => {
  beforeEach(() => {
    createRun.mockClear();
    createRun.mockResolvedValue(undefined);
    toastSuccess.mockClear();
  });

  it("keeps the panel's fields out of the document until it is opened", () => {
    render(<StartCollecting orderId={fakeOrderId} />);

    expect(trigger()).toBeInTheDocument();
    expect(screen.queryByLabelText(/deadline/i)).toBeNull();
  });

  it("shows the deadline field once opened", async () => {
    const user = userEvent.setup();
    render(<StartCollecting orderId={fakeOrderId} />);

    expect(await openPanel(user)).toBeInTheDocument();
    expect(
      screen.getByText(/submissions close at the end of this day/i),
    ).toBeInTheDocument();
  });

  it("removes the panel's content on close rather than leaving it behind", async () => {
    const user = userEvent.setup();
    render(<StartCollecting orderId={fakeOrderId} />);
    await openPanel(user);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText(/deadline/i)).toBeNull();
    });
  });

  it("leaves exactly one panel behind after rapid open/close cycles", async () => {
    const user = userEvent.setup();
    render(<StartCollecting orderId={fakeOrderId} />);

    for (let i = 0; i < 3; i++) {
      await user.click(trigger());
      await user.keyboard("{Escape}");
    }
    await openPanel(user);

    // A stuck or duplicated panel shows up here as a second deadline field;
    // getBy* throws on more than one match, so this assertion is the check.
    expect(screen.getByLabelText(/deadline/i)).toBeInTheDocument();
  });

  it("refuses to create a run without a deadline", async () => {
    const user = userEvent.setup();
    render(<StartCollecting orderId={fakeOrderId} />);
    await openPanel(user);

    await user.click(
      screen.getByRole("button", { name: /^start collecting$/i, hidden: false }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /pick a deadline date/i,
    );
    expect(createRun).not.toHaveBeenCalled();
    // The panel stays open so the captain can fix it.
    expect(screen.getByLabelText(/deadline/i)).toBeInTheDocument();
  });

  it("refuses a deadline in the past", async () => {
    const user = userEvent.setup();
    render(<StartCollecting orderId={fakeOrderId} />);
    const field = await openPanel(user);

    await user.type(field, PAST_DATE);
    await user.click(screen.getAllByRole("button", { name: /^start collecting$/i }).at(-1)!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /must be in the future/i,
    );
    expect(createRun).not.toHaveBeenCalled();
  });

  it("creates the run, closes the panel, and confirms with a toast", async () => {
    const user = userEvent.setup();
    render(<StartCollecting orderId={fakeOrderId} />);
    const field = await openPanel(user);

    await user.type(field, FUTURE_DATE);
    await user.click(screen.getAllByRole("button", { name: /^start collecting$/i }).at(-1)!);

    await waitFor(() => {
      expect(createRun).toHaveBeenCalledTimes(1);
    });
    expect(createRun).toHaveBeenCalledWith({
      orderId: fakeOrderId,
      deadline: Date.parse(`${FUTURE_DATE}T23:59:59.999Z`),
    });
    await waitFor(() => {
      expect(screen.queryByLabelText(/deadline/i)).toBeNull();
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "You're collecting",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("keeps the panel open and reports the reason when creation fails", async () => {
    createRun.mockRejectedValueOnce(new Error("Order is already collecting"));
    const user = userEvent.setup();
    render(<StartCollecting orderId={fakeOrderId} />);
    const field = await openPanel(user);

    await user.type(field, FUTURE_DATE);
    await user.click(screen.getAllByRole("button", { name: /^start collecting$/i }).at(-1)!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already collecting/i,
    );
    expect(screen.getByLabelText(/deadline/i)).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
