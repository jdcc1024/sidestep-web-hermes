import { describe, expect, it } from "vitest";
import { IMAGE_PRESETS, shouldOptimize } from "./images";

// IMG-01 (backlog/IMG-01, ## Logic): the three new summary/tile presets resize
// what sharp can resize, and leave GIF and SVG alone.

type Preset = keyof typeof IMAGE_PRESETS;
const NEW_PRESETS = ["captainChip", "designCard", "poolTile"] as const;

describe("shouldOptimize: captainChip, designCard, poolTile", () => {
  it.each(NEW_PRESETS)("%s exists", (name) => {
    expect(Object.keys(IMAGE_PRESETS)).toContain(name);
  });

  for (const name of NEW_PRESETS) {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      it(`${name} + ${type} is optimized`, () => {
        expect(shouldOptimize(type, name as Preset)).toBe(true);
      });
    }
    for (const type of ["image/gif", "image/svg+xml"]) {
      it(`${name} + ${type} keeps the original`, () => {
        expect(shouldOptimize(type, name as Preset)).toBe(false);
      });
    }
  }
});
