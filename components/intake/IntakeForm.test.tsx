// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const submitIntake = vi.fn(async () => "intake_new_test_id");

vi.mock("convex/react", () => ({
  useMutation: () => submitIntake,
}));

import { IntakeForm } from "./IntakeForm";

describe("IntakeForm", () => {
  it("surfaces RHF + zod validation errors when the user submits an empty form", async () => {
    const user = userEvent.setup();
    render(<IntakeForm />);

    // Estimated jersey count defaults to a prefilled, valid value (10) so the
    // team can start from the homepage's quantity; clear it to also exercise
    // the minimum-order validation on an otherwise-empty submit.
    await user.clear(screen.getByLabelText(/estimated jersey count/i));
    await user.click(screen.getByRole("button", { name: /send my inquiry/i }));

    expect(
      await screen.findByText(/please share your name/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tell us your team or organization name/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/we need an email/i)).toBeInTheDocument();
    expect(
      screen.getByText(/let us know the sport or activity/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/our minimum order is/i)).toBeInTheDocument();
    expect(
      screen.getByText(/pick the option that fits best/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/tell us a bit about your team/i),
    ).toBeInTheDocument();
    expect(submitIntake).not.toHaveBeenCalled();
  });
});
