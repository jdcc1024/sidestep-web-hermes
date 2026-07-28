// @vitest-environment jsdom
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

let designResult: unknown = undefined;
let auth = { isLoading: false, isAuthenticated: true };

vi.mock("convex/react", () => ({
  useQuery: () => designResult,
  useMutation: () => vi.fn(),
  useConvexAuth: () => auth,
}));

import type { Id } from "@/convex/_generated/dataModel";
import DesignDetailPage from "./page";

const DESIGN_ID = "design_1" as Id<"designs">;

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
