import { describe, expect, it } from "vitest";
import {
  EMPTY_ROSTER_ENTRY,
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
  ROSTER_PASTE_MAX_ROWS,
  checkRosterName,
  checkRosterNumber,
  describeRosterCopy,
  isRosterSource,
  parseRosterPaste,
  planRosterCopy,
  rosterMatchKey,
  rosterSlotKey,
  toRosterEntryPayload,
  validateRosterEntry,
} from "./rosterEntry";

describe("isRosterSource", () => {
  it("accepts the two known sources", () => {
    expect(isRosterSource("captain")).toBe(true);
    expect(isRosterSource("fan")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isRosterSource("admin")).toBe(false);
    expect(isRosterSource("")).toBe(false);
  });
});

describe("checkRosterName", () => {
  it("requires a non-empty name", () => {
    expect(checkRosterName("   ").ok).toBe(false);
  });

  it("trims and returns the name", () => {
    const result = checkRosterName("  Gretzky  ");
    expect(result).toEqual({ ok: true, value: "Gretzky" });
  });

  it("rejects a name over the cap", () => {
    expect(checkRosterName("x".repeat(ROSTER_NAME_MAX_LENGTH + 1)).ok).toBe(
      false,
    );
  });
});

describe("checkRosterNumber", () => {
  it("treats blank/undefined as an omitted (undefined) number", () => {
    expect(checkRosterNumber("")).toEqual({ ok: true, value: undefined });
    expect(checkRosterNumber(undefined)).toEqual({ ok: true, value: undefined });
    expect(checkRosterNumber("  ")).toEqual({ ok: true, value: undefined });
  });

  it("trims and returns a present number", () => {
    expect(checkRosterNumber("  99 ")).toEqual({ ok: true, value: "99" });
  });

  it("rejects a number over the cap", () => {
    expect(checkRosterNumber("9".repeat(ROSTER_NUMBER_MAX_LENGTH + 1)).ok).toBe(
      false,
    );
  });
});

describe("rosterMatchKey", () => {
  it("matches the same slot regardless of case or surrounding space", () => {
    expect(rosterMatchKey("d1", "  Gretzky ", "99")).toBe(
      rosterMatchKey("d1", "gretzky", " 99 "),
    );
  });

  it("treats a missing number the same as an empty one", () => {
    expect(rosterMatchKey("d1", "Bo", undefined)).toBe(
      rosterMatchKey("d1", "Bo", ""),
    );
  });

  it("distinguishes different designs, names, and numbers", () => {
    const base = rosterMatchKey("d1", "Gretzky", "99");
    expect(rosterMatchKey("d2", "Gretzky", "99")).not.toBe(base);
    expect(rosterMatchKey("d1", "Lemieux", "99")).not.toBe(base);
    expect(rosterMatchKey("d1", "Gretzky", "66")).not.toBe(base);
  });
});

describe("rosterSlotKey", () => {
  it("is the design-free half of rosterMatchKey", () => {
    expect(rosterMatchKey("d1", "Gretzky", "99")).toBe(
      `d1::${rosterSlotKey("Gretzky", "99")}`,
    );
  });

  it("folds case and surrounding space on both halves", () => {
    expect(rosterSlotKey("  Gretzky ", " 99 ")).toBe(
      rosterSlotKey("gretzky", "99"),
    );
  });

  it("treats a missing number the same as an empty one", () => {
    expect(rosterSlotKey("Bo", undefined)).toBe(rosterSlotKey("Bo", ""));
  });
});

describe("parseRosterPaste — shapes it accepts", () => {
  // The clipboard formats a captain actually produces: Sheets and Excel
  // paste as TSV, a CSV export lands comma-separated, and a hand-typed
  // list is one column with the number trailing the name.
  const cases: [label: string, text: string][] = [
    ["tab-separated, name first", "Gretzky\t99"],
    ["tab-separated, number first", "99\tGretzky"],
    ["comma-separated, name first", "Gretzky,99"],
    ["comma-separated, number first", "99, Gretzky"],
    ["single column with a trailing number", "Gretzky 99"],
  ];

  it.each(cases)("reads %s", (_label, text) => {
    const { rows, additions } = parseRosterPaste(text);
    expect(rows[0]).toMatchObject({
      status: "new",
      name: "Gretzky",
      number: "99",
    });
    expect(additions).toEqual([{ name: "Gretzky", number: "99" }]);
  });

  it("detects the column order per row, not once for the block", () => {
    const { additions } = parseRosterPaste("Gretzky\t99\n66\tLemieux");
    expect(additions).toEqual([
      { name: "Gretzky", number: "99" },
      { name: "Lemieux", number: "66" },
    ]);
  });

  it("keeps a name-only row, with no number", () => {
    const { rows, additions } = parseRosterPaste("Bo");
    expect(rows[0].status).toBe("new");
    expect(additions).toEqual([{ name: "Bo", number: undefined }]);
  });

  it("keeps a multi-word name together with its trailing number", () => {
    const { additions } = parseRosterPaste("Wayne Gretzky 99");
    expect(additions).toEqual([{ name: "Wayne Gretzky", number: "99" }]);
  });

  // Numbers are text, not integers: "01" and "0" are both legitimate and
  // must survive verbatim, which rules out Number() coercion anywhere.
  it("preserves a leading-zero number and a zero number", () => {
    const { additions } = parseRosterPaste("Bure\t01\nZero\t0");
    expect(additions).toEqual([
      { name: "Bure", number: "01" },
      { name: "Zero", number: "0" },
    ]);
  });

  it("survives \\r\\n line endings and trailing blank lines", () => {
    const { rows, additions } = parseRosterPaste(
      "Gretzky\t99\r\nLemieux\t66\r\n\r\n",
    );
    expect(rows).toHaveLength(2);
    expect(additions).toHaveLength(2);
  });

  it("drops the empty columns a spreadsheet selection carries", () => {
    const { additions } = parseRosterPaste("Gretzky\t\t99");
    expect(additions).toEqual([{ name: "Gretzky", number: "99" }]);
  });

  it("returns nothing at all for an empty or whitespace-only paste", () => {
    for (const text of ["", "   ", "\n\n \r\n"]) {
      const result = parseRosterPaste(text);
      expect(result.rows).toEqual([]);
      expect(result.additions).toEqual([]);
      expect(result.counts).toEqual({
        additions: 0,
        existing: 0,
        duplicate: 0,
        invalid: 0,
      });
    }
  });
});

describe("parseRosterPaste — rows it refuses", () => {
  it("flags a row that is only a number", () => {
    const { rows, additions, counts } = parseRosterPaste("99");
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toMatch(/name/i);
    expect(additions).toEqual([]);
    expect(counts.invalid).toBe(1);
  });

  it("flags a row with more columns than a name and a number", () => {
    const { rows } = parseRosterPaste("Gretzky\t99\tLeft wing");
    expect(rows[0].status).toBe("invalid");
  });

  it("flags an over-long name with the same message the single-add path gives", () => {
    const tooLong = "x".repeat(ROSTER_NAME_MAX_LENGTH + 1);
    const check = checkRosterName(tooLong);
    if (check.ok) throw new Error("fixture should be over the cap");
    const { rows } = parseRosterPaste(`${tooLong}\t99`);
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toBe(check.error);
  });

  it("flags an over-long number", () => {
    const { rows, counts } = parseRosterPaste(
      `Gretzky\t${"9".repeat(ROSTER_NUMBER_MAX_LENGTH + 1)}`,
    );
    expect(rows[0].status).toBe("invalid");
    expect(counts.invalid).toBe(1);
  });

  it("refuses to preview a paste bigger than the batch bound", () => {
    const text = Array.from(
      { length: ROSTER_PASTE_MAX_ROWS + 1 },
      (_, i) => `Player ${i}\t${i}`,
    ).join("\n");
    const result = parseRosterPaste(text);
    expect(result.tooManyRows).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.additions).toEqual([]);
  });

  it("previews a paste exactly at the bound", () => {
    const text = Array.from(
      { length: ROSTER_PASTE_MAX_ROWS },
      (_, i) => `Player ${i}\t${i}`,
    ).join("\n");
    const result = parseRosterPaste(text);
    expect(result.tooManyRows).toBe(false);
    expect(result.additions).toHaveLength(ROSTER_PASTE_MAX_ROWS);
  });
});

describe("parseRosterPaste — duplicates", () => {
  it("flags a row already on this design's roster and excludes it", () => {
    const { rows, additions, counts } = parseRosterPaste(
      "gretzky\t99\nLemieux\t66",
      [{ name: "Gretzky", number: "99" }],
    );
    expect(rows[0].status).toBe("existing");
    expect(rows[1].status).toBe("new");
    expect(additions).toEqual([{ name: "Lemieux", number: "66" }]);
    expect(counts).toMatchObject({ additions: 1, existing: 1 });
  });

  it("flags the second copy of a row repeated inside the paste itself", () => {
    const { rows, additions, counts } = parseRosterPaste(
      "Gretzky\t99\n  GRETZKY \t99",
    );
    expect(rows[0].status).toBe("new");
    expect(rows[1].status).toBe("duplicate");
    expect(additions).toHaveLength(1);
    expect(counts).toMatchObject({ additions: 1, duplicate: 1 });
  });

  it("does not treat the same name on a different number as a duplicate", () => {
    const { additions } = parseRosterPaste("Gretzky\t99\nGretzky\t66");
    expect(additions).toHaveLength(2);
  });

  it("previews a paste of nothing but duplicates without erroring", () => {
    const result = parseRosterPaste("Gretzky\t99", [
      { name: "Gretzky", number: "99" },
    ]);
    expect(result.additions).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.tooManyRows).toBe(false);
  });

  it("matches an existing numberless slot on the name alone", () => {
    const { rows } = parseRosterPaste("Bo", [{ name: "bo" }]);
    expect(rows[0].status).toBe("existing");
  });
});

// M-04: the mirror's dedupe. Same normalization as the paste above, so
// "already on this roster" means one thing across every path that says it.
describe("planRosterCopy", () => {
  it("copies every source slot onto an empty target, name and number only", () => {
    const plan = planRosterCopy(
      [
        { name: "Gretzky", number: "99" },
        { name: "Bo" },
      ],
      [],
    );
    expect(plan.additions).toEqual([
      { name: "Gretzky", number: "99" },
      { name: "Bo", number: undefined },
    ]);
    expect(plan.copied).toBe(2);
    expect(plan.skipped).toBe(0);
  });

  it("skips a slot the target already has, matched case- and space-insensitively", () => {
    const plan = planRosterCopy(
      [
        { name: "Gretzky", number: "99" },
        { name: "Lemieux", number: "66" },
      ],
      [{ name: "  gretzky ", number: " 99 " }],
    );
    expect(plan.additions).toEqual([{ name: "Lemieux", number: "66" }]);
    expect(plan.copied).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it("copies nothing on a re-run, and says everything was already there", () => {
    const source = [
      { name: "Gretzky", number: "99" },
      { name: "Bo" },
    ];
    const plan = planRosterCopy(source, source);
    expect(plan.additions).toEqual([]);
    expect(plan.copied).toBe(0);
    expect(plan.skipped).toBe(2);
  });

  it("treats the same name on a different number as a different player", () => {
    const plan = planRosterCopy(
      [{ name: "Gretzky", number: "66" }],
      [{ name: "Gretzky", number: "99" }],
    );
    expect(plan.copied).toBe(1);
  });

  it("matches a numberless slot on the name alone", () => {
    const plan = planRosterCopy([{ name: "Bo" }], [{ name: "bo" }]);
    expect(plan.copied).toBe(0);
    expect(plan.skipped).toBe(1);
  });

  // A source roster can hold two identical slots (nothing dedupes `create`),
  // and copying both would put the duplicate the skip rule exists to prevent
  // onto the target.
  it("copies a slot repeated within the source only once", () => {
    const plan = planRosterCopy(
      [
        { name: "Gretzky", number: "99" },
        { name: "GRETZKY", number: "99" },
      ],
      [],
    );
    expect(plan.copied).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it("plans nothing at all for an empty source", () => {
    const plan = planRosterCopy([], [{ name: "Gretzky", number: "99" }]);
    expect(plan).toMatchObject({ additions: [], copied: 0, skipped: 0 });
  });
});

describe("describeRosterCopy", () => {
  it("reports the copies and the skips together", () => {
    expect(describeRosterCopy({ copied: 18, skipped: 2 })).toBe(
      "18 copied, 2 already there",
    );
  });

  it("says only what happened when nothing was skipped", () => {
    expect(describeRosterCopy({ copied: 15, skipped: 0 })).toBe("15 copied");
  });

  // Reassuring, not alarming (PRD §9): a re-run copying zero is the rule
  // working, so the message has to read as "you're already set".
  it("reads as already-done when every slot was skipped", () => {
    expect(describeRosterCopy({ copied: 0, skipped: 15 })).toMatch(
      /already/i,
    );
    expect(describeRosterCopy({ copied: 0, skipped: 15 })).toContain("15");
  });

  it("says the source was empty when there was nothing to copy at all", () => {
    expect(describeRosterCopy({ copied: 0, skipped: 0 })).toMatch(
      /no players/i,
    );
  });
});

describe("validateRosterEntry", () => {
  it("has no errors for a valid entry", () => {
    expect(validateRosterEntry({ name: "Gretzky", number: "99" })).toEqual({});
  });

  it("flags a blank name", () => {
    expect(validateRosterEntry({ ...EMPTY_ROSTER_ENTRY }).name).toBeTruthy();
  });

  it("allows a blank number (number is optional)", () => {
    expect(
      validateRosterEntry({ name: "Bo", number: "" }).number,
    ).toBeUndefined();
  });
});

describe("toRosterEntryPayload", () => {
  it("trims name and normalizes a blank number to undefined", () => {
    expect(toRosterEntryPayload({ name: "  Bo  ", number: "  " })).toEqual({
      name: "Bo",
      number: undefined,
    });
  });

  it("throws on an invalid (empty) name", () => {
    expect(() => toRosterEntryPayload({ name: "", number: "1" })).toThrow();
  });
});
