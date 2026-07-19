// Atomic rules for jersey-run responses. Constants, the shared
// `JerseyRunForResponse` shape, the `isJerseyRunClosed` predicate, and
// per-field check functions that return either the normalized value or
// an error message. Imported by both the form adapter (./form.ts) and
// the Convex `jerseyRuns.submitResponse` mutation so the client and
// server can't drift on length caps, email shape, or trim/normalization
// behavior.

import { effectiveStatus } from "../jerseyRun/lock";

export const RESPONDENT_NAME_MAX_LENGTH = 120;
export const EMAIL_MAX_LENGTH = 254;
export const JERSEY_NAME_MAX_LENGTH = 40;
export const JERSEY_NUMBER_MAX_LENGTH = 8;
export const ANSWER_MAX_LENGTH = 500;

// Deliberately loose — catches typos like a missing "@" or empty
// local-part. Strict RFC compliance is the mail server's job; the
// captain reads these by hand anyway.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type JerseyRunForResponse = {
  namesMode: "open" | "fixed";
  sizeOptions: string[];
  customQuestions: { id: string; label: string }[];
  fixedRoster: { name: string; number?: string }[] | undefined;
  deadline: number;
  status: "open" | "closed" | "locked";
};

// Discriminated result for a single field check. `ok: true` carries the
// normalized value (trimmed string, lowercased email, etc.); `ok: false`
// carries a user-facing error message. Callers decide how to surface it
// — the form adapter writes to a `JerseyRunResponseErrors` record; the
// Convex mutation throws a ConvexError.
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

export function checkRespondentName(raw: string): CheckResult<string> {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "Tell us your name." };
  if (name.length > RESPONDENT_NAME_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep your name under ${RESPONDENT_NAME_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: name };
}

// Normalizes to lowercase so a captain looking up a response by email
// (issue 3-08) matches regardless of how the fan typed it.
export function checkRespondentEmail(raw: string): CheckResult<string> {
  const email = raw.trim().toLowerCase();
  if (email.length === 0)
    return {
      ok: false,
      error: "We need an email so your captain can reach you.",
    };
  if (email.length > EMAIL_MAX_LENGTH)
    return { ok: false, error: "That email is too long." };
  if (!EMAIL_PATTERN.test(email))
    return { ok: false, error: "That doesn't look like an email." };
  return { ok: true, value: email };
}

export function checkSize(
  value: string,
  sizeOptions: readonly string[],
): CheckResult<string> {
  if (value.length === 0) return { ok: false, error: "Pick a size." };
  if (!sizeOptions.includes(value))
    return { ok: false, error: "Pick a size from the list." };
  return { ok: true, value };
}

// Returns `undefined` when the trimmed input is empty so the mutation
// can omit the field from the inserted document rather than persisting
// an empty string. Same convention for `checkJerseyNumber`.
export function checkJerseyName(
  raw: string | undefined,
): CheckResult<string | undefined> {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length > JERSEY_NAME_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep the jersey name under ${JERSEY_NAME_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

export function checkJerseyNumber(
  raw: string | undefined,
): CheckResult<string | undefined> {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length > JERSEY_NUMBER_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep the jersey number under ${JERSEY_NUMBER_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
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
