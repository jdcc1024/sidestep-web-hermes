// R2-01 acceptance tests (initiative 0004, phase 1b): `playerKey` is the one
// normalisation for "same player". Spec: backlog/R2-01-roster-entries-model.md
// (Logic + item 2), docs/architecture/0004-roster-sizes.md invariant 1.
// Written before the build: fails because `playerKey` is not exported yet.
import { describe, expect, it } from "vitest";
import { playerKey, rosterSlotKey } from "./rules";

describe("playerKey({name, number}) is trimmed, whitespace-collapsed, lowercased", () => {
  it("treats case, outer and inner whitespace as the same player", () => {
    const a = playerKey({ name: "Sidestep", number: "72" });
    expect(playerKey({ name: "  SIDESTEP ", number: " 72 " })).toBe(a);
    expect(playerKey({ name: "sidestep", number: "72" })).toBe(a);
    expect(playerKey({ name: "Riley   Park", number: "7" })).toBe(
      playerKey({ name: "riley park", number: "7" }),
    );
  });

  it("keeps different players apart, and \"01\" is not \"1\"", () => {
    expect(playerKey({ name: "Lee", number: "4" })).not.toBe(
      playerKey({ name: "Lee", number: "9" }),
    );
    expect(playerKey({ name: "Lee", number: "01" })).not.toBe(
      playerKey({ name: "Lee", number: "1" }),
    );
    // name/number boundary can't be forged by moving characters across it
    expect(playerKey({ name: "a1", number: "2" })).not.toBe(
      playerKey({ name: "a", number: "12" }),
    );
  });

  it("ignores the letter: it takes only name and number", () => {
    const key = playerKey({ name: "Sam", number: "9" });
    expect(
      playerKey({ name: "Sam", number: "9", designation: "C" } as never),
    ).toBe(key);
  });

  it("an all-blank player has the empty key", () => {
    expect(playerKey({})).toBe("");
    expect(playerKey({ name: "  ", number: "" })).toBe("");
    expect(playerKey({ name: undefined, number: undefined })).toBe("");
  });

  it("a missing number equals a blank number", () => {
    expect(playerKey({ name: "Sam" })).toBe(
      playerKey({ name: "Sam", number: "  " }),
    );
  });
});

describe("rosterSlotKey agrees with playerKey for existing callers", () => {
  it("same equality classes", () => {
    const pairs: [string, string | undefined][] = [
      ["Sam", "9"],
      [" SAM ", " 9"],
      ["Sam", undefined],
      ["Sam", ""],
      ["Lee", "4"],
    ];
    for (const [n1, k1] of pairs)
      for (const [n2, k2] of pairs) {
        const slotEqual = rosterSlotKey(n1, k1) === rosterSlotKey(n2, k2);
        const playerEqual =
          playerKey({ name: n1, number: k1 }) ===
          playerKey({ name: n2, number: k2 });
        expect(slotEqual).toBe(playerEqual);
      }
  });
});
