// L-01 acceptance tests for the pure order-item lib (initiative 0004):
// `checkItemName` / `checkItemSize` (lib/orderItem/rules.ts), re-exported
// from lib/orderItem/index.ts. Spec: backlog/L-01-order-items-table-and-api.md.
// The phase-1 read model `summarize` and its tests were deleted in R2-03; the
// roster read model is covered by lib/orderItem/summarizeRoster.r201.test.ts.
import { describe, expect, it } from "vitest";
import { SIZE_OPTIONS } from "./orderForm/rules";
import { checkItemName, checkItemSize } from "./orderItem";

// ── rules ──────────────────────────────────────────────────────────────────

describe("checkItemName: optional, trimmed, blank → undefined, ≤ 80", () => {
  it("trims a name", () => {
    expect(checkItemName("  Jordan Lee ")).toEqual({
      ok: true,
      value: "Jordan Lee",
    });
  });

  it("treats blank and missing as no name (a jersey with no name is allowed)", () => {
    expect(checkItemName("")).toEqual({ ok: true, value: undefined });
    expect(checkItemName("   ")).toEqual({ ok: true, value: undefined });
    expect(checkItemName(undefined)).toEqual({ ok: true, value: undefined });
  });

  it("accepts 80 characters and rejects 81 with a message", () => {
    expect(checkItemName("x".repeat(80))).toEqual({
      ok: true,
      value: "x".repeat(80),
    });
    const tooLong = checkItemName("x".repeat(81));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toMatch(/80/);
  });
});

describe("checkItemSize(value, allowed, current?): blank → none; otherwise in allowed or equal to current", () => {
  const allowed = SIZE_OPTIONS;

  it("treats blank and missing as no size (Needs size)", () => {
    expect(checkItemSize(undefined, allowed)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(checkItemSize("", allowed)).toEqual({ ok: true, value: undefined });
    expect(checkItemSize("  ", allowed)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("accepts every catalogue size", () => {
    for (const size of SIZE_OPTIONS)
      expect(checkItemSize(size, allowed)).toEqual({ ok: true, value: size });
  });

  it("rejects a size outside the catalogue", () => {
    const result = checkItemSize("XXXXL", allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("keeps a legacy size only when it is the item's current value", () => {
    expect(checkItemSize("XXL", allowed, "XXL")).toEqual({
      ok: true,
      value: "XXL",
    });
    expect(checkItemSize("XXL", allowed, "M").ok).toBe(false);
    expect(checkItemSize("XXL", allowed).ok).toBe(false);
  });

  it("checks against the list it is given (a form's narrower sizeOptions)", () => {
    expect(checkItemSize("XL", ["S", "M", "L"]).ok).toBe(false);
    expect(checkItemSize("M", ["S", "M", "L"])).toEqual({
      ok: true,
      value: "M",
    });
  });
});
