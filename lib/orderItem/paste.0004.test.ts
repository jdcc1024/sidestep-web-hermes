// R3-03 acceptance tests (initiative 0004, backlog/R3-03-paste-keeps-blank-cells.md).
// JCC 2026-10-09: a blank cell between separators is an empty value, not a
// missing column. `COACH R,,S,1` is COACH R, no number, S×1. Leading and
// trailing empty cells on a row are still ignored. The parser learns no new
// free-text shapes, so none are tested here.
import { describe, expect, it } from "vitest";
import { parseRosterPaste } from "./paste";

const coach = (text: string) => parseRosterPaste(text).players;

describe("an empty Number cell is no number, not a missing column (R3-03)", () => {
  it.each([
    ["comma, with how many", "COACH R,,S,1"],
    ["tab, with how many", "COACH R\t\tS\t1"],
  ])("%s: no number, S×1", (_label, text) => {
    expect(coach(text)).toEqual([
      { name: "COACH R", number: undefined, sizes: [{ size: "S", qty: 1 }] },
    ]);
    expect(parseRosterPaste(text).counts).toMatchObject({
      added: 1,
      jerseys: 1,
      needSize: 0,
      invalid: 0,
    });
  });

  it("`Name,,S` (no how many): no number, size S", () => {
    expect(coach("COACH R,,S")).toEqual([
      { name: "COACH R", number: undefined, sizes: [{ size: "S", qty: 1 }] },
    ]);
  });

  it("a number never comes from the Size or How many column", () => {
    for (const text of ["Rowan,,M,3", "Rowan,,M,1", "Rowan,,S"]) {
      const [player] = coach(text);
      expect(player.name).toBe("Rowan");
      expect(player.number).toBeUndefined();
      expect(player.sizes).toHaveLength(1);
    }
    expect(coach("Rowan,,M,3")[0].sizes).toEqual([{ size: "M", qty: 3 }]);
  });

  it("a blank-number player and a numbered player in one paste stay separate", () => {
    const { players, counts } = parseRosterPaste("COACH R,,S,1\nAbbott,8,M");
    expect(players).toEqual([
      { name: "COACH R", number: undefined, sizes: [{ size: "S", qty: 1 }] },
      { name: "Abbott", number: "8", sizes: [{ size: "M", qty: 1 }] },
    ]);
    expect(counts).toMatchObject({ added: 2, jerseys: 2, needSize: 0 });
  });
});

describe("empty cells at either end of a row are still ignored (R3-03)", () => {
  it("`Gretzky⇥⇥99` is Gretzky #99 with no size", () => {
    expect(coach("Gretzky\t\t99")).toEqual([
      { name: "Gretzky", number: "99", sizes: [] },
    ]);
  });

  it("`,,Gretzky,99,,` is Gretzky #99 with no size", () => {
    expect(coach(",,Gretzky,99,,")).toEqual([
      { name: "Gretzky", number: "99", sizes: [] },
    ]);
  });

  it("a spreadsheet row with empty edge columns around a full row still reads", () => {
    expect(coach("\tAbbott\t8\tM\t1\t")).toEqual([
      { name: "Abbott", number: "8", sizes: [{ size: "M", qty: 1 }] },
    ]);
  });

  it("a line of only separators between two real rows is skipped like a blank line and does not throw", () => {
    const text = "Abbott,8,M\n,,,\nBrennan,15,L";
    expect(() => parseRosterPaste(text)).not.toThrow();
    const result = parseRosterPaste(text);
    expect(result.players.map((p) => p.name)).toEqual(["Abbott", "Brennan"]);
    expect(result.rows).toHaveLength(2);
    expect(result.counts.invalid).toBe(0);
    // Not numbered either: the second real row is line 2, as if it were blank.
    expect(result.rows.map((r) => r.line)).toEqual([1, 2]);
  });
});

describe("a blank cell next to a size we don't make (R3-03)", () => {
  it("`Chen,,youth L` is Chen with no number and a size-we-don't-make note", () => {
    const result = parseRosterPaste("Chen,,youth L");
    expect(result.players).toEqual([
      { name: "Chen", number: undefined, sizes: [] },
    ]);
    expect(result.rows[0].status).not.toBe("invalid");
    expect(result.rows[0].note).toMatch(/youth L/);
  });
});
