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

import type { Id } from "@/convex/_generated/dataModel";
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

  // The Overview textarea is one block inside a larger array (D-02). Editing
  // it must not drop the galleries and palette the block editor owns.
  it("saves the overview as a text block and preserves the design's other blocks", async () => {
    const user = userEvent.setup();
    const gallery = {
      id: "g1",
      kind: "gallery" as const,
      caption: "Mood board",
      assetIds: [],
    };

    render(
      <DesignForm
        mode={{
          kind: "edit",
          designId: "design_1" as Id<"designs">,
          initialTitle: "Home kit",
          initialOverview: "Old overview",
          initialBlocks: [
            { id: "b1", kind: "text", field: "overview", body: "Old overview" },
            gallery,
          ],
          initialCanvaLink: "",
          initialJerseyStyle: "",
          initialNeckline: "",
          initialSleeveStyle: "",
          existingFileCount: 1,
        }}
      />,
    );

    const overview = screen.getByLabelText(/overview/i);
    await user.clear(overview);
    await user.type(overview, "New overview");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => expect(mutationStub).toHaveBeenCalled());
    const [args] = mutationStub.mock.calls.at(-1) as unknown as [
      { blocks: unknown[] },
    ];
    expect(args.blocks).toEqual([
      { id: "b1", kind: "text", field: "overview", body: "New overview" },
      gallery,
    ]);
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
