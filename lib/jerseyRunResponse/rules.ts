// Shared jersey-run submission primitives. Since R-07 retired the flat
// `jerseyRunResponses` table, the fan submission path is the unified
// order-entry model (convex/orderEntries.ts). What survives here is the
// grain both the public form and that mutation still share: the
// `isJerseyRunClosed` gate (a run stops accepting submissions once it's
// closed/locked) and the custom-answer length rule. Kept in one module so
// the client form and the Convex mutation can't drift on that behavior.

import { effectiveStatus } from "../jerseyRun/lock";

export const ANSWER_MAX_LENGTH = 500;

// The run fields the submission gate reads. `status` + `deadline` are what
// `isJerseyRunClosed` inspects; the rest describe the form the fan fills in.
export type JerseyRunForResponse = {
  namesMode: "open" | "fixed";
  sizeOptions: string[];
  customQuestions: { id: string; label: string }[];
  deadline: number;
  status: "open" | "closed" | "locked";
};

// Discriminated result for a single field check. `ok: true` carries the
// normalized value (trimmed string, etc.); `ok: false` carries a
// user-facing error message.
export type CheckResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isJerseyRunClosed(
  run: Pick<JerseyRunForResponse, "status" | "deadline">,
  now: number = Date.now(),
): boolean {
  // A locked run (manually, or lazily once its deadline passes — R-06)
  // is also closed to new submissions: it's the confirmed production
  // basis.
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
