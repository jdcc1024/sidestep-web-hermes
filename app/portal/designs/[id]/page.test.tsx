// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let designResult: unknown = undefined;
let auth = { isLoading: false, isAuthenticated: true };

const updateDesign = vi.fn().mockResolvedValue(undefined);
vi.mock("convex/react", () => ({
  useQuery: () => designResult,
  // Every mutation on this page routes through the same stub. The block
  // editor and the asset pool take several of their own; only the metadata
  // writes are asserted here, and they're the only ones the tests trigger.
  useMutation: () => updateDesign,
  useConvexAuth: () => auth,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import type { Id } from "@/convex/_generated/dataModel";
import DesignDetailPage from "./page";

const DESIGN_ID = "design_1" as Id<"designs">;

function design(overrides: Record<string, unknown> = {}) {
  return {
    _id: DESIGN_ID,
    title: "Home kit",
    blocks: [
      { id: "b1", kind: "text", field: "overview", body: "Navy and gold." },
    ],
    assets: [],
    viewer: { userId: "user_1", isAdmin: false },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    jerseyStyle: "Soccer jersey",
    neckline: "Crew Neck",
    sleeveStyle: "Regular",
    ...overrides,
  };
}

async function renderPage() {
  await act(async () => {
    render(
      <Suspense fallback={<p>Loading page</p>}>
        <DesignDetailPage params={Promise.resolve({ id: DESIGN_ID })} />
      </Suspense>,
    );
  });
}

afterEach(() => {
  vi.clearAllMocks();
  designResult = undefined;
  auth = { isLoading: false, isAuthenticated: true };
});

describe("/portal/designs/[id] — no 'not found' flash while auth loads (B-03)", () => {
  it("should show a loading state when a null design arrives while auth is loading", async () => {
    auth = { isLoading: true, isAuthenticated: false };
    designResult = null;
    await renderPage();

    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText(/design not found/i)).toBeNull();
  });

  it("should show a loading state when the token has not attached yet", async () => {
    auth = { isLoading: false, isAuthenticated: false };
    designResult = null;
    await renderPage();

    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText(/design not found/i)).toBeNull();
  });

  it("should still say 'not found' for a design that genuinely isn't there", async () => {
    designResult = null;
    await renderPage();

    expect(screen.getByText(/design not found/i)).toBeInTheDocument();
  });
});

// D-10: the page has one mode. There is no "Edit design" button that swaps the
// whole screen for a form — every field is edited where it is shown, and each
// one saves on its own.
describe("/portal/designs/[id] — everything is edited in place (D-10)", () => {
  it("offers no separate edit mode", async () => {
    designResult = design();
    await renderPage();

    expect(screen.queryByRole("button", { name: /^edit design$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
  });

  it("renames the design from its own heading", async () => {
    const user = userEvent.setup();
    designResult = design();
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Home kit" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit title/i }));
    const input = screen.getByRole("textbox", { name: "Title" });
    await user.clear(input);
    await user.type(input, "Away kit");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateDesign).toHaveBeenCalledWith({
      designId: DESIGN_ID,
      title: "Away kit",
    });
  });

  it("saves a spec on its own without touching the others", async () => {
    const user = userEvent.setup();
    designResult = design();
    await renderPage();

    await user.click(screen.getByRole("radio", { name: "V-Neck" }));

    expect(updateDesign).toHaveBeenCalledWith({
      designId: DESIGN_ID,
      neckline: "V-Neck",
    });
  });

  it("clears a spec back to undecided", async () => {
    const user = userEvent.setup();
    designResult = design();
    await renderPage();

    const sleeves = screen.getByRole("radiogroup", { name: "Sleeve style" });
    await user.click(
      within(sleeves).getByRole("radio", { name: "Not decided" }),
    );

    expect(updateDesign).toHaveBeenCalledWith({
      designId: DESIGN_ID,
      sleeveStyle: "",
    });
  });

  it("offers the Canva link as an editable field even when there isn't one", async () => {
    const user = userEvent.setup();
    designResult = design({ canvaLink: undefined });
    await renderPage();

    await user.click(screen.getByRole("button", { name: /edit canva link/i }));
    await user.type(
      screen.getByRole("textbox", { name: /canva link/i }),
      "https://www.canva.com/design/abc",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateDesign).toHaveBeenCalledWith({
      designId: DESIGN_ID,
      canvaLink: "https://www.canva.com/design/abc",
    });
  });

  it("links out to a Canva link it already has", async () => {
    designResult = design({ canvaLink: "https://www.canva.com/design/abc" });
    await renderPage();

    expect(
      screen.getByRole("link", { name: /open in canva/i }),
    ).toHaveAttribute("href", "https://www.canva.com/design/abc");
  });
});
