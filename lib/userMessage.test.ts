// L-01 acceptance tests for `userMessage(err, fallback)` (lib/userMessage.ts):
// the one way a customer-facing surface turns a thrown error into text.
// Spec: backlog/L-01 "userMessage returns the ConvexError string data; returns
// the fallback for a plain Error whose message contains [CONVEX, Request ID or
// ConvexError" (UX §8.10), architecture 0004 "Must answer 6".
import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { userMessage } from "./userMessage";

const FALLBACK = "Something went wrong. Try again.";

// What the browser client actually throws for a server-side ConvexError in
// dev: the message carries the function path, request id and stack.
const RAW =
  "[CONVEX M(orderItems:remove)] [Request ID: 4f2a9c1e] Server Error Uncaught ConvexError: This order is locked for production. at handler (../convex/orderItems.ts:231:11)";

describe("userMessage returns the ConvexError string data; returns the fallback for a plain Error whose message contains [CONVEX, Request ID or ConvexError (§8.10)", () => {
  it("returns the string data of a ConvexError", () => {
    expect(
      userMessage(
        new ConvexError("This order is locked for production."),
        FALLBACK,
      ),
    ).toBe("This order is locked for production.");
  });

  it("returns the fallback for a plain Error carrying the raw Convex text", () => {
    expect(userMessage(new Error(RAW), FALLBACK)).toBe(FALLBACK);
  });

  for (const marker of ["[CONVEX Q(orders:get)]", "[Request ID: abc123]", "Uncaught ConvexError: nope"]) {
    it(`returns the fallback when the message contains ${JSON.stringify(marker)}`, () => {
      const out = userMessage(new Error(`boom ${marker} boom`), FALLBACK);
      expect(out).toBe(FALLBACK);
      expect(out).not.toMatch(/CONVEX|ConvexError|Request ID/);
    });
  }

  it("never returns err.message, even for an innocent-looking Error", () => {
    expect(userMessage(new Error("Network down"), FALLBACK)).toBe(FALLBACK);
  });

  it("returns the fallback for a ConvexError whose data is not a string", () => {
    expect(
      userMessage(new ConvexError({ code: "LOCKED" }), FALLBACK),
    ).toBe(FALLBACK);
  });

  it("returns the fallback for non-Error throwables", () => {
    expect(userMessage("raw string", FALLBACK)).toBe(FALLBACK);
    expect(userMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(userMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(userMessage({ message: RAW }, FALLBACK)).toBe(FALLBACK);
  });
});
