// Atomic rules for an order item (initiative 0004): one jersey on the order
// list — design, optional name / number / letter, a size or none, a qty.
// Only the two checks that differ from the legacy tables live here; number,
// letter, qty and the dedupe key are the roster / order-entry rules, reused
// rather than copied so the old and new paths can't drift during migration.

import { ROSTER_NAME_MAX_LENGTH } from "../rosterEntry/rules";
import type { CheckResult } from "../orderEntry/rules";

export const ITEM_NAME_MAX_LENGTH = ROSTER_NAME_MAX_LENGTH;

// Unlike a roster slot, an item needn't have a name: a spare jersey is an
// item with no name. Blank normalizes to `undefined` so the field is omitted.
export function checkItemName(
  raw: string | undefined,
): CheckResult<string | undefined> {
  const name = (raw ?? "").trim();
  if (name.length === 0) return { ok: true, value: undefined };
  if (name.length > ITEM_NAME_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep the name under ${ITEM_NAME_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: name };
}

// Blank means "Needs size", which is a valid item. Otherwise the size must be
// one of `allowed`, or equal the item's `current` size, so an item still
// carrying a legacy size (`XXL`) survives an unrelated edit.
export function checkItemSize(
  raw: string | undefined,
  allowed: readonly string[],
  current?: string,
): CheckResult<string | undefined> {
  const size = (raw ?? "").trim();
  if (size.length === 0) return { ok: true, value: undefined };
  if (allowed.includes(size) || (current !== undefined && size === current))
    return { ok: true, value: size };
  return { ok: false, error: "Pick a size from the list." };
}
