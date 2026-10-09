import { describe, expect, it } from "vitest";
import { PUBLIC_IMAGE_MAX_BYTES, toPublicImage } from "./designAsset";
import { OPTIMIZABLE_SOURCE_MAX_BYTES } from "./images";

// 0004 R3-01: what the public order form may show.
// Signature per docs/architecture/0004-public-form.md: toPublicImage(main, size, url).
describe("toPublicImage", () => {
  const png = { contentType: "image/png" };

  it("the cap is 2 MB", () => {
    expect(PUBLIC_IMAGE_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it("a web-safe picture at exactly the cap passes, as url + contentType only", () => {
    expect(toPublicImage(png, PUBLIC_IMAGE_MAX_BYTES, "https://x/y")).toEqual({
      url: "https://x/y",
      contentType: "image/png",
    });
  });

  // 0004 R3-02: PNG/JPEG/WebP are resized on the way out, so they may be big.
  // GIF (may be animated) and SVG (vector) can't be resized and keep 2 MB.
  const gif = { contentType: "image/gif" };

  it("a GIF at exactly the cap passes", () => {
    expect(toPublicImage(gif, PUBLIC_IMAGE_MAX_BYTES, "https://x/y")).toEqual({
      url: "https://x/y",
      contentType: "image/gif",
    });
  });

  it("a GIF one byte over the cap returns null", () => {
    expect(
      toPublicImage(gif, PUBLIC_IMAGE_MAX_BYTES + 1, "https://x/y"),
    ).toBeNull();
  });

  it("a PNG/JPEG/WebP over 2 MB but within the optimizable cap returns url + contentType", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(
        toPublicImage(
          { contentType: type },
          PUBLIC_IMAGE_MAX_BYTES + 1,
          "https://x/y",
        ),
      ).toEqual({ url: "https://x/y", contentType: type });
    }
    expect(
      toPublicImage(png, OPTIMIZABLE_SOURCE_MAX_BYTES, "https://x/y"),
    ).toEqual({ url: "https://x/y", contentType: "image/png" });
  });

  it("a PNG one byte over the optimizable cap returns null", () => {
    expect(
      toPublicImage(png, OPTIMIZABLE_SOURCE_MAX_BYTES + 1, "https://x/y"),
    ).toBeNull();
  });

  it("a missing url (file gone from storage) returns null", () => {
    expect(toPublicImage(png, 1000, null)).toBeNull();
  });

  it("a PDF returns null even when small", () => {
    expect(
      toPublicImage({ contentType: "application/pdf" }, 1000, "https://x/y"),
    ).toBeNull();
  });
});
