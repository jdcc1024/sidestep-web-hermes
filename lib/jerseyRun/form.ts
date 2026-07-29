// Form adapter for the jersey-run settings form (/run/setup). Wraps the
// atomic rules in ./rules into a JerseyRunErrors record keyed by form field,
// plus a toJerseyRunPayload helper that converts validated input into the
// shape the Convex mutation accepts. The Convex side imports the same rules
// directly — see convex/jerseyRuns.ts.
//
// Two fields, since M-05: sizes are a fixed catalog the captain is never
// asked about, and names mode moved to the order page (jerseyRuns.
// setNamesMode) where the designs it affects are visible.

import {
  MAX_CUSTOM_QUESTIONS,
  QUESTION_LABEL_MAX_LENGTH,
  type CustomQuestion,
  parseDeadline,
} from "./rules";

export type JerseyRunInput = {
  customQuestions: CustomQuestion[];
  // Kept as a string in form state so the empty state is valid; coerced
  // to a timestamp at payload time.
  deadline: string;
};

export type JerseyRunErrors = {
  customQuestions?: string;
  deadline?: string;
};

export type JerseyRunPayload = {
  customQuestions: CustomQuestion[];
  deadline: number;
};

export const EMPTY_JERSEY_RUN: JerseyRunInput = {
  customQuestions: [],
  deadline: "",
};

export function validateJerseyRun(
  input: JerseyRunInput,
  now: number = Date.now(),
): JerseyRunErrors {
  const errors: JerseyRunErrors = {};

  if (input.customQuestions.length > MAX_CUSTOM_QUESTIONS)
    errors.customQuestions = `Up to ${MAX_CUSTOM_QUESTIONS} custom questions.`;
  else if (
    input.customQuestions.some((q) => q.label.trim().length === 0)
  )
    errors.customQuestions = "Every question needs a label.";
  else if (
    input.customQuestions.some(
      (q) => q.label.trim().length > QUESTION_LABEL_MAX_LENGTH,
    )
  )
    errors.customQuestions = `Keep each question under ${QUESTION_LABEL_MAX_LENGTH} characters.`;

  const deadline = parseDeadline(input.deadline);
  if (deadline === null) errors.deadline = "Pick a deadline date.";
  else if (deadline < now) errors.deadline = "Deadline must be in the future.";

  return errors;
}

// Convert validated form state into the payload the Convex mutation
// expects. Throws if the input was never run through validateJerseyRun
// — callers should gate on an empty error object first.
export function toJerseyRunPayload(input: JerseyRunInput): JerseyRunPayload {
  const deadline = parseDeadline(input.deadline);
  if (deadline === null) throw new Error("Invalid deadline");

  const customQuestions = input.customQuestions
    .map((q) => ({ id: q.id, label: q.label.trim() }))
    .filter((q) => q.label.length > 0);

  return { customQuestions, deadline };
}
