import { describe, expect, it } from "vitest";
import {
  isPlayerItem,
  itemAddedBy,
  itemCountText,
  itemLabel,
  removedItemMessage,
  sizeChip,
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

describe("itemAddedBy", () => {
  it("should credit the captain's own items to them", () => {
    expect(itemAddedBy({})).toBe("Added by you");
  });

  it("should credit a player by first name only", () => {
    expect(
      itemAddedBy({
        submitterName: "Riley Chen",
        submitterEmail: "r@example.test",
      }),
    ).toBe("Added by Riley");
  });

  it("should still credit a player who left no name", () => {
    expect(itemAddedBy({ submitterEmail: "r@example.test" })).toBe(
      "Added by a player",
    );
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

describe("count text", () => {
  it("should pluralise items", () => {
    expect(itemCountText(0)).toBe("0 items");
    expect(itemCountText(1)).toBe("1 item");
    expect(itemCountText(6)).toBe("6 items");
  });

  it("should write a size chip with no space around the ×", () => {
    expect(sizeChip({ size: "2XL", qty: 2 })).toBe("2XL×2");
  });
});
