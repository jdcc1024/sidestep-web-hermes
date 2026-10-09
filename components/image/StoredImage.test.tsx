// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IMAGE_PRESETS } from "@/lib/images";
import { StoredImage } from "./StoredImage";

const pngUrl = "https://example.convex.cloud/api/storage/abc-123";
const png = { url: pngUrl, contentType: "image/png" };
const gif = { url: pngUrl, contentType: "image/gif" };

const srcsetWidths = (srcset: string) =>
  srcset.split(",").map((entry) => {
    const match = /[?&]w=(\d+)/.exec(entry);
    if (!match) throw new Error(`no w= in "${entry}"`);
    return Number(match[1]);
  });

describe("StoredImage", () => {
  it("should render the plain storage URL with no srcset or sizes when the preset is original (the default)", () => {
    render(<StoredImage image={png} alt="Kit" />);
    const img = screen.getByRole("img", { name: "Kit" });
    expect(img).toHaveAttribute("src", pngUrl);
    expect(img).not.toHaveAttribute("srcset");
    expect(img).not.toHaveAttribute("sizes");
  });

  it("should route a PNG through the optimizer with a capped srcset when the preset is publicHero", () => {
    render(<StoredImage image={png} alt="Kit" preset="publicHero" />);
    const img = screen.getByRole("img", { name: "Kit" });

    expect(img.getAttribute("src")).toContain(
      `/_next/image?url=${encodeURIComponent(pngUrl)}`,
    );
    const srcset = img.getAttribute("srcset");
    expect(srcset).toBeTruthy();
    const widths = srcsetWidths(srcset!);
    expect(widths.length).toBeGreaterThan(0);
    expect(Math.max(...widths)).toBeLessThanOrEqual(2048);
    expect(img).toHaveAttribute("sizes", IMAGE_PRESETS.publicHero.sizes);
  });

  it("should keep the plain URL for a GIF even when the preset optimizes", () => {
    render(<StoredImage image={gif} alt="Kit" preset="publicHero" />);
    const img = screen.getByRole("img", { name: "Kit" });
    expect(img).toHaveAttribute("src", pngUrl);
    expect(img).not.toHaveAttribute("srcset");
  });

  it("should pass className, alt and loading through without an inline style", () => {
    render(
      <StoredImage
        image={png}
        alt="Away kit"
        preset="publicTile"
        className="size-full object-contain"
        loading="eager"
        data-testid="pic"
      />,
    );
    const img = screen.getByTestId("pic");
    expect(img).toHaveAttribute("alt", "Away kit");
    expect(img).toHaveClass("size-full", "object-contain");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).not.toHaveAttribute("style");
  });
});
