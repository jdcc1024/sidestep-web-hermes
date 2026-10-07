import { describe, expect, it } from "vitest";
import {
  MAX_QTY,
  addOneSize,
  cardJerseyCount,
  cardToLines,
  removeOneSize,
} from "@/lib/orderEntry";

const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL"];
const card = (sizes: Record<string, number>) => ({
  designId: "design1",
  name: "Sidestep",
  number: "72",
  sizes,
});

describe("cardToLines", () => {
  it("should list lines in sizeOptions order whatever order the sizes were tapped in", () => {
    const result = cardToLines(card({ XL: 1, S: 1, M: 3 }), SIZE_OPTIONS);
    expect(result.ok && result.value.map((l) => l.size)).toEqual([
      "S",
      "M",
      "XL",
    ]);
  });

  it("should skip sizes counted at 0", () => {
    const result = cardToLines(card({ S: 0, M: 2 }), SIZE_OPTIONS);
    expect(result.ok && result.value).toEqual([
      { designId: "design1", name: "Sidestep", number: "72", size: "M", qty: 2 },
    ]);
  });

  it("should ask for at least one size when every count is 0", () => {
    expect(cardToLines(card({ M: 0 }), SIZE_OPTIONS)).toEqual({
      ok: false,
      error: "Pick at least one size.",
    });
  });

  it("should reject a qty over MAX_QTY", () => {
    expect(cardToLines(card({ M: MAX_QTY + 1 }), SIZE_OPTIONS).ok).toBe(false);
  });

  it("should reject a fractional qty", () => {
    expect(cardToLines(card({ M: 1.5 }), SIZE_OPTIONS).ok).toBe(false);
  });
});

describe("cardJerseyCount", () => {
  it("should sum every size's count", () => {
    expect(cardJerseyCount({ S: 1, M: 3, XL: 1 })).toBe(5);
    expect(cardJerseyCount({})).toBe(0);
  });
});

describe("addOneSize / removeOneSize", () => {
  it("should add one to a size, starting from not picked", () => {
    expect(addOneSize(addOneSize({}, "M"), "M")).toEqual({ M: 2 });
  });

  it("should not add past MAX_QTY", () => {
    expect(addOneSize({ M: MAX_QTY }, "M")).toEqual({ M: MAX_QTY });
  });

  it("should take one away and drop the size at zero", () => {
    expect(removeOneSize({ M: 2, S: 1 }, "M")).toEqual({ M: 1, S: 1 });
    expect(removeOneSize({ M: 1, S: 1 }, "M")).toEqual({ S: 1 });
  });

  it("should leave the sizes alone when removing a size not picked", () => {
    const sizes = { S: 1 };
    expect(removeOneSize(sizes, "M")).toBe(sizes);
  });
});
