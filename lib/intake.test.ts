import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BRIEF_MAX_LENGTH,
  EMPTY_INTAKE,
  INSPIRATION_LINK_MAX_LENGTH,
  MAX_INSPIRATION_LINKS,
  MIN_QUANTITY,
  QUESTIONS_MAX_LENGTH,
  isKnownShareHost,
  parseDeadlineToMs,
  toIntakePayload,
  validateIntake,
  validateInspirationLinks,
  type IntakeInput,
} from "./intake";

function validInput(overrides: Partial<IntakeInput> = {}): IntakeInput {
  return {
    name: "Alex Captain",
    teamName: "Sidestep Sports",
    email: "alex@example.com",
    phone: "",
    sport: "Ultimate Frisbee",
    estimatedQuantity: 20,
    designPreference: "needs-help",
    usageContext: [],
    deadline: "",
    brief: "We're a co-ed Tuesday league looking for retro-inspired kits.",
    questions: "",
    inspirationLinks: [],
    newsletterOptIn: false,
    ...overrides,
  };
}

const DRIVE_LINK = "https://drive.google.com/drive/folders/abc123";
const DROPBOX_LINK = "https://www.dropbox.com/scl/fo/xyz789";

describe("validateIntake — happy path", () => {
  it("returns no errors for a fully populated valid submission", () => {
    expect(validateIntake(validInput())).toEqual({});
  });

  it("accepts an empty phone (optional field)", () => {
    expect(validateIntake(validInput({ phone: "" }))).toEqual({});
  });

  it("accepts an empty questions field (optional)", () => {
    expect(validateIntake(validInput({ questions: "" }))).toEqual({});
  });

  it("accepts quantity passed as a numeric string from the input element", () => {
    expect(
      validateIntake(validInput({ estimatedQuantity: "15" })),
    ).toEqual({});
  });
});

describe("validateIntake — required fields", () => {
  const requiredFields: Array<keyof IntakeInput> = [
    "name",
    "teamName",
    "email",
    "sport",
    "brief",
  ];

  for (const field of requiredFields) {
    it(`flags an error when ${field} is blank`, () => {
      const errors = validateIntake(validInput({ [field]: "" } as Partial<IntakeInput>));
      expect(errors[field]).toBeTruthy();
    });

    it(`flags an error when ${field} is only whitespace`, () => {
      const errors = validateIntake(
        validInput({ [field]: "   " } as Partial<IntakeInput>),
      );
      expect(errors[field]).toBeTruthy();
    });
  }

  it("flags every required field at once when the form is empty", () => {
    const errors = validateIntake(EMPTY_INTAKE);
    expect(errors.name).toBeTruthy();
    expect(errors.teamName).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.sport).toBeTruthy();
    expect(errors.brief).toBeTruthy();
    expect(errors.estimatedQuantity).toBeTruthy();
    expect(errors.designPreference).toBeTruthy();
  });
});

describe("validateIntake — email format", () => {
  const invalid = ["not-an-email", "missing@dot", "@nodomain.com", "no-at.com"];
  for (const email of invalid) {
    it(`rejects ${email}`, () => {
      expect(validateIntake(validInput({ email })).email).toBeTruthy();
    });
  }

  it("accepts a normal email", () => {
    expect(validateIntake(validInput({ email: "captain@team.co" })).email).toBeUndefined();
  });
});

describe("validateIntake — quantity", () => {
  it("rejects zero", () => {
    expect(
      validateIntake(validInput({ estimatedQuantity: 0 })).estimatedQuantity,
    ).toBeTruthy();
  });

  it("rejects negative numbers", () => {
    expect(
      validateIntake(validInput({ estimatedQuantity: -3 })).estimatedQuantity,
    ).toBeTruthy();
  });

  it("rejects non-numeric strings", () => {
    expect(
      validateIntake(validInput({ estimatedQuantity: "abc" }))
        .estimatedQuantity,
    ).toBeTruthy();
  });

  it(`rejects quantities below the ${MIN_QUANTITY} minimum`, () => {
    expect(
      validateIntake(validInput({ estimatedQuantity: MIN_QUANTITY - 1 }))
        .estimatedQuantity,
    ).toBeTruthy();
  });

  it(`accepts the boundary of ${MIN_QUANTITY}`, () => {
    expect(
      validateIntake(validInput({ estimatedQuantity: MIN_QUANTITY }))
        .estimatedQuantity,
    ).toBeUndefined();
  });
});

describe("validateIntake — usage context", () => {
  it("accepts an empty selection (optional)", () => {
    expect(
      validateIntake(validInput({ usageContext: [] })).usageContext,
    ).toBeUndefined();
  });

  it("accepts event only", () => {
    expect(
      validateIntake(validInput({ usageContext: ["event"] })).usageContext,
    ).toBeUndefined();
  });

  it("accepts league only", () => {
    expect(
      validateIntake(validInput({ usageContext: ["league"] })).usageContext,
    ).toBeUndefined();
  });

  it("accepts both event and league", () => {
    expect(
      validateIntake(validInput({ usageContext: ["event", "league"] }))
        .usageContext,
    ).toBeUndefined();
  });

  it("rejects an unknown option", () => {
    expect(
      validateIntake(validInput({ usageContext: ["tournament"] }))
        .usageContext,
    ).toBeTruthy();
  });
});

describe("validateIntake — deadline", () => {
  // Pin "today" so date validation is deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a blank deadline", () => {
    expect(
      validateIntake(validInput({ deadline: "" })).deadline,
    ).toBeUndefined();
  });

  it("accepts today's date", () => {
    expect(
      validateIntake(validInput({ deadline: "2026-05-18" })).deadline,
    ).toBeUndefined();
  });

  it("accepts a future date", () => {
    expect(
      validateIntake(validInput({ deadline: "2026-09-15" })).deadline,
    ).toBeUndefined();
  });

  it("rejects a past date", () => {
    expect(
      validateIntake(validInput({ deadline: "2026-05-17" })).deadline,
    ).toBeTruthy();
  });

  it("rejects a malformed date string", () => {
    expect(
      validateIntake(validInput({ deadline: "next September" })).deadline,
    ).toBeTruthy();
  });

  it("rejects an impossible calendar date", () => {
    expect(
      validateIntake(validInput({ deadline: "2026-02-30" })).deadline,
    ).toBeTruthy();
  });
});

describe("parseDeadlineToMs", () => {
  it("returns UTC midnight epoch ms for a valid date", () => {
    expect(parseDeadlineToMs("2026-09-15")).toBe(Date.UTC(2026, 8, 15));
  });

  it("returns null for malformed input", () => {
    expect(parseDeadlineToMs("2026/09/15")).toBeNull();
    expect(parseDeadlineToMs("Sep 15 2026")).toBeNull();
  });

  it("returns null for impossible calendar dates", () => {
    expect(parseDeadlineToMs("2026-02-30")).toBeNull();
    expect(parseDeadlineToMs("2026-13-01")).toBeNull();
  });
});

describe("validateIntake — design preference", () => {
  it("rejects an unknown option", () => {
    expect(
      validateIntake(validInput({ designPreference: "magic-beans" }))
        .designPreference,
    ).toBeTruthy();
  });

  it.each(["own-design", "needs-help", "undecided"])(
    "accepts %s",
    (option) => {
      expect(
        validateIntake(validInput({ designPreference: option }))
          .designPreference,
      ).toBeUndefined();
    },
  );
});

describe("validateIntake — length caps", () => {
  it("rejects briefs longer than the max", () => {
    expect(
      validateIntake(validInput({ brief: "x".repeat(BRIEF_MAX_LENGTH + 1) }))
        .brief,
    ).toBeTruthy();
  });

  it("accepts a brief at exactly the max", () => {
    expect(
      validateIntake(validInput({ brief: "x".repeat(BRIEF_MAX_LENGTH) })).brief,
    ).toBeUndefined();
  });

  it("rejects a too-long questions field", () => {
    expect(
      validateIntake(
        validInput({ questions: "x".repeat(QUESTIONS_MAX_LENGTH + 1) }),
      ).questions,
    ).toBeTruthy();
  });
});

describe("validateIntake — inspiration links", () => {
  it("accepts no links at all (fully optional)", () => {
    expect(
      validateIntake(validInput({ inspirationLinks: [] })).inspirationLinks,
    ).toBeUndefined();
  });

  it("ignores blank rows the visitor left empty", () => {
    expect(
      validateIntake(validInput({ inspirationLinks: ["", "   "] }))
        .inspirationLinks,
    ).toBeUndefined();
  });

  it("accepts a valid https share-folder link", () => {
    expect(
      validateIntake(validInput({ inspirationLinks: [DRIVE_LINK] }))
        .inspirationLinks,
    ).toBeUndefined();
  });

  it("accepts several valid links", () => {
    expect(
      validateIntake(
        validInput({ inspirationLinks: [DRIVE_LINK, DROPBOX_LINK] }),
      ).inspirationLinks,
    ).toBeUndefined();
  });

  it("accepts an unrecognised but well-formed https host (soft host check)", () => {
    expect(
      validateIntake(
        validInput({ inspirationLinks: ["https://pinterest.ca/board/kits"] }),
      ).inspirationLinks,
    ).toBeUndefined();
  });

  it("rejects a malformed URL", () => {
    expect(
      validateIntake(validInput({ inspirationLinks: ["not a url at all"] }))
        .inspirationLinks,
    ).toBeTruthy();
  });

  it("rejects a non-https scheme", () => {
    expect(
      validateIntake(
        validInput({ inspirationLinks: ["http://drive.google.com/x"] }),
      ).inspirationLinks,
    ).toBeTruthy();
    expect(
      validateIntake(
        validInput({ inspirationLinks: ["javascript:alert(1)"] }),
      ).inspirationLinks,
    ).toBeTruthy();
  });

  it(`rejects more than ${MAX_INSPIRATION_LINKS} links`, () => {
    const tooMany = Array.from(
      { length: MAX_INSPIRATION_LINKS + 1 },
      (_, i) => `https://drive.google.com/drive/folders/f${i}`,
    );
    expect(
      validateIntake(validInput({ inspirationLinks: tooMany }))
        .inspirationLinks,
    ).toBeTruthy();
  });

  it(`accepts exactly ${MAX_INSPIRATION_LINKS} links`, () => {
    const atCap = Array.from(
      { length: MAX_INSPIRATION_LINKS },
      (_, i) => `https://drive.google.com/drive/folders/f${i}`,
    );
    expect(
      validateIntake(validInput({ inspirationLinks: atCap })).inspirationLinks,
    ).toBeUndefined();
  });

  it("rejects a link longer than the per-URL cap", () => {
    const long = `https://drive.google.com/${"x".repeat(
      INSPIRATION_LINK_MAX_LENGTH,
    )}`;
    expect(
      validateIntake(validInput({ inspirationLinks: [long] }))
        .inspirationLinks,
    ).toBeTruthy();
  });
});

describe("validateInspirationLinks", () => {
  it("returns null when every link is fine", () => {
    expect(validateInspirationLinks([DRIVE_LINK, ""])).toBeNull();
  });

  it("returns a message naming the offending link", () => {
    const message = validateInspirationLinks(["nope"]);
    expect(message).toBeTruthy();
    expect(message).toMatch(/https/i);
  });
});

describe("isKnownShareHost", () => {
  it.each([
    "https://drive.google.com/drive/folders/abc",
    "https://www.dropbox.com/scl/fo/x",
    "https://1drv.ms/f/s!abc",
    "https://onedrive.live.com/?id=1",
    "https://www.icloud.com/sharedalbum/#B0abc",
  ])("recognises %s", (url) => {
    expect(isKnownShareHost(url)).toBe(true);
  });

  it("does not recognise an arbitrary host", () => {
    expect(isKnownShareHost("https://example.com/photos")).toBe(false);
  });

  it("returns false for a malformed URL rather than throwing", () => {
    expect(isKnownShareHost("not a url")).toBe(false);
  });

  it("is not fooled by a lookalike host suffix", () => {
    expect(isKnownShareHost("https://drive.google.com.evil.tld/x")).toBe(false);
  });
});

describe("toIntakePayload", () => {
  it("trims whitespace and coerces quantity to a number", () => {
    const payload = toIntakePayload(
      validInput({
        name: "  Alex  ",
        teamName: "  Sidestep  ",
        email: "  alex@example.com ",
        estimatedQuantity: "25",
      }),
    );
    expect(payload.name).toBe("Alex");
    expect(payload.teamName).toBe("Sidestep");
    expect(payload.email).toBe("alex@example.com");
    expect(payload.estimatedQuantity).toBe(25);
  });

  it("omits usageContext when empty and includes/dedupes when set", () => {
    expect(
      toIntakePayload(validInput({ usageContext: [] })).usageContext,
    ).toBeUndefined();
    const both = toIntakePayload(
      validInput({ usageContext: ["event", "league", "event"] }),
    ).usageContext;
    expect(both).toEqual(["event", "league"]);
  });

  it("omits deadline when blank and converts to epoch ms when provided", () => {
    expect(
      toIntakePayload(validInput({ deadline: "   " })).deadline,
    ).toBeUndefined();
    expect(
      toIntakePayload(validInput({ deadline: "  2026-10-15  " })).deadline,
    ).toBe(Date.UTC(2026, 9, 15));
  });

  it("throws when the deadline string isn't a valid date (defensive)", () => {
    expect(() =>
      toIntakePayload(validInput({ deadline: "not-a-date" })),
    ).toThrow();
  });

  it("omits phone when blank", () => {
    const payload = toIntakePayload(validInput({ phone: "   " }));
    expect(payload.phone).toBeUndefined();
  });

  it("includes phone when provided", () => {
    const payload = toIntakePayload(validInput({ phone: "604-555-0144" }));
    expect(payload.phone).toBe("604-555-0144");
  });

  it("omits questions when blank", () => {
    const payload = toIntakePayload(validInput({ questions: "" }));
    expect(payload.questions).toBeUndefined();
  });

  it("omits inspirationLinks when none were entered", () => {
    expect(
      toIntakePayload(validInput({ inspirationLinks: [] })).inspirationLinks,
    ).toBeUndefined();
  });

  it("drops blank rows and trims, omitting the field when nothing survives", () => {
    expect(
      toIntakePayload(validInput({ inspirationLinks: ["", "  "] }))
        .inspirationLinks,
    ).toBeUndefined();
    expect(
      toIntakePayload(validInput({ inspirationLinks: [`  ${DRIVE_LINK}  `] }))
        .inspirationLinks,
    ).toEqual([DRIVE_LINK]);
  });

  it("dedupes repeated links", () => {
    expect(
      toIntakePayload(
        validInput({ inspirationLinks: [DRIVE_LINK, DRIVE_LINK, DROPBOX_LINK] }),
      ).inspirationLinks,
    ).toEqual([DRIVE_LINK, DROPBOX_LINK]);
  });

  it("throws on an invalid link (defensive — caller should validate first)", () => {
    expect(() =>
      toIntakePayload(validInput({ inspirationLinks: ["not a url"] })),
    ).toThrow();
  });

  it("preserves the newsletter opt-in flag", () => {
    expect(
      toIntakePayload(validInput({ newsletterOptIn: true })).newsletterOptIn,
    ).toBe(true);
  });

  it("throws on invalid design preference (defensive — caller should validate first)", () => {
    expect(() =>
      toIntakePayload(validInput({ designPreference: "bogus" })),
    ).toThrow();
  });
});
