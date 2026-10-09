import { describe, expect, it } from "vitest";
import {
  isPlayerItem,
  itemLabel,
  removedItemMessage,
  sizeChip,
  sizeQtyText,
} from "./label";

describe("itemLabel", () => {
  it("should join name and number as `<Name> #<Number>`", () => {
    expect(itemLabel({ name: "Sidestep", number: "72" })).toBe("Sidestep #72");
  });

  it("should use either half on its own when the other is missing", () => {
    expect(itemLabel({ name: "Bure" })).toBe("Bure");
    expect(itemLabel({ number: "10" })).toBe("#10");
  });

  it("should say `No name` when the item has neither", () => {
    expect(itemLabel({})).toBe("No name");
    expect(itemLabel({ name: "  ", number: "" })).toBe("No name");
  });
});

describe("isPlayerItem", () => {
  it("should be true for items sent through the order form", () => {
    expect(isPlayerItem({ source: "fan" })).toBe(true);
    expect(
      isPlayerItem({ source: "captain", submitterEmail: "a@b.test" }),
    ).toBe(true);
  });

  it("should be false for the captain's own items", () => {
    expect(isPlayerItem({ source: "captain" })).toBe(false);
  });
});

describe("removedItemMessage", () => {
  it("should name the item and its size", () => {
    expect(
      removedItemMessage({ name: "Sidestep", number: "72", size: "M" }),
    ).toBe("Removed Sidestep #72 (M)");
  });

  it("should leave the brackets off an item that needs a size", () => {
    expect(removedItemMessage({ name: "Bure", number: "10" })).toBe(
      "Removed Bure #10",
    );
  });
});

// 0004 size chips (UX §6): one rule, `${size}×${qty}` always, so a single
// jersey reads `S×1` and the breakdown and the row say the same thing.
// The itemAddedBy / itemCountText tests are gone: the spec deletes both
// functions (§5, §7), and playerAddedBy had no test here.
describe.each([
  ["sizeQtyText", sizeQtyText],
  ["sizeChip", sizeChip],
])("%s", (_name, text) => {
  it("should show ×1 for a single jersey", () => {
    expect(text({ size: "S", qty: 1 })).toBe("S×1");
  });

  it("should show the count for several jerseys, with no space around the ×", () => {
    expect(text({ size: "M", qty: 3 })).toBe("M×3");
  });

  it("should keep a digit-led size distinct from its count", () => {
    expect(text({ size: "2XL", qty: 1 })).toBe("2XL×1");
  });
});
