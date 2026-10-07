// R2-04 acceptance tests (initiative 0004, phase 1b): the paste parser groups
// rows by player and reads an optional "how many" column.
// Spec: backlog/R2-04-paste-grouped-by-player.md (## Logic), design note
// docs/architecture/0004-roster-sizes.md (Paste).
//
// Contract the build must create in `lib/orderItem/paste.ts`:
//   parseRosterPaste(text, existing?) where `existing` is
//     { name: string; number?: string; sizes?: { size: string; qty?: number }[] }[]
//   and the result is
//     rows:    one per non-blank line, `status` "new" | "updated" | "invalid",
//              `note` on a row worth a second look, `problem` on an invalid row
//     players: { name, number, sizes: { size, qty }[] }[]  (order of first
//              appearance; sizes summed per size; this is what goes to addMany)
//     counts:  { added, updated, jerseys, needSize, invalid }
//     tooManyRows
// `additions` and the per-row `size` / `repeats` of the L-04 shape are gone.
// Wording of notes is not pinned: tests match key words only.
import { describe, expect, it } from "vitest";
import { ROSTER_PASTE_MAX_ROWS, parseRosterPaste } from "./paste";

const sizesOf = (
  players: readonly { sizes: readonly { size: string; qty: number }[] }[],
  at = 0,
) => Object.fromEntries(players[at].sizes.map((s) => [s.size, s.qty]));

describe("rows for one player group into one player (R2-04 Logic)", () => {
  it("three rows for one key, one with 'how many' 3, become S×1, M×3, XL×1", () => {
    const { players, rows, counts } = parseRosterPaste(
      "Sidestep\t72\tS\nSidestep\t72\tM\t3\nSidestep\t72\tXL",
    );
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ name: "Sidestep", number: "72" });
    expect(sizesOf(players)).toEqual({ S: 1, M: 3, XL: 1 });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "new")).toBe(true);
    expect(counts).toMatchObject({
      added: 1,
      updated: 0,
      jerseys: 5,
      needSize: 0,
      invalid: 0,
    });
  });

  it("the same size on two rows is summed into one line", () => {
    const { players, counts } = parseRosterPaste(
      "Sidestep,72,M,2\nsidestep ,72,M",
    );
    expect(players).toHaveLength(1);
    expect(players[0].sizes).toEqual([{ size: "M", qty: 3 }]);
    expect(counts.jerseys).toBe(3);
  });

  it("'how many' is optional: no fourth cell means one jersey", () => {
    const { players } = parseRosterPaste("Sidestep\t72\tL");
    expect(players[0].sizes).toEqual([{ size: "L", qty: 1 }]);
  });

  it("the same name with different numbers stays two players", () => {
    const { players, counts } = parseRosterPaste("Lee\t4\tM\nLee\t9\tM");
    expect(players.map((p) => `${p.name}#${p.number}`)).toEqual([
      "Lee#4",
      "Lee#9",
    ]);
    expect(counts).toMatchObject({ added: 2, jerseys: 2 });
  });

  it("players come out in order of first appearance, even when rows interleave", () => {
    const { players } = parseRosterPaste("A\t1\tS\nB\t2\tS\nA\t1\tM");
    expect(players.map((p) => p.name)).toEqual(["A", "B"]);
    expect(sizesOf(players, 0)).toEqual({ S: 1, M: 1 });
  });

  it("a player with no size column is a player with no size lines, and counts as needing sizes", () => {
    const { players, counts } = parseRosterPaste("Sidestep\t72\tM\nJordan Lee\t4");
    expect(players).toHaveLength(2);
    expect(players[1]).toMatchObject({ name: "Jordan Lee", number: "4" });
    expect(players[1].sizes).toEqual([]);
    expect(counts).toMatchObject({ added: 2, needSize: 1, jerseys: 1 });
  });
});

describe("a row with too many cells, or a bad 'how many', is invalid (R2-04 Logic)", () => {
  it("a row with 5 cells is invalid and adds nothing", () => {
    const { rows, players, counts } = parseRosterPaste(
      "Sidestep\t72\tM\t2\textra",
    );
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toBeTruthy();
    expect(players).toEqual([]);
    expect(counts).toMatchObject({ added: 0, jerseys: 0, invalid: 1 });
  });

  it.each(["0", "501", "-1", "2.5", "abc"])(
    "a 'how many' of %s is invalid",
    (qty) => {
      const { rows, players, counts } = parseRosterPaste(
        `Sidestep\t72\tM\t${qty}`,
      );
      expect(rows[0].status).toBe("invalid");
      expect(players).toEqual([]);
      expect(counts.invalid).toBe(1);
    },
  );

  it("1 and 500 are the accepted bounds", () => {
    const { players } = parseRosterPaste("A\t1\tM\t1\nB\t2\tL\t500");
    expect(sizesOf(players, 0)).toEqual({ M: 1 });
    expect(sizesOf(players, 1)).toEqual({ L: 500 });
  });

  it("an invalid row does not stop the valid rows around it", () => {
    const { rows, players, counts } = parseRosterPaste(
      "A\t1\tS\nA\t1\tM\t0\nA\t1\tL",
    );
    expect(rows.map((r) => r.status)).toEqual(["new", "invalid", "new"]);
    expect(sizesOf(players)).toEqual({ S: 1, L: 1 });
    expect(counts).toMatchObject({ jerseys: 2, invalid: 1 });
  });
});

describe("an unknown size adds no line to the player and notes the row (R2-04 Logic)", () => {
  it("the row is kept, the player gets no line for it, and a note says so", () => {
    const { rows, players, counts } = parseRosterPaste(
      "Sidestep\t72\tM\nSidestep\t72\tHUGE\t2",
    );
    expect(rows[1].status).not.toBe("invalid");
    expect(rows[1].problem).toBeUndefined();
    expect(rows[1].note).toMatch(/HUGE/);
    expect(players).toHaveLength(1);
    expect(sizesOf(players)).toEqual({ M: 1 });
    expect(counts.jerseys).toBe(1);
  });

  it("a player whose only size is unknown is a player who needs sizes", () => {
    const { players, counts } = parseRosterPaste("Sam\t12\tXXXL");
    expect(players).toHaveLength(1);
    expect(players[0].sizes).toEqual([]);
    expect(counts).toMatchObject({ added: 1, needSize: 1, jerseys: 0 });
  });
});

describe("a player already on the design is updated, not duplicated (R2-04 Logic)", () => {
  const existing = [
    { name: "Avery Quinn", number: "7", sizes: [{ size: "M", qty: 1 }] },
  ];

  it("a matching row is 'updated', matched the way the form matches (case, spacing)", () => {
    const { rows, players, counts } = parseRosterPaste(
      "  avery   QUINN \t7\tL",
      existing,
    );
    expect(rows[0].status).toBe("updated");
    expect(rows[0].note).toMatch(/\bM\b/); // names the size it already has
    expect(rows[0].note).toMatch(/\bL\b/); // and the one it adds
    expect(players).toHaveLength(1);
    expect(sizesOf(players)).toEqual({ L: 1 });
    expect(counts).toMatchObject({ added: 0, updated: 1, jerseys: 1 });
  });

  it("a match with no size adds nothing", () => {
    const { rows, players, counts } = parseRosterPaste(
      "Avery Quinn\t7",
      existing,
    );
    expect(rows[0].status).not.toBe("invalid");
    expect(rows[0].note).toBeTruthy();
    expect(players.flatMap((p) => p.sizes)).toEqual([]);
    expect(counts.jerseys).toBe(0);
  });

  it("same name, different number is a new player, with no note", () => {
    const { rows, counts } = parseRosterPaste("Avery Quinn\t8\tL", existing);
    expect(rows[0].status).toBe("new");
    expect(rows[0].note).toBeUndefined();
    expect(counts).toMatchObject({ added: 1, updated: 0 });
  });

  it("an existing entry without a sizes list still matches", () => {
    const { counts } = parseRosterPaste("Jordan Lee\t4\tS", [
      { name: "Jordan Lee", number: "4" },
    ]);
    expect(counts).toMatchObject({ added: 0, updated: 1, jerseys: 1 });
  });
});

describe("the batch bound still applies (R2-04 Notes)", () => {
  it("more than ROSTER_PASTE_MAX_ROWS raw rows parses nothing", () => {
    const text = Array.from(
      { length: ROSTER_PASTE_MAX_ROWS + 1 },
      (_, i) => `P${i}\t${i}\tM`,
    ).join("\n");
    const result = parseRosterPaste(text);
    expect(result.tooManyRows).toBe(true);
    expect(result.players).toEqual([]);
  });
});
