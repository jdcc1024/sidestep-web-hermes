// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DesignMainImage } from "@/lib/designAsset";
import { IMAGE_PRESETS } from "@/lib/images";
import { DesignThumbnail } from "./DesignThumbnail";

const png: DesignMainImage = {
  url: "https://files.test/kit.png",
  filename: "kit.png",
  contentType: "image/png",
};

describe("DesignThumbnail", () => {
  it("renders the main image", () => {
    render(<DesignThumbnail title="Away kit" mainImage={png} />);
    expect(
      screen.getByRole("img", { name: "Away kit main image" }),
    ).toHaveAttribute("src", png.url);
  });

  it("falls back to a placeholder when the design has no image", () => {
    render(<DesignThumbnail title="Away kit" mainImage={null} />);
    expect(
      screen.getByRole("img", { name: /no image yet for away kit/i }),
    ).toBeInTheDocument();
  });

  it("is not interactive by default, so it can sit inside a link", () => {
    render(<DesignThumbnail title="Away kit" mainImage={png} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the image full size when zoomable and clicked", async () => {
    const user = userEvent.setup();
    render(<DesignThumbnail title="Away kit" mainImage={png} zoomable />);

    await user.click(
      screen.getByRole("button", { name: /view away kit full size/i }),
    );

    expect(await screen.findByTestId("lightbox-image")).toHaveAttribute(
      "src",
      png.url,
    );
  });

  it("should fetch a resized picture, and a resized lightbox, when given a public preset", async () => {
    const user = userEvent.setup();
    render(
      <DesignThumbnail
        title="Away kit"
        mainImage={png}
        preset="publicHero"
        zoomable
      />,
    );

    expect(
      screen.getByRole("img", { name: "Away kit main image" }).getAttribute("src"),
    ).toContain("/_next/image?url=");

    await user.click(
      screen.getByRole("button", { name: /view away kit full size/i }),
    );
    const full = await screen.findByTestId("lightbox-image");
    expect(full.getAttribute("src")).toContain("/_next/image?url=");
    expect(full).toHaveAttribute("sizes", IMAGE_PRESETS.lightbox.sizes);
  });

  it("should keep the plain URL in the picture and the lightbox when no preset is given", async () => {
    const user = userEvent.setup();
    render(<DesignThumbnail title="Away kit" mainImage={png} zoomable />);

    const thumb = screen.getByRole("img", { name: "Away kit main image" });
    expect(thumb).toHaveAttribute("src", png.url);
    expect(thumb).not.toHaveAttribute("srcset");

    await user.click(
      screen.getByRole("button", { name: /view away kit full size/i }),
    );
    const full = await screen.findByTestId("lightbox-image");
    expect(full).toHaveAttribute("src", png.url);
    expect(full).not.toHaveAttribute("srcset");
  });

  it("stays non-interactive when zoomable but there is nothing to enlarge", () => {
    render(
      <DesignThumbnail
        title="Away kit"
        mainImage={{
          url: "https://files.test/template.pdf",
          filename: "template.pdf",
          contentType: "application/pdf",
        }}
        zoomable
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /no image yet for away kit/i }),
    ).toBeInTheDocument();
  });
});
