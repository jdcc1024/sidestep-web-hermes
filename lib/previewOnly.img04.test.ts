import { describe, expect, it } from "vitest";
import {
  PREVIEW_CONTENT_TYPE,
  canMakePreview,
  canOptimize,
} from "./images";
import { displayImageOf, pictureUrl } from "./designAsset";

// IMG-04 beyond the acceptance tests: which types get a stored preview, and
// the pure "what does a picture load" helpers never reach for the original.

describe("canMakePreview", () => {
  it("should be true for PNG, JPEG, WebP, GIF and SVG, with parameters and any casing", () => {
    for (const type of [
      "image/png",
      "IMAGE/JPEG",
      "image/webp",
      " image/gif ",
      "image/svg+xml; charset=utf-8",
    ])
      expect(canMakePreview(type), type).toBe(true);
  });

  it("should be false for a PDF, an octet-stream and a missing type", () => {
    for (const type of ["application/pdf", "application/octet-stream", "", null, undefined])
      expect(canMakePreview(type), String(type)).toBe(false);
  });
});

describe("canOptimize", () => {
  it("should still refuse GIF and SVG (the Next optimizer's own rule is unchanged)", () => {
    expect(canOptimize("image/gif")).toBe(false);
    expect(canOptimize("image/svg+xml")).toBe(false);
    expect(canOptimize(PREVIEW_CONTENT_TYPE)).toBe(true);
  });
});

describe("pictureUrl", () => {
  it("should be null when there's only the original's url", () => {
    expect(pictureUrl({ url: "x" })).toBeNull();
    expect(pictureUrl({ url: "x", displayUrl: null })).toBeNull();
  });

  it("should be the preview's url when there is one", () => {
    expect(pictureUrl({ url: "x", displayUrl: "p" })).toBe("p");
  });
});

describe("displayImageOf", () => {
  it("should give the preview's url and WebP for a GIF asset, never the asset's type", () => {
    expect(
      displayImageOf({
        contentType: "image/gif",
        displayUrl: "p",
        displayContentType: "image/webp",
      }),
    ).toEqual({ url: "p", contentType: "image/webp" });
  });

  it("should default the type to WebP when the shape has no displayContentType", () => {
    expect(
      displayImageOf({ contentType: "image/svg+xml", displayUrl: "p" }),
    ).toEqual({ url: "p", contentType: PREVIEW_CONTENT_TYPE });
  });

  it("should be null without a preview, and for a non-image", () => {
    expect(displayImageOf({ contentType: "image/png", displayUrl: null })).toBeNull();
    expect(displayImageOf({ contentType: "image/png" })).toBeNull();
    expect(
      displayImageOf({ contentType: "application/pdf", displayUrl: "p" }),
    ).toBeNull();
  });
});
