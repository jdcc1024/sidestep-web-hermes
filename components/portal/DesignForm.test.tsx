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

  // The brief moved to the block editor on the design page (D-03). The edit
  // form keeps title/cut/Canva/files, and — critically — sends no `blocks`, so
  // saving it can't overwrite a section the editor just changed.
  describe("edit mode", () => {
    function renderEdit() {
      return render(
        <DesignForm
          mode={{
            kind: "edit",
            designId: "design_1" as Id<"designs">,
            initialTitle: "Home kit",
            initialCanvaLink: "",
            initialJerseyStyle: "",
            initialNeckline: "",
            initialSleeveStyle: "",
            existingFileCount: 1,
          }}
        />,
      );
    }

    it("does not offer an Overview field — the block editor owns the brief", () => {
      renderEdit();
      expect(screen.queryByLabelText(/overview/i)).toBeNull();
      expect(screen.getByLabelText(/^title$/i)).toBeInTheDocument();
    });

    it("saves without sending blocks, and without complaining about the missing overview", async () => {
      const user = userEvent.setup();
      renderEdit();

      await user.clear(screen.getByLabelText(/^title$/i));
      await user.type(screen.getByLabelText(/^title$/i), "Home kit v2");
      await user.click(screen.getByRole("button", { name: /save changes/i }));

      await vi.waitFor(() => expect(mutationStub).toHaveBeenCalled());
      const [args] = mutationStub.mock.calls.at(-1) as unknown as [
        Record<string, unknown>,
      ];
      expect(args.title).toBe("Home kit v2");
      expect(args).not.toHaveProperty("blocks");
      expect(
        screen.queryByText(/add an overview so sidestep knows/i),
      ).toBeNull();
    });
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
