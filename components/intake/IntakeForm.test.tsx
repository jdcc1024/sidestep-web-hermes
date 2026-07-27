// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Typed by its signature so assertions on `mock.calls[0][0]` see the payload.
const submitIntake = vi.fn<(payload: Record<string, unknown>) => Promise<string>>(
  async () => "intake_new_test_id",
);

vi.mock("convex/react", () => ({
  useMutation: () => submitIntake,
}));

import { IntakeForm } from "./IntakeForm";
import { MAX_INSPIRATION_LINKS } from "@/lib/intake";

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

const DRIVE_LINK = "https://drive.google.com/drive/folders/abc123";

// Long free-text values go in by paste rather than keystroke-by-keystroke.
// Every keystroke re-renders a validating form, and the multi-sentence brief
// alone was enough to push these tests past the 5s default timeout when the
// suite runs in parallel. Paste fires the same change handling the assertions
// below care about — they check what gets submitted, not per-key behaviour —
// while the short fields keep typing so the typed path stays covered.
async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/your name/i), "Sam Captain");
  await user.type(
    screen.getByLabelText(/team or organization/i),
    "Falcons",
  );
  await user.type(screen.getByLabelText(/^email$/i), "sam@example.com");
  await user.type(screen.getByLabelText(/sport or activity/i), "Soccer");
  await user.click(screen.getByText(/i need help designing/i));
  await user.click(screen.getByLabelText(/tell us about your team/i));
  await user.paste("Navy kit with gold trim.");
}

describe("IntakeForm — inspiration links", () => {
  it("submits without any link, unchanged from before the field existed", async () => {
    const user = userEvent.setup();
    submitIntake.mockClear();
    render(<IntakeForm />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /send my inquiry/i }));

    await screen.findByText(/thanks — we've got it/i);
    expect(submitIntake).toHaveBeenCalledTimes(1);
    expect(submitIntake.mock.calls[0][0]).not.toHaveProperty(
      "inspirationLinks",
    );
  });

  it("sends a pasted share-folder link with the submission", async () => {
    const user = userEvent.setup();
    submitIntake.mockClear();
    render(<IntakeForm />);

    await fillRequiredFields(user);
    // Pasted, as the name says — nobody types a 45-character share URL.
    await user.click(screen.getByLabelText(/^inspiration link 1$/i));
    await user.paste(DRIVE_LINK);
    await user.click(screen.getByRole("button", { name: /send my inquiry/i }));

    await screen.findByText(/thanks — we've got it/i);
    expect(submitIntake.mock.calls[0][0]).toMatchObject({
      inspirationLinks: [DRIVE_LINK],
    });
  });

  it("blocks submission and explains when a link is malformed", async () => {
    const user = userEvent.setup();
    submitIntake.mockClear();
    render(<IntakeForm />);

    await fillRequiredFields(user);
    await user.type(screen.getByLabelText(/^inspiration link 1$/i), "nope");
    await user.click(screen.getByRole("button", { name: /send my inquiry/i }));

    expect(await screen.findByText(/https:\/\//i)).toBeInTheDocument();
    expect(submitIntake).not.toHaveBeenCalled();
  });

  it("adds and removes link rows, stopping at the cap", async () => {
    const user = userEvent.setup();
    render(<IntakeForm />);

    const addButton = () =>
      screen.queryByRole("button", { name: /add another link/i });

    expect(screen.getAllByLabelText(/^inspiration link \d$/i)).toHaveLength(1);
    // A lone row has no remove button — nothing to fall back to.
    expect(
      screen.queryByRole("button", { name: /remove inspiration link/i }),
    ).not.toBeInTheDocument();

    for (let i = 1; i < MAX_INSPIRATION_LINKS; i++) {
      await user.click(addButton()!);
    }
    expect(screen.getAllByLabelText(/^inspiration link \d$/i)).toHaveLength(
      MAX_INSPIRATION_LINKS,
    );
    expect(addButton()).not.toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: /remove inspiration link/i })[0],
    );
    expect(screen.getAllByLabelText(/^inspiration link \d$/i)).toHaveLength(
      MAX_INSPIRATION_LINKS - 1,
    );
    expect(addButton()).toBeInTheDocument();
  });

  it("hints when the host is unrecognized without blocking it", async () => {
    const user = userEvent.setup();
    submitIntake.mockClear();
    render(<IntakeForm />);

    await fillRequiredFields(user);
    await user.type(
      screen.getByLabelText(/^inspiration link 1$/i),
      "https://example.com/photos",
    );
    expect(
      await screen.findByText(/not a share host we recognize/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /send my inquiry/i }));
    await screen.findByText(/thanks — we've got it/i);
    expect(submitIntake.mock.calls[0][0]).toMatchObject({
      inspirationLinks: ["https://example.com/photos"],
    });
  });
});
