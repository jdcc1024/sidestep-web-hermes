// L-04 tests for the paste parser (initiative 0004, phase 1), ported to the
// grouped-player shape of R2-04 (backlog/R2-04-paste-grouped-by-player.md).
// Spec: backlog/L-04-paste-with-sizes-and-removal-warning.md §1, UX §3 / §7.
//
// The parsing rules L-04 pinned still hold (column order per row, tabs and
// commas, "01", the trailing-number fallback, name/number caps, the batch
// bound, XXL → 2XL, a size we don't make). What changed with R2-04:
//   - rows naming the same player become one player in `players` instead of
//     one addition each; a repeat within the paste is grouped, not added twice;
//   - a row matching a player already on the design is "updated" and adds its
//     sizes to that player; with no size it has nothing to add;
//   - `additions` / `counts.repeats` are gone; counts are
//     `{ added, updated, jerseys, needSize, invalid }`;
//   - a fourth cell is "how many", so a fourth cell that isn't one is invalid.
// The "how many" column itself is covered by paste.r204.test.ts.
import { describe, expect, it } from "vitest";
import {
  ROSTER_PASTE_MAX_ROWS,
  parseRosterPaste,
} from "./paste";
import { MAX_QTY } from "../orderEntry/rules";
import {
  ROSTER_NAME_MAX_LENGTH,
  ROSTER_NUMBER_MAX_LENGTH,
  checkRosterName,
} from "../rosterEntry/rules";
import { SIZE_OPTIONS } from "../orderForm/rules";

describe("two-column paste behaves as before (L-04: existing paste tests pass)", () => {
  const cases: [label: string, text: string][] = [
    ["tab-separated, name first", "Gretzky\t99"],
    ["tab-separated, number first", "99\tGretzky"],
    ["comma-separated, name first", "Gretzky,99"],
    ["comma-separated, number first", "99, Gretzky"],
    ["single column with a trailing number", "Gretzky 99"],
  ];

  it.each(cases)("reads %s", (_label, text) => {
    const { rows, players } = parseRosterPaste(text);
    expect(rows[0]).toMatchObject({
      status: "new",
      name: "Gretzky",
      number: "99",
    });
    expect(players).toEqual([{ name: "Gretzky", number: "99", sizes: [] }]);
  });

  it("detects the column order per row, not once for the block", () => {
    const { players } = parseRosterPaste("Gretzky\t99\n66\tLemieux");
    expect(players).toEqual([
      { name: "Gretzky", number: "99", sizes: [] },
      { name: "Lemieux", number: "66", sizes: [] },
    ]);
  });

  it("keeps a name-only row, with no number", () => {
    const { rows, players } = parseRosterPaste("Bo");
    expect(rows[0].status).toBe("new");
    expect(players).toEqual([{ name: "Bo", number: undefined, sizes: [] }]);
  });

  it("keeps a multi-word name together with its trailing number", () => {
    const { players } = parseRosterPaste("Wayne Gretzky 99");
    expect(players).toEqual([
      { name: "Wayne Gretzky", number: "99", sizes: [] },
    ]);
  });

  it("preserves a leading-zero number and a zero number", () => {
    const { players } = parseRosterPaste("Bure\t01\nZero\t0");
    expect(players).toEqual([
      { name: "Bure", number: "01", sizes: [] },
      { name: "Zero", number: "0", sizes: [] },
    ]);
  });

  it("survives \\r\\n line endings and trailing blank lines", () => {
    const { rows, players } = parseRosterPaste(
      "Gretzky\t99\r\nLemieux\t66\r\n\r\n",
    );
    expect(rows).toHaveLength(2);
    expect(players).toHaveLength(2);
  });

  it("drops the empty columns at either end, and an empty column a size can't explain", () => {
    const { players } = parseRosterPaste("Gretzky\t\t99");
    expect(players).toEqual([{ name: "Gretzky", number: "99", sizes: [] }]);
  });

  it("returns nothing at all for an empty or whitespace-only paste", () => {
    for (const text of ["", "   ", "\n\n \r\n"]) {
      const result = parseRosterPaste(text);
      expect(result.rows).toEqual([]);
      expect(result.players).toEqual([]);
      expect(result.preview).toEqual([]);
      expect(result.counts).toEqual({
        added: 0,
        updated: 0,
        jerseys: 0,
        needSize: 0,
        invalid: 0,
      });
    }
  });

  it("flags a row that is only a number", () => {
    const { rows, players, counts } = parseRosterPaste("99");
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toMatch(/name/i);
    expect(players).toEqual([]);
    expect(counts.invalid).toBe(1);
  });

  it("flags a row whose fourth cell isn't a 'how many'", () => {
    const { rows, players } = parseRosterPaste(
      "Gretzky\t99\tM\tLeft wing",
    );
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toMatch(/how many/i);
    expect(players).toEqual([]);
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
    expect(result.players).toEqual([]);
    expect(result.preview).toEqual([]);
  });

  it("previews a paste exactly at the bound", () => {
    const text = Array.from(
      { length: ROSTER_PASTE_MAX_ROWS },
      (_, i) => `Player ${i}\t${i}`,
    ).join("\n");
    const result = parseRosterPaste(text);
    expect(result.tooManyRows).toBe(false);
    expect(result.players).toHaveLength(ROSTER_PASTE_MAX_ROWS);
  });
});

describe("a size column is read when there is one (L-04 §1, UX §7)", () => {
  it("reads Name ⇥ Number ⇥ Size into a player with one jersey", () => {
    const { rows, players, counts } = parseRosterPaste("Sidestep\t72\tM");
    expect(rows[0]).toMatchObject({
      status: "new",
      name: "Sidestep",
      number: "72",
      size: "M",
    });
    expect(players).toEqual([
      { name: "Sidestep", number: "72", sizes: [{ size: "M", qty: 1 }] },
    ]);
    expect(counts).toMatchObject({
      added: 1,
      jerseys: 1,
      needSize: 0,
      invalid: 0,
    });
  });

  it("finds the size cell whichever column it is in; the numeric cell is still the number", () => {
    const { players } = parseRosterPaste(
      "M\tSidestep\t72\nSidestep\tL\t73\n74\tXL\tCarter",
    );
    expect(players).toEqual([
      { name: "Sidestep", number: "72", sizes: [{ size: "M", qty: 1 }] },
      { name: "Sidestep", number: "73", sizes: [{ size: "L", qty: 1 }] },
      { name: "Carter", number: "74", sizes: [{ size: "XL", qty: 1 }] },
    ]);
  });

  it("reads comma-separated rows with a size too", () => {
    const { players } = parseRosterPaste("Sidestep,72,S");
    expect(players).toEqual([
      { name: "Sidestep", number: "72", sizes: [{ size: "S", qty: 1 }] },
    ]);
  });

  it("a row with no size column is a player who needs sizes, and is counted", () => {
    const { rows, players, counts } = parseRosterPaste(
      "Sidestep\t72\tM\nJordan Lee\t4",
    );
    expect(rows[1].status).toBe("new");
    expect(rows[1].size).toBeUndefined();
    expect(players[1]).toEqual({ name: "Jordan Lee", number: "4", sizes: [] });
    expect(counts).toMatchObject({ added: 2, needSize: 1 });
  });
});

describe("`xxl`, ` l `, `2xl` parse as `2XL`, `L`, `2XL` (L-04 §1)", () => {
  it("trims, uppercases, and maps XXL to 2XL", () => {
    const { players } = parseRosterPaste("A\t1\txxl\nB\t2\t l \nC\t3\t2xl");
    expect(players.map((p) => p.sizes[0].size)).toEqual(["2XL", "L", "2XL"]);
  });

  it("accepts every catalogue size, in any case", () => {
    for (const size of SIZE_OPTIONS) {
      const { players } = parseRosterPaste(
        `Sidestep\t72\t${size.toLowerCase()}`,
      );
      expect(players[0].sizes).toEqual([{ size, qty: 1 }]);
    }
  });
});

describe("a size we don't make adds no line and is named in the preview (L-04 §1, rule 7)", () => {
  it("keeps the row, drops the size, and says why in a note, not a rejection", () => {
    const { rows, players, counts } = parseRosterPaste(
      "Sidestep\t72\tM\nJordan Lee\t4\nSam\t12\tXXXL",
    );
    expect(rows[2].status).toBe("new");
    expect(rows[2].size).toBeUndefined();
    expect(rows[2].note).toMatch(/^Row 3: "XXXL" isn['’]t a size we make/);
    expect(rows[2].problem).toBeUndefined();
    expect(players).toHaveLength(3);
    expect(players[2]).toEqual({ name: "Sam", number: "12", sizes: [] });
    expect(counts).toMatchObject({ added: 3, needSize: 2, invalid: 0 });
  });

  it("numbers the row by its position among the non-blank lines", () => {
    const { rows } = parseRosterPaste("\nA\t1\tM\n\nB\t2\t\nC\t3\tHUGE");
    expect(rows[2].note).toMatch(/^Row 3: "HUGE" isn['’]t a size we make/);
  });
});

describe("repeats join one player instead of being added twice (R2-04, was L-04 Q7)", () => {
  it("a row matching a player on the design with no size is 'updated' with nothing to add", () => {
    const { rows, players, counts } = parseRosterPaste("Jordan Lee\t4", [
      { name: "Jordan Lee", number: "4" },
    ]);
    expect(rows[0].status).toBe("updated");
    expect(rows[0].note).toBe("Already on your list. Nothing to add.");
    expect(rows[0].problem).toBeUndefined();
    expect(players).toEqual([]);
    expect(counts).toMatchObject({ added: 0, updated: 0, jerseys: 0 });
  });

  it("matches the existing player the way the order form does: case and spacing don't matter", () => {
    const { rows } = parseRosterPaste("  jordan   LEE \t4", [
      { name: "Jordan Lee", number: "4" },
    ]);
    expect(rows[0].status).toBe("updated");
    expect(rows[0].note).toMatch(/^Already on your list/);
  });

  it("a name-only row matches an existing numberless player", () => {
    const { rows, players } = parseRosterPaste("Bo", [{ name: "bo" }]);
    expect(rows[0].status).toBe("updated");
    expect(rows[0].note).toMatch(/already on your list/i);
    expect(players).toEqual([]);
  });

  it("a row repeated earlier in the same paste joins the first one: one player, spelled as first pasted", () => {
    const { rows, players, preview, counts } = parseRosterPaste(
      "Lee\t4\n  LEE \t4",
    );
    expect(rows.map((r) => r.status)).toEqual(["new", "new"]);
    expect(players).toEqual([{ name: "Lee", number: "4", sizes: [] }]);
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      kind: "player",
      lines: [1, 2],
      notes: ["2 rows, one player."],
    });
    expect(counts).toMatchObject({ added: 1, needSize: 1 });
  });

  it("existing and in-paste repeats together: one preview player, nothing to send", () => {
    const { rows, players, preview, counts } = parseRosterPaste(
      "Jordan Lee\t4\nJordan Lee\t4",
      [{ name: "Jordan Lee", number: "4" }],
    );
    expect(rows.map((r) => r.status)).toEqual(["updated", "updated"]);
    expect(players).toEqual([]);
    expect(preview).toHaveLength(1);
    expect(counts).toMatchObject({ added: 0, updated: 0 });
  });

  it("same name, different number is two players: no note, nothing updated", () => {
    const { rows, players, counts } = parseRosterPaste("Lee\t4\nLee\t9", [
      { name: "Lee", number: "7" },
    ]);
    expect(players).toEqual([
      { name: "Lee", number: "4", sizes: [] },
      { name: "Lee", number: "9", sizes: [] },
    ]);
    expect(rows[0].note).toBeUndefined();
    expect(rows[1].note).toBeUndefined();
    expect(counts).toMatchObject({ added: 2, updated: 0 });
  });

  it("a paste of players already there, with no sizes, has nothing to commit", () => {
    const result = parseRosterPaste("Gretzky\t99", [
      { name: "Gretzky", number: "99" },
    ]);
    expect(result.players).toEqual([]);
    expect(result.preview).toHaveLength(1);
    expect(result.tooManyRows).toBe(false);
  });

  it("a match that also has a bad size carries both notes' meaning", () => {
    const { rows, players } = parseRosterPaste("Lee\t4\tHUGE", [
      { name: "Lee", number: "4" },
    ]);
    expect(rows[0].status).toBe("updated");
    expect(rows[0].note).toMatch(/already on your list/i);
    expect(rows[0].note).toMatch(/"HUGE" isn['’]t a size we make/);
    expect(players).toEqual([]);
  });
});

describe("the preview: one item per player and per skipped row (R2-04, UX §7)", () => {
  it("names the sizes a matched player has and what the paste adds", () => {
    const { preview } = parseRosterPaste("Avery Quinn\t7\tL", [
      {
        name: "Avery Quinn",
        number: "7",
        sizes: [
          { size: "M", qty: 1 },
          { size: "XL", qty: 2 },
        ],
      },
    ]);
    expect(preview[0]).toMatchObject({
      kind: "player",
      status: "updated",
      sizes: [{ size: "L", qty: 1 }],
      notes: ["Already on your list with M×1, XL×2. Adds an L."],
    });
  });

  it("keeps skipped rows in their pasted place between players", () => {
    const { preview } = parseRosterPaste("A\t1\tS\n99\nB\t2\tM\nA\t1\tL");
    expect(
      preview.map((item) =>
        item.kind === "player" ? `${item.name}:${item.lines}` : "invalid",
      ),
    ).toEqual(["A:1,4", "invalid", "B:3"]);
  });

  it("skips a row that would take one size past the per-line cap, keeping the rest", () => {
    const { rows, players } = parseRosterPaste(
      `A\t1\tM\t${MAX_QTY}\nA\t1\tM\nA\t1\tL`,
    );
    expect(rows.map((r) => r.status)).toEqual(["new", "invalid", "new"]);
    expect(players[0].sizes).toEqual([
      { size: "M", qty: MAX_QTY },
      { size: "L", qty: 1 },
    ]);
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
