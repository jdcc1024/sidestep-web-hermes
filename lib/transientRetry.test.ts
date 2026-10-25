import { describe, expect, it, vi } from "vitest";
import { isTransientFetchError, withTransientRetry } from "./transientRetry";

// What Clerk throws when fetch drops: no status, transport message in errors[0].
const transport = (message = "fetch failed") =>
  Object.assign(new Error(""), {
    status: undefined,
    errors: [{ code: "unexpected_error", message }],
  });
const http = (status: number) =>
  Object.assign(new Error("http"), {
    status,
    errors: [{ code: "x", message: "nope" }],
  });

describe("withTransientRetry", () => {
  it("should return the value after exactly 2 calls when one transport failure is followed by success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transport())
      .mockResolvedValueOnce("user");
    await expect(withTransientRetry(fn)).resolves.toBe("user");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should return the value after 1 call when nothing fails", async () => {
    const fn = vi.fn().mockResolvedValue("user");
    await expect(withTransientRetry(fn)).resolves.toBe("user");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([401, 404, 429, 500])(
    "should rethrow an HTTP %i error after 1 call, never retried",
    async (status) => {
      const err = http(status);
      const fn = vi.fn().mockRejectedValue(err);
      await expect(withTransientRetry(fn)).rejects.toBe(err);
      expect(fn).toHaveBeenCalledTimes(1);
    },
  );

  it("should throw the second error after 2 calls when both calls fail at the transport level", async () => {
    const first = transport("fetch failed");
    const second = transport("ECONNRESET");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(second);
    await expect(withTransientRetry(fn)).rejects.toBe(second);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should rethrow an unrelated error after 1 call", async () => {
    const err = new Error("boom");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withTransientRetry(fn)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientFetchError", () => {
  it.each([
    "fetch failed",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "socket hang up",
    "FETCH FAILED",
  ])("should be true for a statusless error carrying %s", (m) => {
    expect(isTransientFetchError(transport(m))).toBe(true);
    expect(isTransientFetchError(new Error(m))).toBe(true);
  });

  it("should be false when an HTTP status is present, even with a transport message", () => {
    expect(
      isTransientFetchError(
        Object.assign(new Error("fetch failed"), { status: 500 }),
      ),
    ).toBe(false);
  });

  it("should be false for non-objects and unrelated errors", () => {
    for (const v of [null, undefined, "fetch failed", 42, new Error("other"), {}]) {
      expect(isTransientFetchError(v)).toBe(false);
    }
  });
});
