// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// One shared stub for every useMutation call — the validation tests never
// reach the submit path, and the one test that does has no pending uploads,
// so we don't need to distinguish between them.
const mutationStub = vi.fn(async (_args?: unknown) => undefined);
vi.mock("convex/react", () => ({
  useMutation: () => mutationStub,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { DesignForm } from "./DesignForm";

describe("DesignForm", () => {
  // The stub is shared across tests, so the "never submitted" assertions only
  // mean anything if each test starts from a clean call log.
  beforeEach(() => mutationStub.mockClear());

  it("surfaces RHF + zod validation errors when the user submits an empty form", async () => {
    const user = userEvent.setup();
    render(<DesignForm />);

    await user.click(screen.getByRole("button", { name: /save design/i }));

    expect(
      await screen.findByText(/give your design a title/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/add an overview so sidestep knows what you want/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/upload at least one file/i),
    ).toBeInTheDocument();
    expect(mutationStub).not.toHaveBeenCalled();
  });

  it("renders the optional silhouette spec fields", () => {
    render(<DesignForm />);

    expect(screen.getByLabelText(/jersey style/i)).toBeInTheDocument();
    expect(screen.getByText("Neckline")).toBeInTheDocument();
    expect(screen.getByText("Sleeve style")).toBeInTheDocument();
    // Specs are optional: an empty submit never complains about them.
    expect(screen.queryByText(/choose a neckline from the list/i)).toBeNull();
  });

  it("does not block submission on blank specs (they are optional)", async () => {
    const user = userEvent.setup();
    render(<DesignForm />);

    await user.click(screen.getByRole("button", { name: /save design/i }));

    // The required fields complain, but the optional specs never do.
    expect(
      await screen.findByText(/give your design a title/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/choose a neckline from the list/i),
    ).toBeNull();
    expect(
      screen.queryByText(/choose a sleeve style from the list/i),
    ).toBeNull();
  });

  it("stores the overview as the new design's Overview block", async () => {
    const user = userEvent.setup();
    // A create needs at least one file, and uploads go straight to the signed
    // URL rather than through Convex — so the two-phase upload is the one part
    // of the submit path that needs a stubbed transport.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ storageId: "storage_1" }),
      })),
    );
    render(<DesignForm />);

    await user.type(screen.getByLabelText(/^title$/i), "Home kit");
    await user.type(screen.getByLabelText(/overview/i), "Navy and gold.");
    await user.upload(
      screen.getByLabelText(/click to choose files/i),
      new File(["x"], "logo.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /save design/i }));

    await vi.waitFor(() => expect(mutationStub).toHaveBeenCalled());
    const [args] = mutationStub.mock.calls.at(-1) as unknown as [
      { blocks: { kind: string; field: string; body: string }[] },
    ];
    expect(args.blocks).toMatchObject([
      { kind: "text", field: "overview", body: "Navy and gold." },
    ]);
    vi.unstubAllGlobals();
  });

  // D-10 removed the edit mode: the design page edits every one of these
  // fields in place, so this form only ever creates.
  it("is a create form — it never renders a 'save changes' submit", () => {
    render(<DesignForm />);

    expect(
      screen.getByRole("button", { name: /save design/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
  });

  it("flags an invalid canva link", async () => {
    const user = userEvent.setup();
    render(<DesignForm />);

    await user.type(screen.getByLabelText(/canva share link/i), "canva.com/x");
    await user.click(screen.getByRole("button", { name: /save design/i }));

    expect(
      await screen.findByText(/paste a full link starting with https/i),
    ).toBeInTheDocument();
    expect(mutationStub).not.toHaveBeenCalled();
  });
});
