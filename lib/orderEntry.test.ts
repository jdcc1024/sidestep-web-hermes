import { describe, expect, it } from "vitest";
import {
  MAX_QTY,
  SUBMITTER_NAME_MAX_LENGTH,
  checkQty,
  checkSize,
  checkSubmitterEmail,
  checkSubmitterName,
  isOrderSource,
} from "./orderEntry";

const SIZES = ["S", "M", "L"];

describe("isOrderSource", () => {
  it("accepts captain and fan, rejects others", () => {
    expect(isOrderSource("captain")).toBe(true);
    expect(isOrderSource("fan")).toBe(true);
    expect(isOrderSource("robot")).toBe(false);
  });
});

describe("checkQty", () => {
  it("accepts a whole number in range", () => {
    expect(checkQty(3)).toEqual({ ok: true, value: 3 });
  });

  it("rejects zero and negatives", () => {
    expect(checkQty(0).ok).toBe(false);
    expect(checkQty(-1).ok).toBe(false);
  });

  it("rejects a fractional quantity", () => {
    expect(checkQty(1.5).ok).toBe(false);
  });

  it("rejects NaN", () => {
    expect(checkQty(Number.NaN).ok).toBe(false);
  });

  it("rejects a quantity over the cap", () => {
    expect(checkQty(MAX_QTY + 1).ok).toBe(false);
  });
});

describe("checkSize", () => {
  it("rejects an empty size", () => {
    expect(checkSize("", SIZES).ok).toBe(false);
  });

  it("rejects a size outside the run's options", () => {
    expect(checkSize("XXXL", SIZES).ok).toBe(false);
  });

  it("accepts a size in the options", () => {
    expect(checkSize("M", SIZES)).toEqual({ ok: true, value: "M" });
  });
});

describe("checkSubmitterName", () => {
  it("requires a non-empty name and trims it", () => {
    expect(checkSubmitterName("   ").ok).toBe(false);
    expect(checkSubmitterName("  Sam ")).toEqual({ ok: true, value: "Sam" });
  });

  it("rejects a name over the cap", () => {
    expect(
      checkSubmitterName("x".repeat(SUBMITTER_NAME_MAX_LENGTH + 1)).ok,
    ).toBe(false);
  });
});

describe("checkSubmitterEmail", () => {
  it("lowercases and trims so entries group by email", () => {
    expect(checkSubmitterEmail("  SAM@Example.com ")).toEqual({
      ok: true,
      value: "sam@example.com",
    });
  });

  it("rejects a malformed email", () => {
    expect(checkSubmitterEmail("nope").ok).toBe(false);
  });

  it("rejects an empty email", () => {
    expect(checkSubmitterEmail("").ok).toBe(false);
  });
});
