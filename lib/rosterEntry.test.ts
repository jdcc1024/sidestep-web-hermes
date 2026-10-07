import { describe, expect, it } from "vitest";
import {
  ROSTER_DESIGNATION_LABEL,
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
  checkRosterDesignation,
  checkRosterName,
  checkRosterNumber,
  describeRosterCopy,
  isRosterDesignation,
  isRosterSource,
  planRosterCopy,
  rosterMatchKey,
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

// M-09. The letter a player wears — stored as "C"/"A" rather than as words,
// because `source` on the same document is already valued "captain" and two
// same-valued fields make a mistyped field name type-check clean.
describe("checkRosterDesignation", () => {
  it("accepts the two letters", () => {
    expect(checkRosterDesignation("C")).toEqual({ ok: true, value: "C" });
    expect(checkRosterDesignation("A")).toEqual({ ok: true, value: "A" });
  });

  it("treats blank/undefined as no designation, the common case", () => {
    expect(checkRosterDesignation(undefined)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(checkRosterDesignation("")).toEqual({ ok: true, value: undefined });
    expect(checkRosterDesignation("  ")).toEqual({ ok: true, value: undefined });
  });

  it("rejects a letter nobody wears", () => {
    expect(checkRosterDesignation("Z").ok).toBe(false);
    expect(checkRosterDesignation("captain").ok).toBe(false);
  });

  // A captain typing into a spreadsheet or a future paste column writes "c",
  // and refusing that would be pedantry.
  it("takes a lowercase letter and normalizes it", () => {
    expect(checkRosterDesignation(" c ")).toEqual({ ok: true, value: "C" });
  });

  it("guards the same set", () => {
    expect(isRosterDesignation("C")).toBe(true);
    expect(isRosterDesignation("A")).toBe(true);
    expect(isRosterDesignation("captain")).toBe(false);
  });

  it("names both letters in words for the surfaces that need them", () => {
    expect(ROSTER_DESIGNATION_LABEL.C).toMatch(/captain/i);
    expect(ROSTER_DESIGNATION_LABEL.A).toMatch(/assistant/i);
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

  // M-09: the same person on the away kit wears the same letter, and
  // re-picking it per design is the kind of chore the mirror exists to remove.
  it("carries a designation across to the target", () => {
    const plan = planRosterCopy(
      [
        { name: "Gretzky", number: "99", designation: "C" as const },
        { name: "Bo" },
      ],
      [],
    );
    expect(plan.additions).toEqual([
      { name: "Gretzky", number: "99", designation: "C" },
      { name: "Bo", number: undefined, designation: undefined },
    ]);
  });

  // A letter is a role, not an identity: the same player is already there.
  it("still skips a player the target has, whatever letter either wears", () => {
    const plan = planRosterCopy(
      [{ name: "Gretzky", number: "99", designation: "C" as const }],
      [{ name: "Gretzky", number: "99" }],
    );
    expect(plan.copied).toBe(0);
    expect(plan.skipped).toBe(1);
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
