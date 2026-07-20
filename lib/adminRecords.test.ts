import { describe, expect, it } from "vitest";
import {
  MAX_ORDER_QUANTITY,
  MIN_ORDER_QUANTITY,
  NEW_CUSTOMER_WINDOW_MS,
  inviteUrl,
  isNewCustomer,
  validateEmail,
  validateOptionalText,
  validateQuantity,
  validateRequiredText,
} from "./adminRecords";

const NOW = 1_800_000_000_000;

describe("isNewCustomer", () => {
  it("should be true when the user registered inside the 7-day window", () => {
    expect(isNewCustomer(NOW - 24 * 60 * 60 * 1000, NOW)).toBe(true);
  });

  it("should be false when the user registered before the window", () => {
    expect(isNewCustomer(NOW - NEW_CUSTOMER_WINDOW_MS - 1, NOW)).toBe(false);
  });

  it("should be true exactly on the window boundary", () => {
    expect(isNewCustomer(NOW - NEW_CUSTOMER_WINDOW_MS, NOW)).toBe(true);
  });
});

describe("validateRequiredText", () => {
  it("should reject blank and whitespace-only values", () => {
    expect(validateRequiredText("", "Team name")).toBe("Team name is required.");
    expect(validateRequiredText("   ", "Team name")).toBe(
      "Team name is required.",
    );
  });

  it("should reject values longer than the cap", () => {
    expect(validateRequiredText("x".repeat(201), "Sport")).toMatch(/200/);
  });

  it("should accept a normal value", () => {
    expect(validateRequiredText("  Soccer  ", "Sport")).toBeNull();
  });
});

describe("validateOptionalText", () => {
  it("should accept an empty value", () => {
    expect(validateOptionalText("", "Brief", 1000)).toBeNull();
  });

  it("should reject a value over the cap", () => {
    expect(validateOptionalText("x".repeat(1001), "Brief", 1000)).toMatch(
      /1000/,
    );
  });
});

describe("validateEmail", () => {
  it("should reject an empty or malformed address", () => {
    expect(validateEmail("")).toBe("Email is required.");
    expect(validateEmail("not-an-email")).toBe("Enter a valid email address.");
  });

  it("should accept a well-formed address", () => {
    expect(validateEmail(" captain@example.com ")).toBeNull();
  });
});

describe("validateQuantity", () => {
  it("should reject non-numeric and fractional values", () => {
    expect(validateQuantity("abc")).toMatch(/whole number/);
    expect(validateQuantity("12.5")).toMatch(/whole number/);
  });

  it("should enforce the min and max bounds", () => {
    expect(validateQuantity(MIN_ORDER_QUANTITY - 1)).toMatch(/at least/);
    expect(validateQuantity(MAX_ORDER_QUANTITY + 1)).toMatch(/or fewer/);
  });

  it("should accept an in-range whole number from a string or a number", () => {
    expect(validateQuantity("24")).toBeNull();
    expect(validateQuantity(24)).toBeNull();
  });
});

describe("inviteUrl", () => {
  it("should build the /invite link from the intake id", () => {
    expect(inviteUrl("https://sidestep.test", "abc123")).toBe(
      "https://sidestep.test/invite?token=abc123",
    );
  });

  it("should not double the slash when the origin has a trailing one", () => {
    expect(inviteUrl("https://sidestep.test/", "abc123")).toBe(
      "https://sidestep.test/invite?token=abc123",
    );
  });
});
