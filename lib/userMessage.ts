import { ConvexError } from "convex/values";

// The one way a customer-facing surface turns a thrown error into text
// (initiative 0004, "Must answer 6"). A `ConvexError` carrying a string is
// copy the server wrote for the customer; anything else is internal. The
// client's `err.message` wraps even a ConvexError in the function path,
// request id and stack, so it is never shown.
export function userMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === "string")
    return err.data;
  return fallback;
}
