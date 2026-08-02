// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DesignBlock } from "@/lib/designBlock";
import { DesignBlocks, type BlockAsset } from "./DesignBlocks";

const png: BlockAsset = {
  _id: "a-png",
  filename: "crest.png",
  contentType: "image/png",
  url: "https://files.test/crest.png",
};

const pdf: BlockAsset = {
  _id: "a-pdf",
  filename: "print-template.pdf",
  contentType: "application/pdf",
  url: "https://files.test/print-template.pdf",
};

const missing: BlockAsset = {
  _id: "a-gone",
  filename: "lost.png",
  contentType: "image/png",
  url: null,
};

const overview: DesignBlock = {
  id: "b1",
  kind: "text",
  field: "overview",
  body: "Navy and gold, bold numbers.",
};

function renderBlocks(
  blocks: DesignBlock[],
  assets: BlockAsset[] = [png, pdf, missing],
) {
  return render(<DesignBlocks blocks={blocks} assets={assets} />);
}

describe("DesignBlocks", () => {
  it("renders an inviting empty state when the design has no blocks", () => {
    renderBlocks([]);
    expect(screen.getByText(/nothing written yet/i)).toBeInTheDocument();
  });

  it("renders text sections under their field name, in stored order", () => {
    renderBlocks([
      { id: "b2", kind: "text", field: "concept", body: "Retro 90s." },
      overview,
    ]);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Concept", "Overview"]);
    expect(screen.getByText("Retro 90s.")).toBeInTheDocument();
    expect(screen.getByText("Navy and gold, bold numbers.")).toBeInTheDocument();
  });

  it("renders a web-safe image inline, labelled with its filename", () => {
    renderBlocks([
      { id: "g1", kind: "gallery", caption: "Mood board", assetIds: ["a-png"] },
    ]);

    expect(
      screen.getByRole("heading", { level: 2, name: "Mood board" }),
    ).toBeInTheDocument();
    const image = screen.getByRole("img", { name: /crest\.png/i });
    expect(image).toHaveAttribute("src", png.url);
  });

  it("opens a gallery image full size when it is clicked", async () => {
    const user = userEvent.setup();
    renderBlocks([{ id: "g1", kind: "gallery", assetIds: ["a-png"] }]);

    await user.click(
      screen.getByRole("button", { name: /view crest\.png full size/i }),
    );

    expect(await screen.findByTestId("lightbox-image")).toHaveAttribute(
      "src",
      png.url,
    );
  });

  it("offers no zoom for a file that can't be rendered inline", () => {
    renderBlocks([{ id: "g1", kind: "gallery", assetIds: ["a-pdf", "a-gone"] }]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to a generic heading when a gallery has no caption", () => {
    renderBlocks([{ id: "g1", kind: "gallery", assetIds: ["a-png"] }]);
    expect(
      screen.getByRole("heading", { level: 2, name: "Gallery" }),
    ).toBeInTheDocument();
  });

  it("renders a non-web-safe file as a download card rather than an image", () => {
    renderBlocks([{ id: "g1", kind: "gallery", assetIds: ["a-pdf"] }]);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("print-template.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      pdf.url,
    );
  });

  it("degrades gracefully when a file's URL can't be resolved", () => {
    renderBlocks([{ id: "g1", kind: "gallery", assetIds: ["a-gone"] }]);

    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("skips gallery ids whose asset no longer exists", () => {
    renderBlocks([
      { id: "g1", kind: "gallery", assetIds: ["a-deleted", "a-png"] },
    ]);

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName(/crest\.png/i);
  });

  it("shows an empty state for a gallery with nothing picked yet", () => {
    renderBlocks([{ id: "g1", kind: "gallery", assetIds: [] }]);
    expect(screen.getByText(/no files in this gallery/i)).toBeInTheDocument();
  });

  it("renders swatches with their hex, role and Pantone code", () => {
    renderBlocks([
      {
        id: "p1",
        kind: "palette",
        caption: "Kit colors",
        swatches: [
          {
            id: "s1",
            hex: "#102A44",
            role: "primary",
            label: "Deep navy",
            pantoneCode: "289 C",
          },
          { id: "s2", hex: "#FFC845" },
        ],
      },
    ]);

    expect(
      screen.getByRole("heading", { level: 2, name: "Kit colors" }),
    ).toBeInTheDocument();

    const navy = screen.getByTestId("swatch-s1");
    expect(within(navy).getByText("#102A44")).toBeInTheDocument();
    expect(within(navy).getByText("Primary")).toBeInTheDocument();
    expect(within(navy).getByText("Deep navy")).toBeInTheDocument();
    expect(within(navy).getByText(/289 C/)).toBeInTheDocument();

    const gold = screen.getByTestId("swatch-s2");
    expect(within(gold).getByText("#FFC845")).toBeInTheDocument();
  });

  it("paints each swatch chip with its own color", () => {
    renderBlocks([
      {
        id: "p1",
        kind: "palette",
        swatches: [{ id: "s1", hex: "#102A44" }],
      },
    ]);

    const chip = screen.getByTestId("swatch-chip-s1");
    expect(chip).toHaveStyle({ backgroundColor: "#102A44" });
  });

  it("shows an empty state for a palette with no swatches yet", () => {
    renderBlocks([{ id: "p1", kind: "palette", swatches: [] }]);
    expect(screen.getByText(/no colors picked yet/i)).toBeInTheDocument();
  });
});
