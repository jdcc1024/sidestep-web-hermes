import { describe, expect, it } from "vitest";
import { PUBLIC_IMAGE_MAX_BYTES, toPublicImage } from "./designAsset";

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

  it("one byte over the cap returns null", () => {
    expect(
      toPublicImage(png, PUBLIC_IMAGE_MAX_BYTES + 1, "https://x/y"),
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
