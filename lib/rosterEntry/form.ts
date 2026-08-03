// Form adapter for seeding a single roster entry — the captain's
// name+number player slot (R-01 foundation; the seeding UI lands in
// R-03). Wraps the atomic rules in ./rules into a field-keyed errors
// record plus a payload shaper. The Convex `rosterEntries.create`
// mutation imports the same rules directly so the two can't drift.

import {
  checkRosterDesignation,
  checkRosterName,
  checkRosterNumber,
  type RosterDesignation,
  type RosterSource,
} from "./rules";

export type RosterEntryInput = {
  name: string;
  number: string;
  // The letter, as the control holds it: "" for the players who wear none,
  // which is most of them (M-09).
  designation?: string;
};

export type RosterEntryErrors = {
  name?: string;
  number?: string;
  designation?: string;
};

export type RosterEntryPayload = {
  name: string;
  number: string | undefined;
  designation: RosterDesignation | undefined;
};

export const EMPTY_ROSTER_ENTRY: RosterEntryInput = {
  name: "",
  number: "",
  designation: "",
};

export function validateRosterEntry(
  input: RosterEntryInput,
): RosterEntryErrors {
  const errors: RosterEntryErrors = {};

  const nameCheck = checkRosterName(input.name);
  if (!nameCheck.ok) errors.name = nameCheck.error;

  const numberCheck = checkRosterNumber(input.number);
  if (!numberCheck.ok) errors.number = numberCheck.error;

  const designationCheck = checkRosterDesignation(input.designation);
  if (!designationCheck.ok) errors.designation = designationCheck.error;

  return errors;
}

// Shapes a validated input into the persisted document fields. Throws on
// an invalid name so a caller that skipped validateRosterEntry fails loud
// rather than writing a blank slot — number is genuinely optional and
// normalizes to undefined when blank.
export function toRosterEntryPayload(
  input: RosterEntryInput,
): RosterEntryPayload {
  const nameCheck = checkRosterName(input.name);
  if (!nameCheck.ok) throw new Error(nameCheck.error);
  const numberCheck = checkRosterNumber(input.number);
  if (!numberCheck.ok) throw new Error(numberCheck.error);
  const designationCheck = checkRosterDesignation(input.designation);
  if (!designationCheck.ok) throw new Error(designationCheck.error);
  return {
    name: nameCheck.value,
    number: numberCheck.value,
    designation: designationCheck.value,
  };
}

export type { RosterDesignation, RosterSource };
