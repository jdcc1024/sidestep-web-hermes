import { describe, expect, it } from "vitest";
import {
  ANSWER_MAX_LENGTH,
  checkCustomAnswer,
  isJerseyRunClosed,
  type JerseyRunForResponse,
} from "./jerseyRunResponse";

const NOW = Date.parse("2026-05-22T12:00:00.000Z");

function openRun(
  overrides: Partial<JerseyRunForResponse> = {},
): JerseyRunForResponse {
  return {
    namesMode: "open",
    sizeOptions: ["S", "M", "L"],
    customQuestions: [],
    deadline: Date.parse("2026-06-15T23:59:59.999Z"),
    status: "open",
    ...overrides,
  };
}

describe("isJerseyRunClosed", () => {
  it("is open when status is open and deadline is in the future", () => {
    expect(isJerseyRunClosed(openRun(), NOW)).toBe(false);
  });

  it("is closed when status is closed", () => {
    expect(isJerseyRunClosed(openRun({ status: "closed" }), NOW)).toBe(true);
  });

  it("is closed when status is locked", () => {
    expect(isJerseyRunClosed(openRun({ status: "locked" }), NOW)).toBe(true);
  });

  it("is closed when the deadline has passed (lazy auto-lock)", () => {
    const past = Date.parse("2026-05-01T23:59:59.999Z");
    expect(isJerseyRunClosed(openRun({ deadline: past }), NOW)).toBe(true);
  });

  it("treats a deadline equal to now as still open (boundary)", () => {
    expect(isJerseyRunClosed(openRun({ deadline: NOW }), NOW)).toBe(false);
  });
});

describe("checkCustomAnswer", () => {
  it("trims and accepts an answer within the cap", () => {
    expect(checkCustomAnswer("  pickup  ")).toEqual({
      ok: true,
      value: "pickup",
    });
  });

  it("accepts an empty answer (trimmed to empty)", () => {
    expect(checkCustomAnswer("   ")).toEqual({ ok: true, value: "" });
  });

  it("rejects an answer over the cap", () => {
    const result = checkCustomAnswer("x".repeat(ANSWER_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
  });
});
