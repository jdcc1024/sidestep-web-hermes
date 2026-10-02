// L-04 acceptance tests for the paste parser (initiative 0004, phase 1).
// Spec: backlog/L-04-paste-with-sizes-and-removal-warning.md §1, UX §3 / §7.7,
// JCC Gate 1 Q7 (repeats are added, with a note).
//
// Contract the build must create: `lib/orderItem/paste.ts` (moved from
// `lib/rosterEntry/paste.ts`), exporting `parseRosterPaste` and
// `ROSTER_PASTE_MAX_ROWS` under the same names. The result shape changes:
//   - a row's `status` is only "new" or "invalid"; `existing` / `duplicate` are
//     gone. A repeat is a "new" row carrying a `note` (not a `problem`).
//   - a row has `size?: SizeOption`; an unknown third cell leaves it undefined
//     and puts the reason in `note`.
//   - `additions` is `{ name, number, size }[]` — every non-invalid row.
//   - `counts` is `{ additions, repeats, needSize, invalid }`.
// The first half of this file is the pre-L-04 parser suite, ported unchanged
// except for the import path and the two repeat cases the spec updates.
import { describe, expect, it } from "vitest";
import {
  ROSTER_PASTE_MAX_ROWS,
  parseRosterPaste,
} from "./paste";
import {
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
  checkRosterName,
} from "../rosterEntry/rules";
import { SIZE_OPTIONS } from "../jerseyRun/rules";

describe("two-column paste behaves as before (L-04: existing paste tests pass)", () => {
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
        repeats: 0,
        needSize: 0,
        invalid: 0,
      });
    }
  });

  it("flags a row that is only a number", () => {
    const { rows, additions, counts } = parseRosterPaste("99");
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toMatch(/name/i);
    expect(additions).toEqual([]);
    expect(counts.invalid).toBe(1);
  });

  it("flags a row with more than three cells", () => {
    const { rows, additions } = parseRosterPaste(
      "Gretzky\t99\tM\tLeft wing",
    );
    expect(rows[0].status).toBe("invalid");
    expect(additions).toEqual([]);
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

  it("refuses to preview a paste bigger than the batch bound (200 stays)", () => {
    expect(ROSTER_PASTE_MAX_ROWS).toBe(200);
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

describe("a size column is read when there is one (L-04 §1, UX §7.7)", () => {
  it("reads Name ⇥ Number ⇥ Size into a sized row", () => {
    const { rows, additions, counts } = parseRosterPaste("Sidestep\t72\tM");
    expect(rows[0]).toMatchObject({
      status: "new",
      name: "Sidestep",
      number: "72",
      size: "M",
    });
    expect(additions).toEqual([{ name: "Sidestep", number: "72", size: "M" }]);
    expect(counts).toMatchObject({ additions: 1, needSize: 0, invalid: 0 });
  });

  it("finds the size cell whichever column it is in; the numeric cell is still the number", () => {
    const { additions } = parseRosterPaste(
      "M\tSidestep\t72\nSidestep\tL\t73\n74\tXL\tCarter",
    );
    expect(additions).toEqual([
      { name: "Sidestep", number: "72", size: "M" },
      { name: "Sidestep", number: "73", size: "L" },
      { name: "Carter", number: "74", size: "XL" },
    ]);
  });

  it("reads comma-separated rows with a size too", () => {
    const { additions } = parseRosterPaste("Sidestep,72,S");
    expect(additions).toEqual([{ name: "Sidestep", number: "72", size: "S" }]);
  });

  it("a row with no size column is a row that Needs size, and is counted", () => {
    const { rows, additions, counts } = parseRosterPaste(
      "Sidestep\t72\tM\nJordan Lee\t4",
    );
    expect(rows[1].status).toBe("new");
    expect(rows[1].size).toBeUndefined();
    expect(additions[1]).toMatchObject({ name: "Jordan Lee", number: "4" });
    expect(additions[1].size).toBeUndefined();
    expect(counts).toMatchObject({ additions: 2, needSize: 1 });
  });
});

describe("`xxl`, ` l `, `2xl` parse as `2XL`, `L`, `2XL` (L-04 §1)", () => {
  it("trims, uppercases, and maps XXL to 2XL", () => {
    const { additions } = parseRosterPaste(
      "A\t1\txxl\nB\t2\t l \nC\t3\t2xl",
    );
    expect(additions.map((a) => a.size)).toEqual(["2XL", "L", "2XL"]);
  });

  it("accepts every catalogue size, in any case", () => {
    for (const size of SIZE_OPTIONS) {
      const { additions } = parseRosterPaste(
        `Sidestep\t72\t${size.toLowerCase()}`,
      );
      expect(additions[0].size).toBe(size);
    }
  });
});

describe("a size we don't make is added as Needs size and named in the preview (L-04 §1, rule 7)", () => {
  it("keeps the row, drops the size, and says why in a note, not a rejection", () => {
    const { rows, additions, counts } = parseRosterPaste(
      "Sidestep\t72\tM\nJordan Lee\t4\nSam\t12\tXXXL",
    );
    expect(rows[2].status).toBe("new");
    expect(rows[2].size).toBeUndefined();
    expect(rows[2].note).toBe(
      "Row 3: \"XXXL\" isn't a size we make — added as Needs size.",
    );
    expect(rows[2].problem).toBeUndefined();
    expect(additions).toHaveLength(3);
    expect(additions[2]).toMatchObject({ name: "Sam", number: "12" });
    expect(additions[2].size).toBeUndefined();
    expect(counts).toMatchObject({ additions: 3, needSize: 2, invalid: 0 });
  });

  it("numbers the row by its position among the non-blank lines", () => {
    const { rows } = parseRosterPaste("\nA\t1\tM\n\nB\t2\t\nC\t3\tHUGE");
    expect(rows[2].note).toMatch(/^Row 3: "HUGE" isn['’]t a size we make/);
  });
});

describe("repeats are added, not skipped (L-04 §1, JCC Gate 1 Q7)", () => {
  it("a row matching a live item on the design is still added, with an 'already on the list' note", () => {
    const { rows, additions, counts } = parseRosterPaste(
      "Jordan Lee\t4",
      [{ name: "Jordan Lee", number: "4" }],
    );
    expect(rows[0].status).toBe("new");
    expect(rows[0].note).toBe(
      "Jordan Lee #4 is already on the list — adds another.",
    );
    expect(rows[0].problem).toBeUndefined();
    expect(additions).toEqual([{ name: "Jordan Lee", number: "4" }]);
    expect(counts).toMatchObject({ additions: 1, repeats: 1 });
  });

  it("matches the existing item the way the order form does: case and spacing don't matter", () => {
    const { rows } = parseRosterPaste("  jordan   LEE \t4", [
      { name: "Jordan Lee", number: "4" },
    ]);
    expect(rows[0].status).toBe("new");
    expect(rows[0].note).toMatch(/already on the list — adds another\.$/);
  });

  it("a name-only row matches an existing numberless item", () => {
    const { rows, additions } = parseRosterPaste("Bo", [{ name: "bo" }]);
    expect(rows[0].status).toBe("new");
    expect(rows[0].note).toMatch(/already on the list/);
    expect(additions).toHaveLength(1);
  });

  it("a row repeated earlier in the same paste is added too, with a 'twice' note", () => {
    const { rows, additions, counts } = parseRosterPaste(
      "Lee\t4\n  LEE \t4",
    );
    expect(rows.map((r) => r.status)).toEqual(["new", "new"]);
    expect(rows[1].note).toMatch(/^lee #4 is in this paste twice — adds both\.$/i);
    expect(additions).toHaveLength(2);
    expect(counts).toMatchObject({ additions: 2, repeats: 1 });
  });

  it("existing and in-paste repeats together: both rows are added and both count", () => {
    const { additions, counts } = parseRosterPaste(
      "Jordan Lee\t4\nJordan Lee\t4",
      [{ name: "Jordan Lee", number: "4" }],
    );
    expect(additions).toHaveLength(2);
    expect(counts.repeats).toBe(2);
  });

  it("same name, different number is two players: no note, no repeat", () => {
    const { rows, additions, counts } = parseRosterPaste("Lee\t4\nLee\t9", [
      { name: "Lee", number: "7" },
    ]);
    expect(additions).toEqual([
      { name: "Lee", number: "4" },
      { name: "Lee", number: "9" },
    ]);
    expect(rows[0].note).toBeUndefined();
    expect(rows[1].note).toBeUndefined();
    expect(counts.repeats).toBe(0);
  });

  it("a paste of nothing but repeats is a normal, committable paste", () => {
    const result = parseRosterPaste("Gretzky\t99", [
      { name: "Gretzky", number: "99" },
    ]);
    expect(result.additions).toHaveLength(1);
    expect(result.tooManyRows).toBe(false);
  });

  it("a repeat that also has a bad size carries both notes' meaning", () => {
    const { rows, additions } = parseRosterPaste("Lee\t4\tHUGE", [
      { name: "Lee", number: "4" },
    ]);
    expect(rows[0].status).toBe("new");
    expect(rows[0].note).toMatch(/already on the list/);
    expect(rows[0].note).toMatch(/"HUGE" isn['’]t a size we make/);
    expect(additions).toHaveLength(1);
  });
});

describe("no parser message leaks server text (UX §8.10)", () => {
  it("none of the notes or problems mention CONVEX, ConvexError, Request ID or a path", () => {
    const text = [
      "Jordan Lee\t4",
      "Jordan Lee\t4",
      "Sam\t12\tXXXL",
      "99",
      "A\t1\tM\tleft",
    ].join("\n");
    const { rows } = parseRosterPaste(text, [
      { name: "Jordan Lee", number: "4" },
    ]);
    const words = rows.flatMap((r) => [r.note, r.problem]).filter(Boolean);
    expect(words.length).toBeGreaterThan(0);
    for (const w of words)
      expect(w).not.toMatch(/CONVEX|ConvexError|Request ID|\/(?:app|convex|home|lib)\//);
  });
});
