// R3-04 acceptance tests (initiative 0004): Paste a list reads an optional
// 5th cell, "Ordered by". Spec: backlog/R3-04-paste-ordered-by-column.md
// (Logic). Pseudonyms only. Messages are not pinned.
import { describe, expect, it } from "vitest";
import { parseRosterPaste } from "./paste";

describe("parseRosterPaste: optional 5th cell, Ordered by (R3-04)", () => {
  it("reads the 5th cell as ordered-by, per size line; the chip sums across owners", () => {
    const { players, preview, counts, rows } = parseRosterPaste(
      "Fraser,43,2XL,1,Sam\nFraser,43,2XL,1,Jo",
    );
    expect(rows.every((r) => r.status !== "invalid")).toBe(true);
    expect(players).toHaveLength(1);
    expect(players[0].sizes).toEqual([
      { size: "2XL", qty: 1, orderedBy: "Sam" },
      { size: "2XL", qty: 1, orderedBy: "Jo" },
    ]);
    const item = preview[0];
    if (item.kind !== "player") throw new Error("expected a player");
    expect(item.sizes).toEqual([{ size: "2XL", qty: 2 }]);
    expect(item.orderedBy).toEqual(["Sam", "Jo"]);
    expect(counts).toMatchObject({ added: 1, jerseys: 2, invalid: 0 });
  });

  it("owners are distinct and in first-seen order", () => {
    const { preview } = parseRosterPaste(
      "Fraser,43,S,1,Rob\nFraser,43,M,1,Sam\nFraser,43,L,1,Rob",
    );
    const item = preview[0];
    if (item.kind !== "player") throw new Error("expected a player");
    expect(item.orderedBy).toEqual(["Rob", "Sam"]);
  });

  it("a 4-column row in the same paste is valid, with no ordered-by key and an empty owner list", () => {
    const { players, preview, counts } = parseRosterPaste(
      "Fraser,43,S,1,Rob\nGill,21,M,1",
    );
    expect(counts).toMatchObject({ added: 2, jerseys: 2, invalid: 0 });
    const gill = players.find((p) => p.name === "Gill")!;
    expect(gill.sizes).toEqual([{ size: "M", qty: 1 }]);
    expect("orderedBy" in gill.sizes[0]).toBe(false);
    const item = preview.find((p) => p.kind === "player" && p.name === "Gill");
    if (!item || item.kind !== "player") throw new Error("expected Gill");
    expect(item.orderedBy).toEqual([]);
  });

  it("an empty 5th cell means no owner; an empty 4th cell with a 5th means How many = 1", () => {
    const { players, counts } = parseRosterPaste("Abbott,8,M,,Kai\nGill,21,M,2,");
    expect(counts.invalid).toBe(0);
    expect(players.find((p) => p.name === "Abbott")!.sizes).toEqual([
      { size: "M", qty: 1, orderedBy: "Kai" },
    ]);
    const gill = players.find((p) => p.name === "Gill")!;
    expect(gill.sizes).toEqual([{ size: "M", qty: 2 }]);
    expect("orderedBy" in gill.sizes[0]).toBe(false);
  });

  it("the owner is trimmed", () => {
    const { players } = parseRosterPaste("Fraser,43,S,1,  Rob  ");
    expect(players[0].sizes).toEqual([{ size: "S", qty: 1, orderedBy: "Rob" }]);
  });

  it("works with tabs too", () => {
    const { players, counts } = parseRosterPaste("Fraser\t43\tS\t1\tRob");
    expect(counts.invalid).toBe(0);
    expect(players[0].sizes).toEqual([{ size: "S", qty: 1, orderedBy: "Rob" }]);
  });

  it("a 6-cell row is still skipped with a message, and adds nothing", () => {
    const { rows, players, counts } = parseRosterPaste("Fraser,43,S,1,Rob,extra");
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toBeTruthy();
    expect(players).toEqual([]);
    expect(counts).toMatchObject({ jerseys: 0, invalid: 1 });
  });

  it("Abbott,8,M,Kai is invalid: the owner is not read from the How many slot", () => {
    const { rows, players } = parseRosterPaste("Abbott,8,M,Kai");
    expect(rows[0].status).toBe("invalid");
    expect(rows[0].problem).toBeTruthy();
    expect(players).toEqual([]);
  });

  it("an owner over 120 characters makes that row invalid; 120 is fine", () => {
    const ok = parseRosterPaste(`Fraser,43,S,1,${"a".repeat(120)}`);
    expect(ok.rows[0].status).not.toBe("invalid");
    const bad = parseRosterPaste(
      `Fraser,43,S,1,${"a".repeat(121)}\nGill,21,M,1,Jo`,
    );
    expect(bad.rows[0].status).toBe("invalid");
    expect(bad.rows[1].status).not.toBe("invalid");
    expect(bad.players.map((p) => p.name)).toEqual(["Gill"]);
  });
});
