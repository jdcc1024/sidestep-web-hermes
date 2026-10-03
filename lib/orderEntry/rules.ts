// Atomic rules for order entries — one jersey to produce (R-01):
// `{size, qty, submitter, source}`, optionally tied to a roster slot.
// Owns the order-entry's own stored fields (size, qty, submitter); the
// player-slot fields (name, number) live in lib/rosterEntry, and a
// multi-line fan submission (R-02) composes the two. Imported by both
// the public order form and the Convex `submitOrder` / order-item mutations.

export const SUBMITTER_NAME_MAX_LENGTH = 120;
export const EMAIL_MAX_LENGTH = 254;

// One order entry is one line on a production sheet; a bulk/blank line
// can ask for several of a size, but a single line asking for hundreds
// is almost certainly a typo. Generous cap, not a business limit.
export const MAX_QTY = 500;

export const ORDER_SOURCES = ["captain", "fan"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

// Deliberately loose — same pattern the legacy response model used.
// Strict RFC compliance is the mail server's job; the captain reads
// these by hand anyway.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CheckResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isOrderSource(value: string): value is OrderSource {
  return (ORDER_SOURCES as readonly string[]).includes(value);
}

// Qty drives the production total (Σ qty, R-04), so it must be a whole
// number ≥ 1 — a fractional or zero jersey is meaningless. Accepts a
// number (the form parses the string input before calling this).
export function checkQty(raw: number): CheckResult<number> {
  if (!Number.isFinite(raw) || !Number.isInteger(raw))
    return { ok: false, error: "Quantity must be a whole number." };
  if (raw < 1) return { ok: false, error: "Order at least one." };
  if (raw > MAX_QTY)
    return { ok: false, error: `Order at most ${MAX_QTY} on one line.` };
  return { ok: true, value: raw };
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

export function checkSubmitterName(raw: string): CheckResult<string> {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "Tell us your name." };
  if (name.length > SUBMITTER_NAME_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep your name under ${SUBMITTER_NAME_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: name };
}

// Normalizes to lowercase so a submitter's entries group together by
// email (R-02 submission grouping) regardless of how they typed it.
export function checkSubmitterEmail(raw: string): CheckResult<string> {
  const email = raw.trim().toLowerCase();
  if (email.length === 0)
    return { ok: false, error: "We need an email to group your order." };
  if (email.length > EMAIL_MAX_LENGTH)
    return { ok: false, error: "That email is too long." };
  if (!EMAIL_PATTERN.test(email))
    return { ok: false, error: "That doesn't look like an email." };
  return { ok: true, value: email };
}
