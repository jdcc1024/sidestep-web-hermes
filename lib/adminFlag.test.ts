import { describe, expect, it } from "vitest";
import { isAdminFromClerk } from "./adminFlag";

describe("isAdminFromClerk", () => {
  it("should grant admin when private metadata has isAdmin: true", () => {
    expect(isAdminFromClerk({ isAdmin: true })).toBe(true);
  });

  it("should deny admin when the key is spelled snake_case", () => {
    expect(isAdminFromClerk({ is_admin: true })).toBe(false);
  });

  it("should deny admin when the flag is the string \"true\"", () => {
    expect(isAdminFromClerk({ isAdmin: "true" })).toBe(false);
  });

  it("should deny admin when isAdmin is false", () => {
    expect(isAdminFromClerk({ isAdmin: false })).toBe(false);
  });

  it("should deny admin when the metadata is missing or not an object", () => {
    expect(isAdminFromClerk(undefined)).toBe(false);
    expect(isAdminFromClerk(null)).toBe(false);
    expect(isAdminFromClerk({})).toBe(false);
    expect(isAdminFromClerk("isAdmin")).toBe(false);
    expect(isAdminFromClerk(true)).toBe(false);
  });

  it("should deny admin when handed a whole user whose flag is only in public metadata", () => {
    // Callers pass the private metadata object, never the user — so a
    // publicMetadata flag must not be reachable from here.
    expect(
      isAdminFromClerk({ publicMetadata: { isAdmin: true } }),
    ).toBe(false);
    expect(
      isAdminFromClerk({ public_metadata: { isAdmin: true } }),
    ).toBe(false);
  });
});
