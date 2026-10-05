// Shared jersey-run submission primitives. Since R-07 retired the flat
// `orderFormResponses` table, the fan submission path is the unified
// order-entry model (convex/orderEntries.ts). What survives here is the
// grain both the public form and that mutation still share: the
// `isOrderFormClosed` gate (a run stops accepting submissions once it's
// closed) and the custom-answer length rule. Kept in one module so
// the client form and the Convex mutation can't drift on that behavior.

import { effectiveStatus } from "../orderForm/lock";

export const ANSWER_MAX_LENGTH = 500;

// The run fields the submission gate reads. `status` + `deadline` are what
// `isOrderFormClosed` inspects; the rest describe the form the fan fills in.
export type OrderFormForResponse = {
  namesMode: "open" | "fixed";
  sizeOptions: string[];
  customQuestions: { id: string; label: string }[];
  deadline: number;
  status: "open" | "closed";
};

// Discriminated result for a single field check. `ok: true` carries the
// normalized value (trimmed string, etc.); `ok: false` carries a
// user-facing error message.
export type CheckResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isOrderFormClosed(
  run: Pick<OrderFormForResponse, "status" | "deadline">,
  now: number = Date.now(),
): boolean {
  // Closed by status, or lazily once its deadline passes. Whether the list
  // behind it is confirmed is a separate check the server makes (L-06).
  return effectiveStatus(run, now) !== "open";
}

export function checkCustomAnswer(raw: string): CheckResult<string> {
  const trimmed = raw.trim();
  if (trimmed.length > ANSWER_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep each answer under ${ANSWER_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: trimmed };
}
