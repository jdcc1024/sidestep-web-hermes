// Atomic rules for jersey-run setup. Constants, type guards, and pure
// helpers that both the form adapter (./form.ts) and the Convex
// `jerseyRuns.create` mutation import from. Single source of truth so
// the client and server can't drift on size catalogs or roster caps.

export const SIZE_OPTIONS = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
] as const;
export type SizeOption = (typeof SIZE_OPTIONS)[number];

// Sort a list of sizes (from a jersey run) into canonical display order.
// Legacy "XXL" runs created before the XXL → 2XL rename are slotted
// where 2XL would appear so they still render in the right spot.
const SIZE_DISPLAY_INDEX: Record<string, number> = {
  XS: 0,
  S: 1,
  M: 2,
  L: 3,
  XL: 4,
  "2XL": 5,
  XXL: 5,
  "3XL": 6,
  "4XL": 7,
};

export function sortSizes(sizes: readonly string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_DISPLAY_INDEX[a] ?? Number.POSITIVE_INFINITY;
    const ib = SIZE_DISPLAY_INDEX[b] ?? Number.POSITIVE_INFINITY;
    return ia - ib;
  });
}

export const NAMES_MODES = ["open", "fixed"] as const;
export type NamesMode = (typeof NAMES_MODES)[number];

export const MAX_CUSTOM_QUESTIONS = 5;
export const QUESTION_LABEL_MAX_LENGTH = 200;

export type CustomQuestion = { id: string; label: string };

export function isSizeOption(value: string): value is SizeOption {
  return (SIZE_OPTIONS as readonly string[]).includes(value);
}

export function isNamesMode(value: string): value is NamesMode {
  return (NAMES_MODES as readonly string[]).includes(value);
}

// Parse a date input (YYYY-MM-DD) into a UTC end-of-day timestamp.
// Returns null for empty or invalid input so the caller can decide what
// to do (validation produces a user-facing error; payload throws).
export function parseDeadline(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Date.parse on a bare YYYY-MM-DD treats it as UTC midnight. Push to
  // end of day so a run with deadline = today stays open all day.
  const ms = Date.parse(`${trimmed}T23:59:59.999Z`);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

// Generate a unique id for a new custom question. Uses crypto.randomUUID
// where available (modern browsers and Node 19+); falls back to a
// timestamp+random combo in older environments and JSDOM.
export function newQuestionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
