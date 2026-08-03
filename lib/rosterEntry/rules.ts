// Atomic rules for roster entries — the name+number "player slot" on a
// design (R-01). Constants, the `RosterSource` guard, per-field check
// functions, and a `rosterMatchKey` used to attach a fan order to an
// existing slot (R-02). Imported by both the form adapter (./form.ts)
// and the Convex `rosterEntries` mutations so client and server can't
// drift on caps or normalization.

export const ROSTER_NAME_MAX_LENGTH = 80;
export const ROSTER_NUMBER_MAX_LENGTH = 8;

export const ROSTER_SOURCES = ["captain", "fan"] as const;
export type RosterSource = (typeof ROSTER_SOURCES)[number];

// The letter a player wears (M-09) — a captain's C, an assistant captain's A.
// Optional, and most slots have neither.
//
// Stored as the letter rather than as the word, and that is deliberate:
// `source` on the same document is already valued "captain", so a designation
// valued "captain" too would let `slot.source === "captain"` and
// `slot.designation === "captain"` be swapped for each other without TypeScript
// noticing. "C" belongs to exactly one of the two fields.
export const ROSTER_DESIGNATIONS = ["C", "A"] as const;
export type RosterDesignation = (typeof ROSTER_DESIGNATIONS)[number];

// The letter in words — for the CSVs, which are read by people who never see
// this app, and for the tooltip on a badge that is otherwise one character.
export const ROSTER_DESIGNATION_LABEL: Record<RosterDesignation, string> = {
  C: "Captain",
  A: "Assistant captain",
};

// Discriminated result for a single field check. Mirrors the
// jerseyRunResponse rules so the two read the same. `ok: true` carries
// the normalized value; `ok: false` carries a user-facing message.
export type CheckResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isRosterSource(value: string): value is RosterSource {
  return (ROSTER_SOURCES as readonly string[]).includes(value);
}

export function isRosterDesignation(
  value: string,
): value is RosterDesignation {
  return (ROSTER_DESIGNATIONS as readonly string[]).includes(value);
}

// Blank is the answer for most of the roster, so it normalizes to `undefined`
// and the field is omitted — same convention as the number above. Uppercases
// first: a captain who types "c" means the C.
export function checkRosterDesignation(
  raw: string | undefined,
): CheckResult<RosterDesignation | undefined> {
  const trimmed = (raw ?? "").trim().toUpperCase();
  if (trimmed.length === 0) return { ok: true, value: undefined };
  if (!isRosterDesignation(trimmed))
    return {
      ok: false,
      error: "A player is either a captain (C), an assistant (A), or neither.",
    };
  return { ok: true, value: trimmed };
}

// A roster entry is a named player slot, so the name is required — a
// jersey with no name is a blank/bulk *order entry* with no roster entry
// at all (see lib/orderEntry), not an empty roster entry.
export function checkRosterName(raw: string): CheckResult<string> {
  const name = raw.trim();
  if (name.length === 0)
    return { ok: false, error: "Add a name for this player slot." };
  if (name.length > ROSTER_NAME_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep the name under ${ROSTER_NAME_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: name };
}

// Returns `undefined` for empty input so the mutation can omit the field
// rather than persist an empty string — same convention as jersey number
// on the legacy response model.
export function checkRosterNumber(
  raw: string | undefined,
): CheckResult<string | undefined> {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length > ROSTER_NUMBER_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep the number under ${ROSTER_NUMBER_MAX_LENGTH} characters.`,
    };
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

// Identity of a player *within* one design: case-insensitive name +
// number, both trimmed. The single normalization every dedupe rule shares
// — fan attach (R-02, via rosterMatchKey below), paste preview (M-03), and
// mirror skip (M-04) — so "already on this roster" can't come to mean
// three different things. Designation (M-09) is deliberately *not* in here:
// pinning a C on someone doesn't make them a second player.
export function rosterSlotKey(
  name: string,
  number: string | undefined,
): string {
  const normName = name.trim().toLowerCase();
  const normNumber = (number ?? "").trim().toLowerCase();
  return `${normName}::${normNumber}`;
}

// Identity of a player slot for attach-to-existing-slot matching (R-02):
// a design + the slot key above. Two fans typing "Gretzky 99" under the
// same design resolve to the same key (and so the same slot), regardless
// of casing or surrounding whitespace.
export function rosterMatchKey(
  designId: string,
  name: string,
  number: string | undefined,
): string {
  return `${designId}::${rosterSlotKey(name, number)}`;
}
