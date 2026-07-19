import { describe, expect, it } from "vitest";
import {
  describeSubmitters,
  jerseyCount,
  pendingDesignRemovals,
} from "./designRemoval";

describe("pendingDesignRemovals", () => {
  it("finds the saved designs the form no longer links", () => {
    expect(pendingDesignRemovals(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("is empty when nothing was dropped", () => {
    expect(pendingDesignRemovals(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("ignores designs added in the form — only removals warn", () => {
    expect(pendingDesignRemovals(["a"], ["a", "z"])).toEqual([]);
  });

  it("reports a design dropped and re-added elsewhere in the list only once", () => {
    expect(pendingDesignRemovals(["a", "a", "b"], ["b"])).toEqual(["a"]);
  });

  it("is empty for an order that never linked anything", () => {
    expect(pendingDesignRemovals([], ["a"])).toEqual([]);
  });
});

describe("describeSubmitters", () => {
  it("names a single submitter with their jersey count", () => {
    expect(
      describeSubmitters([{ name: "Ana Ruiz", email: "a@x.com", qty: 2 }]),
    ).toBe("Ana Ruiz (2)");
  });

  it("joins two submitters with 'and'", () => {
    expect(
      describeSubmitters([
        { name: "Ana Ruiz", email: "a@x.com", qty: 2 },
        { name: "Ben Chu", email: "b@x.com", qty: 1 },
      ]),
    ).toBe("Ana Ruiz (2) and Ben Chu (1)");
  });

  it("uses an Oxford-comma list for three", () => {
    expect(
      describeSubmitters([
        { name: "Ana Ruiz", email: "a@x.com", qty: 2 },
        { name: "Ben Chu", email: "b@x.com", qty: 1 },
        { name: "Cy Okafor", email: "c@x.com", qty: 3 },
      ]),
    ).toBe("Ana Ruiz (2), Ben Chu (1), and Cy Okafor (3)");
  });

  it("caps the list and counts the rest so a big roster stays readable", () => {
    const many = ["Ana", "Ben", "Cy", "Dee", "Eli"].map((name, i) => ({
      name,
      email: `${name}@x.com`,
      qty: i + 1,
    }));
    expect(describeSubmitters(many, 3)).toBe(
      "Ana (1), Ben (2), Cy (3), and 2 others",
    );
  });

  it("says '1 other' when exactly one is over the cap", () => {
    const four = ["Ana", "Ben", "Cy", "Dee"].map((name) => ({
      name,
      email: `${name}@x.com`,
      qty: 1,
    }));
    expect(describeSubmitters(four, 3)).toBe(
      "Ana (1), Ben (1), Cy (1), and 1 other",
    );
  });

  it("is empty when nobody is affected", () => {
    expect(describeSubmitters([])).toBe("");
  });
});

describe("jerseyCount", () => {
  it("singularizes one jersey", () => {
    expect(jerseyCount(1)).toBe("1 jersey");
  });

  it("pluralizes anything else", () => {
    expect(jerseyCount(0)).toBe("0 jerseys");
    expect(jerseyCount(4)).toBe("4 jerseys");
  });
});
