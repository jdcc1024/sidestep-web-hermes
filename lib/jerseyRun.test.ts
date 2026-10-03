import { describe, expect, it } from "vitest";
import {
  EMPTY_JERSEY_RUN,
  MAX_CUSTOM_QUESTIONS,
  QUESTION_LABEL_MAX_LENGTH,
  SIZE_OPTIONS,
  effectiveStatus,
  isNamesMode,
  isSizeOption,
  newQuestionId,
  parseDeadline,
  toJerseyRunPayload,
  validateJerseyRun,
  type FormRun,
  type JerseyRunInput,
} from "./jerseyRun";

// Fixed "now" so deadline tests aren't flaky around midnight rollover.
const NOW = Date.parse("2026-05-22T12:00:00.000Z");
const FUTURE_DATE = "2026-06-15";
const PAST_DATE = "2026-05-01";

function validInput(overrides: Partial<JerseyRunInput> = {}): JerseyRunInput {
  return {
    customQuestions: [],
    deadline: FUTURE_DATE,
    ...overrides,
  };
}

describe("validateJerseyRun — happy path", () => {
  it("accepts a minimal run", () => {
    expect(validateJerseyRun(validInput(), NOW)).toEqual({});
  });

  it("accepts up to MAX_CUSTOM_QUESTIONS questions", () => {
    const customQuestions = Array.from(
      { length: MAX_CUSTOM_QUESTIONS },
      (_, i) => ({ id: `q${i}`, label: `Question ${i}` }),
    );
    expect(
      validateJerseyRun(validInput({ customQuestions }), NOW).customQuestions,
    ).toBeUndefined();
  });
});

describe("validateJerseyRun — required fields", () => {
  it("flags the deadline when the form is empty", () => {
    const errors = validateJerseyRun(EMPTY_JERSEY_RUN, NOW);
    expect(errors.deadline).toBeTruthy();
  });

  // M-05: sizes are a fixed catalog and names mode lives on the order page,
  // so neither is a field this form can get wrong any more.
  it("no longer asks about sizes or names mode", () => {
    expect(EMPTY_JERSEY_RUN).toEqual({ customQuestions: [], deadline: "" });
    expect(Object.keys(validateJerseyRun(EMPTY_JERSEY_RUN, NOW))).toEqual([
      "deadline",
    ]);
  });
});

describe("validateJerseyRun — custom questions", () => {
  it("rejects more than MAX_CUSTOM_QUESTIONS questions", () => {
    const customQuestions = Array.from(
      { length: MAX_CUSTOM_QUESTIONS + 1 },
      (_, i) => ({ id: `q${i}`, label: `Q${i}` }),
    );
    expect(
      validateJerseyRun(validInput({ customQuestions }), NOW).customQuestions,
    ).toBeTruthy();
  });

  it("rejects a question with a blank label", () => {
    expect(
      validateJerseyRun(
        validInput({ customQuestions: [{ id: "q1", label: "   " }] }),
        NOW,
      ).customQuestions,
    ).toBeTruthy();
  });

  it("rejects a question label over the cap", () => {
    expect(
      validateJerseyRun(
        validInput({
          customQuestions: [
            { id: "q1", label: "x".repeat(QUESTION_LABEL_MAX_LENGTH + 1) },
          ],
        }),
        NOW,
      ).customQuestions,
    ).toBeTruthy();
  });
});

describe("validateJerseyRun — deadline", () => {
  it("rejects an empty deadline", () => {
    expect(
      validateJerseyRun(validInput({ deadline: "" }), NOW).deadline,
    ).toBeTruthy();
  });

  it("rejects a deadline in the past", () => {
    expect(
      validateJerseyRun(validInput({ deadline: PAST_DATE }), NOW).deadline,
    ).toBeTruthy();
  });

  it("rejects garbled date input", () => {
    expect(
      validateJerseyRun(validInput({ deadline: "not-a-date" }), NOW).deadline,
    ).toBeTruthy();
  });

  it("accepts today as a deadline (end-of-day cutoff)", () => {
    const noonToday = Date.parse("2026-05-22T12:00:00.000Z");
    expect(
      validateJerseyRun(validInput({ deadline: "2026-05-22" }), noonToday)
        .deadline,
    ).toBeUndefined();
  });
});

describe("isSizeOption / isNamesMode", () => {
  it("isSizeOption accepts every member of SIZE_OPTIONS", () => {
    for (const value of SIZE_OPTIONS) expect(isSizeOption(value)).toBe(true);
  });

  it("isSizeOption rejects anything else", () => {
    expect(isSizeOption("")).toBe(false);
    expect(isSizeOption("XXXL")).toBe(false);
  });

  it("isNamesMode accepts open and fixed", () => {
    expect(isNamesMode("open")).toBe(true);
    expect(isNamesMode("fixed")).toBe(true);
  });

  it("isNamesMode rejects anything else", () => {
    expect(isNamesMode("")).toBe(false);
    expect(isNamesMode("hybrid")).toBe(false);
  });
});

describe("parseDeadline", () => {
  it("returns null for empty input", () => {
    expect(parseDeadline("")).toBeNull();
    expect(parseDeadline("   ")).toBeNull();
  });

  it("returns null for garbled input", () => {
    expect(parseDeadline("not-a-date")).toBeNull();
  });

  it("returns end-of-day UTC for a valid date", () => {
    const ms = parseDeadline("2026-06-15");
    expect(ms).toBe(Date.parse("2026-06-15T23:59:59.999Z"));
  });
});

describe("toJerseyRunPayload", () => {
  it("returns the cleaned payload for a run with custom questions", () => {
    const payload = toJerseyRunPayload(
      validInput({
        customQuestions: [
          { id: "q1", label: "  Delivery method?  " },
          { id: "q2", label: "Allergies?" },
        ],
        deadline: FUTURE_DATE,
      }),
    );
    expect(payload.customQuestions).toEqual([
      { id: "q1", label: "Delivery method?" },
      { id: "q2", label: "Allergies?" },
    ]);
    expect(payload.deadline).toBe(Date.parse(`${FUTURE_DATE}T23:59:59.999Z`));
  });

  it("drops custom questions with blank labels", () => {
    const payload = toJerseyRunPayload(
      validInput({
        customQuestions: [
          { id: "q1", label: "Real question" },
          { id: "q2", label: "   " },
        ],
      }),
    );
    expect(payload.customQuestions).toEqual([
      { id: "q1", label: "Real question" },
    ]);
  });

  it("carries no sizes or names mode — neither is form state any more", () => {
    const payload = toJerseyRunPayload(validInput());
    expect(payload).not.toHaveProperty("sizeOptions");
    expect(payload).not.toHaveProperty("namesMode");
  });

  it("throws for an invalid deadline (caller should have validated)", () => {
    expect(() =>
      toJerseyRunPayload(validInput({ deadline: "" })),
    ).toThrow();
  });
});

describe("newQuestionId", () => {
  it("returns unique values across calls", () => {
    const ids = new Set([
      newQuestionId(),
      newQuestionId(),
      newQuestionId(),
      newQuestionId(),
      newQuestionId(),
    ]);
    expect(ids.size).toBe(5);
  });
});

// The order form's lazy-status resolver. Since L-06 the deadline only closes
// the form; nothing here locks (lib/orderItem/lock owns the list lock).
describe("effectiveStatus (L-06: the deadline closes the form)", () => {
  const FUTURE = Date.parse("2026-06-15T23:59:59.999Z");
  const PAST = Date.parse("2026-05-01T23:59:59.999Z");

  function run(overrides: Partial<FormRun> = {}): FormRun {
    return { status: "open", deadline: FUTURE, ...overrides };
  }

  it("stays open before the deadline", () => {
    expect(effectiveStatus(run(), NOW)).toBe("open");
  });

  it("closes lazily once the deadline passes, with no manual action", () => {
    expect(effectiveStatus(run({ deadline: PAST }), NOW)).toBe("closed");
  });

  it("treats a deadline equal to now as still open (boundary)", () => {
    expect(effectiveStatus(run({ deadline: NOW }), NOW)).toBe("open");
  });

  it("leaves a closed run closed, deadline passed or not", () => {
    expect(effectiveStatus(run({ status: "closed", deadline: PAST }), NOW)).toBe(
      "closed",
    );
    expect(
      effectiveStatus(run({ status: "closed", deadline: FUTURE }), NOW),
    ).toBe("closed");
  });
});
