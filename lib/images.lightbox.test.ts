import { describe, expect, it } from "vitest";
import { IMAGE_DEVICE_SIZES, IMAGE_PRESETS } from "./images";

// The lightbox sizing maths that used to be asserted in a browser
// (e2e "loads from /_next/image at 1080 wide or more"): given the preset's
// `sizes` string, which device width does the browser pick at 1x?

// Slot width in CSS px for a viewport, from a `sizes` string made of
// "(min-width: Npx) Xvw|Xpx" entries and a final default.
function slotWidth(sizes: string, viewport: number): number {
  for (const part of sizes.split(",").map((p) => p.trim())) {
    const m = part.match(/^\(min-width:\s*(\d+)px\)\s*(\d+(?:\.\d+)?)(vw|px)$/);
    const toPx = (n: number, unit: string) =>
      unit === "vw" ? (n / 100) * viewport : n;
    if (m) {
      if (viewport >= Number(m[1])) return toPx(Number(m[2]), m[3]);
    } else {
      const d = part.match(/^(\d+(?:\.\d+)?)(vw|px)$/);
      if (d) return toPx(Number(d[1]), d[2]);
    }
  }
  throw new Error(`unparseable sizes: ${sizes}`);
}

// Smallest device width that covers the slot (what srcset selection does).
const pick = (slot: number) =>
  IMAGE_DEVICE_SIZES.find((w) => w >= slot) ??
  IMAGE_DEVICE_SIZES[IMAGE_DEVICE_SIZES.length - 1];

describe("lightbox preset sizing", () => {
  const { sizes } = IMAGE_PRESETS.lightbox;

  it("at 1280 wide the picture slot is 90vw and the browser fetches 1080w or more", () => {
    expect(slotWidth(sizes, 1280)).toBeCloseTo(1152, 0);
    expect(pick(slotWidth(sizes, 1280))).toBeGreaterThanOrEqual(1080);
  });

  it("at 1920 wide the slot is 1728 and the browser fetches 1920w", () => {
    expect(slotWidth(sizes, 1920)).toBeCloseTo(1728, 0);
    expect(pick(slotWidth(sizes, 1920))).toBe(1920);
  });

  it("on a phone the slot is the full viewport width", () => {
    expect(slotWidth(sizes, 375)).toBe(375);
  });

  it("goes through the optimizer", () => {
    expect(IMAGE_PRESETS.lightbox.optimize).toBe(true);
  });
});
