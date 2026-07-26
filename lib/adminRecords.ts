// Rules shared by the admin record-editing surfaces (issue 2-13) and the
// Convex mutations behind them. The inline-edit fields validate as you type
// and the mutations re-validate on the server — same function both sides, so
// the two can't drift and a hand-rolled client can't write junk.

// How recently a user must have registered to earn the "New" badge on the
// admin customer list.
export const NEW_CUSTOMER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Matches the caps in lib/intake.ts — short text fields are short everywhere.
export const MAX_SHORT_FIELD = 200;
export const MIN_ORDER_QUANTITY = 5;
export const MAX_ORDER_QUANTITY = 10000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNewCustomer(createdAt: number, now: number): boolean {
  return createdAt >= now - NEW_CUSTOMER_WINDOW_MS;
}

// Returns an error message, or null when the value is acceptable. Callers
// trim before storing — `validateRequiredText` reports on the trimmed form.
export function validateRequiredText(
  value: string,
  label: string,
  max = MAX_SHORT_FIELD,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${label} is required.`;
  if (trimmed.length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

export function validateOptionalText(
  value: string,
  label: string,
  max = MAX_SHORT_FIELD,
): string | null {
  const trimmed = value.trim();
  if (trimmed.length > max)
    return `${label} must be ${max} characters or fewer.`;
  return null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Email is required.";
  if (!EMAIL_PATTERN.test(trimmed)) return "Enter a valid email address.";
  return null;
}

export function validateQuantity(value: string | number): string | null {
  const n = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(n) || !Number.isInteger(n))
    return "Quantity must be a whole number.";
  if (n < MIN_ORDER_QUANTITY)
    return `Quantity must be at least ${MIN_ORDER_QUANTITY}.`;
  if (n > MAX_ORDER_QUANTITY)
    return `Quantity must be ${MAX_ORDER_QUANTITY} or fewer.`;
  return null;
}

// The portal invite link handed to a lead who submitted the public intake
// form. `/invite?token=<intakeId>` is the route 1-03 built; the token is the
// intake's own id, so no separate token table is needed.
export function inviteUrl(origin: string, intakeId: string): string {
  return `${origin.replace(/\/+$/, "")}/invite?token=${encodeURIComponent(intakeId)}`;
}
