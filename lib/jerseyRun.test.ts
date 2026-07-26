import { describe, expect, it } from "vitest";
import {
  EMPTY_JERSEY_RUN,
  MAX_CUSTOM_QUESTIONS,
  QUESTION_LABEL_MAX_LENGTH,
  SIZE_OPTIONS,
  canLock,
  canUnlock,
  effectiveStatus,
  isNamesMode,
  isSizeOption,
  isLocked,
  newQuestionId,
  parseDeadline,
  statusAfterUnlock,
  toJerseyRunPayload,
  validateJerseyRun,
  type JerseyRunInput,
  type LockableRun,
} from "./jerseyRun";

// Fixed "now" so deadline tests aren't flaky around midnight rollover.
const NOW = Date.parse("2026-05-22T12:00:00.000Z");
const FUTURE_DATE = "2026-06-15";
const PAST_DATE = "2026-05-01";

function validInput(overrides: Partial<JerseyRunInput> = {}): JerseyRunInput {
  return {
    sizeOptions: ["S", "M", "L"],
    namesMode: "open",
    customQuestions: [],
    deadline: FUTURE_DATE,
    ...overrides,
  };
}

describe("validateJerseyRun — happy path", () => {
  it("accepts a minimal open-mode run", () => {
    expect(validateJerseyRun(validInput(), NOW)).toEqual({});
  });

  it("accepts a fixed-mode run (named slots are seeded via the roster manager)", () => {
    expect(
      validateJerseyRun(validInput({ namesMode: "fixed" }), NOW),
    ).toEqual({});
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
  it("flags every required field when the form is empty", () => {
    const errors = validateJerseyRun(EMPTY_JERSEY_RUN, NOW);
    expect(errors.sizeOptions).toBeTruthy();
    expect(errors.namesMode).toBeTruthy();
    expect(errors.deadline).toBeTruthy();
  });

  it("rejects an empty size selection", () => {
    expect(
      validateJerseyRun(validInput({ sizeOptions: [] }), NOW).sizeOptions,
    ).toBeTruthy();
  });

  it("ignores unknown sizes when checking the selection", () => {
    // "XXXL" isn't a valid option — should be treated as if not picked.
    expect(
      validateJerseyRun(validInput({ sizeOptions: ["XXXL"] }), NOW).sizeOptions,
    ).toBeTruthy();
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

describe("toJerseyRunPayload — open mode", () => {
  it("returns the cleaned payload for an open-mode run with custom questions", () => {
    const payload = toJerseyRunPayload(
      validInput({
        sizeOptions: ["S", "M", "L", "XL"],
        namesMode: "open",
        customQuestions: [
          { id: "q1", label: "  Delivery method?  " },
          { id: "q2", label: "Allergies?" },
        ],
        deadline: FUTURE_DATE,
      }),
    );
    expect(payload.namesMode).toBe("open");
    expect(payload.sizeOptions).toEqual(["S", "M", "L", "XL"]);
    expect(payload.customQuestions).toEqual([
      { id: "q1", label: "Delivery method?" },
      { id: "q2", label: "Allergies?" },
    ]);
    expect(payload.deadline).toBe(Date.parse(`${FUTURE_DATE}T23:59:59.999Z`));
  });

  it("drops unknown sizes from the selection", () => {
    const payload = toJerseyRunPayload(
      validInput({ sizeOptions: ["S", "XXXL", "M"] }),
    );
    expect(payload.sizeOptions).toEqual(["S", "M"]);
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
});

describe("toJerseyRunPayload — fixed mode", () => {
  it("carries namesMode through without a roster (slots are seeded separately)", () => {
    const payload = toJerseyRunPayload(validInput({ namesMode: "fixed" }));
    expect(payload.namesMode).toBe("fixed");
    expect(payload).not.toHaveProperty("fixedRoster");
  });

  it("throws for an invalid namesMode (caller should have validated)", () => {
    expect(() =>
      toJerseyRunPayload(validInput({ namesMode: "" })),
    ).toThrow();
  });

  it("throws for an empty size selection (caller should have validated)", () => {
    expect(() =>
      toJerseyRunPayload(validInput({ sizeOptions: [] })),
    ).toThrow();
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

// R-06: the lock/freeze lazy-status resolver and its permission helpers.
describe("effectiveStatus / isLocked / canLock (R-06)", () => {
  const FUTURE = Date.parse("2026-06-15T23:59:59.999Z");
  const PAST = Date.parse("2026-05-01T23:59:59.999Z");

  function run(overrides: Partial<LockableRun> = {}): LockableRun {
    return { status: "open", deadline: FUTURE, ...overrides };
  }

  it("stays open before the deadline", () => {
    expect(effectiveStatus(run(), NOW)).toBe("open");
    expect(isLocked(run(), NOW)).toBe(false);
  });

  it("auto-locks lazily once the deadline passes, with no manual action", () => {
    expect(effectiveStatus(run({ deadline: PAST }), NOW)).toBe("locked");
    expect(isLocked(run({ deadline: PAST }), NOW)).toBe(true);
  });

  it("treats a deadline equal to now as still open (boundary)", () => {
    expect(effectiveStatus(run({ deadline: NOW }), NOW)).toBe("open");
  });

  it("leaves an already-locked run locked regardless of deadline", () => {
    expect(effectiveStatus(run({ status: "locked", deadline: FUTURE }), NOW)).toBe(
      "locked",
    );
  });

  it("does not lazily re-lock a closed run, even past its deadline", () => {
    // A run explicitly moved to "closed" (e.g. an admin unlocking a
    // past-deadline run) must not immediately flip back to "locked" on
    // the very next read — otherwise "admin can always unlock" would be
    // a no-op for any run whose deadline has already passed.
    expect(effectiveStatus(run({ status: "closed", deadline: PAST }), NOW)).toBe(
      "closed",
    );
  });

  it("canLock is true for open and closed runs, false once locked", () => {
    expect(canLock(run())).toBe(true);
    expect(canLock(run({ status: "closed" }))).toBe(true);
    expect(canLock(run({ status: "locked" }))).toBe(false);
  });

  it("canLock is true for a lazily-locked (past-deadline, still 'open') run", () => {
    // Locking such a run is how it gets materialized with a snapshot.
    expect(canLock(run({ deadline: PAST }))).toBe(true);
  });
});

describe("canUnlock / statusAfterUnlock (R-06)", () => {
  const FUTURE = Date.parse("2026-06-15T23:59:59.999Z");
  const PAST = Date.parse("2026-05-01T23:59:59.999Z");
  const admin = { isAdmin: true };
  const captain = { isAdmin: false };

  function lockedRun(overrides: Partial<LockableRun> = {}): LockableRun {
    return { status: "locked", deadline: FUTURE, ...overrides };
  }

  it("admin can always unlock a locked run, deadline passed or not", () => {
    expect(canUnlock(lockedRun(), admin, NOW)).toBe(true);
    expect(canUnlock(lockedRun({ deadline: PAST }), admin, NOW)).toBe(true);
  });

  it("captain can unlock only while the deadline hasn't passed", () => {
    expect(canUnlock(lockedRun(), captain, NOW)).toBe(true);
    expect(canUnlock(lockedRun({ deadline: PAST }), captain, NOW)).toBe(false);
  });

  it("nobody can unlock a run that isn't locked", () => {
    expect(canUnlock({ status: "open", deadline: FUTURE }, admin, NOW)).toBe(
      false,
    );
    expect(
      canUnlock({ status: "closed", deadline: FUTURE }, captain, NOW),
    ).toBe(false);
  });

  it("reopens fully to 'open' when the deadline hasn't passed", () => {
    expect(statusAfterUnlock(lockedRun(), NOW)).toBe("open");
  });

  it("reverts to 'closed' (not 'open') when the deadline has already passed", () => {
    // Prevents the immediate lazy re-lock effectiveStatus would otherwise
    // apply to an "open" run whose deadline is in the past.
    expect(statusAfterUnlock(lockedRun({ deadline: PAST }), NOW)).toBe(
      "closed",
    );
  });
});
