// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

// `listMyDesigns` answers "no identity yet" with the same `[]` it uses for
// "you have no designs", so the empty state has to be gated on auth (B-03).
let designsResult: unknown = undefined;
let auth = { isLoading: false, isAuthenticated: true };

vi.mock("convex/react", () => ({
  useQuery: () => designsResult,
  useConvexAuth: () => auth,
}));

import MyDesignsPage from "./page";

async function renderPage() {
  await act(async () => {
    render(<MyDesignsPage />);
  });
}

afterEach(() => {
  vi.clearAllMocks();
  designsResult = undefined;
  auth = { isLoading: false, isAuthenticated: true };
});

describe("/portal/designs — no 'no designs' flash while auth loads (B-03)", () => {
  it("should show the loading grid when an empty list arrives while auth is loading", async () => {
    auth = { isLoading: true, isAuthenticated: false };
    designsResult = [];
    await renderPage();

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/no designs yet/i)).toBeNull();
  });

  it("should show the loading grid when the token has not attached yet", async () => {
    auth = { isLoading: false, isAuthenticated: false };
    designsResult = [];
    await renderPage();

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/no designs yet/i)).toBeNull();
  });

  it("should show the empty state once an authenticated read comes back empty", async () => {
    designsResult = [];
    await renderPage();

    expect(screen.getByText(/no designs yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /upload a design/i }),
    ).toBeInTheDocument();
  });

  it("should list the designs once they load", async () => {
    designsResult = [
      {
        _id: "design_1",
        title: "Home kit",
        blocks: [],
        fileCount: 2,
        mainImage: null,
      },
    ];
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Home kit", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });
});

// The card is a picture first (D-07's resolver, list surface): a design you
// recognise by its kit, with the title and file count underneath.
describe("/portal/designs — main image on the card", () => {
  it("should render the design's main image", async () => {
    designsResult = [
      {
        _id: "design_1",
        title: "Home kit",
        blocks: [],
        fileCount: 2,
        mainImage: {
          url: "https://storage.test/crest.png",
          filename: "crest.png",
          contentType: "image/png",
        },
      },
    ];
    await renderPage();

    const image = screen.getByAltText("Home kit main image");
    expect(image).toHaveAttribute("src", "https://storage.test/crest.png");
  });

  it("should fall back to a placeholder when the design has no image", async () => {
    designsResult = [
      {
        _id: "design_1",
        title: "Docs only",
        blocks: [],
        fileCount: 1,
        mainImage: null,
      },
    ];
    await renderPage();

    expect(screen.queryByAltText(/main image/i)).toBeNull();
    expect(
      screen.getByRole("img", { name: /no image yet for docs only/i }),
    ).toBeInTheDocument();
  });

  // A print template can be the owner's explicit pick, and a browser can't
  // draw it — the renderer, not the query, makes that call.
  it("should fall back to the placeholder for a non-renderable main file", async () => {
    designsResult = [
      {
        _id: "design_1",
        title: "Home kit",
        blocks: [],
        fileCount: 1,
        mainImage: {
          url: "https://storage.test/print.pdf",
          filename: "print.pdf",
          contentType: "application/pdf",
        },
      },
    ];
    await renderPage();

    expect(screen.queryByAltText(/main image/i)).toBeNull();
    expect(
      screen.getByRole("img", { name: /no image yet for home kit/i }),
    ).toBeInTheDocument();
  });
});
