// R3-05 acceptance tests (initiative 0004): a paste that isn't columns is
// flagged. Spec: backlog/R3-05-paste-not-columns-warning.md (Logic).
// Pseudonyms only. The parser itself does not change; this is a pure predicate
// over parseRosterPaste's result. Messages are not pinned.
import { describe, expect, it } from "vitest";
import { looksLikeNotColumns, parseRosterPaste } from "./paste";

const RAW3 = [
  "Kai - [Abbott - 8 - M]",
  "Lee - [Brennan - 15 - 2XL]",
  "Max - [Carver - 23 - L]",
].join("\n");

const check = (text: string) => looksLikeNotColumns(parseRosterPaste(text));

describe("looksLikeNotColumns (R3-05)", () => {
  it("three distinct name-only rows (the raw message shape) give true", () => {
    expect(check(RAW3)).toBe(true);
  });

  it("the same three plus one Abbott,8,M row give false", () => {
    expect(check(`${RAW3}\nAbbott,8,M`)).toBe(false);
  });

  it("two name-only rows give false (under the threshold)", () => {
    expect(check("Kai - [Abbott - 8 - M]\nLee - [Brennan - 15 - 2XL]")).toBe(
      false,
    );
  });

  it("three rows with unknown sizes and no number give true", () => {
    expect(check("Abbott,,XXXL\nBrennan,,XXXL\nCarver,,XXXL")).toBe(true);
  });

  it("three rows where only one has a number give false", () => {
    expect(check("Abbott\nBrennan\nCarver,23")).toBe(false);
  });

  it("invalid rows don't count toward the three", () => {
    // Two valid name-only rows plus one invalid row (over-long number cell).
    const result = parseRosterPaste(
      "Abbott\nBrennan\nCarver,123456789012345678901234567890,M",
    );
    expect(result.counts.invalid).toBeGreaterThan(0);
    expect(looksLikeNotColumns(result)).toBe(false);
  });

  it("an over-the-bound paste is not flagged", () => {
    const many = Array.from({ length: 250 }, (_, i) => `Player ${i}`).join("\n");
    expect(check(many)).toBe(false);
  });
});
