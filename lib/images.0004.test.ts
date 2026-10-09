import { describe, expect, it } from "vitest";
import {
  IMAGE_PRESETS,
  OPTIMIZABLE_SOURCE_MAX_BYTES,
  convexImagePattern,
  shouldOptimize,
} from "./images";

// 0004 R3-02: the pure rules in lib/images.ts (backlog/R3-02, ## Logic).

type Preset = keyof typeof IMAGE_PRESETS;

describe("convexImagePattern", () => {
  it("a Convex URL gives https, its exact hostname, /api/storage/** and no query", () => {
    expect(convexImagePattern("https://happy-animal-123.convex.cloud")).toEqual(
      {
        protocol: "https",
        hostname: "happy-animal-123.convex.cloud",
        pathname: "/api/storage/**",
        search: "",
      },
    );
  });

  it("ignores a path or query on the input and still names only the host", () => {
    expect(
      convexImagePattern("https://a-b-1.convex.cloud/some/path?x=1"),
    ).toMatchObject({
      hostname: "a-b-1.convex.cloud",
      pathname: "/api/storage/**",
      search: "",
    });
  });

  it("an empty or malformed string gives null", () => {
    expect(convexImagePattern("")).toBeNull();
    expect(convexImagePattern("not a url")).toBeNull();
  });
});

describe("shouldOptimize", () => {
  const presets = Object.keys(IMAGE_PRESETS).filter(
    (p) => p !== "original",
  ) as Preset[];

  it("there are non-original presets to test with", () => {
    expect(presets.length).toBeGreaterThan(0);
  });

  it("PNG, JPEG and WebP are optimised for every non-original preset, any casing or parameters", () => {
    for (const preset of presets) {
      for (const type of [
        "image/png",
        "image/jpeg",
        "image/webp",
        "IMAGE/PNG",
        "Image/WebP",
        "image/png; charset=binary",
      ]) {
        expect(
          shouldOptimize(type, preset),
          `${type} @ ${String(preset)}`,
        ).toBe(true);
      }
    }
  });

  it("GIF, SVG and PDF are never optimised", () => {
    for (const preset of presets) {
      for (const type of ["image/gif", "image/svg+xml", "application/pdf"]) {
        expect(
          shouldOptimize(type, preset),
          `${type} @ ${String(preset)}`,
        ).toBe(false);
      }
    }
  });

  it("the original preset is never optimised, whatever the type", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      expect(shouldOptimize(type, "original"), type).toBe(false);
    }
  });
});

describe("OPTIMIZABLE_SOURCE_MAX_BYTES", () => {
  it("is well above the 2 MB form cap (the print files are the point)", () => {
    expect(OPTIMIZABLE_SOURCE_MAX_BYTES).toBeGreaterThan(2 * 1024 * 1024);
  });
});
