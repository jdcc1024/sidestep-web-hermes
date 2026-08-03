import { describe, expect, it } from "vitest";
import type { RosterRow } from "./jerseyBreakdown";
import {
  buildRosterCsv,
  rosterExportFilename,
  rosterExportRows,
} from "./rosterExport";

function slot(
  name: string,
  number: string | undefined,
  sizes: Array<{ size: string; qty: number }>,
): RosterRow {
  return {
    key: `slot_${name}`,
    label: number ? `${name} #${number}` : name,
    name,
    number,
    blank: false,
    filled: sizes.length > 0,
    collision: false,
    sizes,
    total: sizes.reduce((sum, s) => sum + s.qty, 0),
  };
}

function blank(sizes: Array<{ size: string; qty: number }>): RosterRow {
  return {
    key: "blank:design_1",
    label: "Blank",
    blank: true,
    filled: true,
    collision: false,
    sizes,
    total: sizes.reduce((sum, s) => sum + s.qty, 0),
  };
}

// Data rows only — the header is asserted separately.
function body(rows: readonly RosterRow[], order: "name" | "size" = "name") {
  return rosterExportRows(rows, order).slice(1);
}

describe("rosterExportRows", () => {
  it("should label the columns Name, Number and Size", () => {
    expect(rosterExportRows([], "name")[0]).toEqual(["Name", "Number", "Size"]);
  });

  it("should split a slot's joined label back into name and number columns", () => {
    expect(body([slot("Gretzky", "99", [{ size: "L", qty: 1 }])])).toEqual([
      ["Gretzky", "99", "L"],
    ]);
  });

  it("should repeat a row once per jersey when a size is ordered more than once", () => {
    expect(body([slot("Ruiz", "7", [{ size: "L", qty: 3 }])])).toEqual([
      ["Ruiz", "7", "L"],
      ["Ruiz", "7", "L"],
      ["Ruiz", "7", "L"],
    ]);
  });

  it("should give a slot with several sizes a row for each, in size order", () => {
    expect(
      body([
        slot("Ruiz", "7", [
          { size: "XL", qty: 1 },
          { size: "S", qty: 2 },
        ]),
      ]),
    ).toEqual([
      ["Ruiz", "7", "S"],
      ["Ruiz", "7", "S"],
      ["Ruiz", "7", "XL"],
    ]);
  });

  it("should export an unfilled slot once with an empty size", () => {
    expect(body([slot("Cole", "7", [])])).toEqual([["Cole", "7", ""]]);
  });

  it("should leave the number empty for a slot that has none", () => {
    expect(body([slot("Cole", undefined, [{ size: "M", qty: 1 }])])).toEqual([
      ["Cole", "", "M"],
    ]);
  });

  it("should export blank jerseys with no name or number", () => {
    expect(body([blank([{ size: "XL", qty: 2 }])])).toEqual([
      ["", "", "XL"],
      ["", "", "XL"],
    ]);
  });

  it("should sort by name rather than the order the roster was seeded in", () => {
    const rows = body([
      slot("Zeta", "1", [{ size: "M", qty: 1 }]),
      slot("alpha", "2", [{ size: "M", qty: 1 }]),
      slot("Mid", "3", [{ size: "M", qty: 1 }]),
    ]);

    expect(rows.map((r) => r[0])).toEqual(["alpha", "Mid", "Zeta"]);
  });

  it("should sort names with numbers in them numerically", () => {
    const rows = body([
      slot("Player 10", "1", [{ size: "M", qty: 1 }]),
      slot("Player 2", "2", [{ size: "M", qty: 1 }]),
    ]);

    expect(rows.map((r) => r[0])).toEqual(["Player 2", "Player 10"]);
  });

  it("should put blank jerseys last in name order", () => {
    const rows = body([
      blank([{ size: "S", qty: 1 }]),
      slot("Zeta", "1", [{ size: "M", qty: 1 }]),
    ]);

    expect(rows).toEqual([
      ["Zeta", "1", "M"],
      ["", "", "S"],
    ]);
  });

  it("should group by size in catalog order when asked", () => {
    const rows = body(
      [
        slot("Ruiz", "7", [{ size: "XL", qty: 1 }]),
        slot("Cole", "4", [{ size: "S", qty: 1 }]),
        slot("Diaz", "9", [{ size: "M", qty: 2 }]),
      ],
      "size",
    );

    expect(rows).toEqual([
      ["Cole", "4", "S"],
      ["Diaz", "9", "M"],
      ["Diaz", "9", "M"],
      ["Ruiz", "7", "XL"],
    ]);
  });

  it("should sort players alphabetically within a size group", () => {
    const rows = body(
      [
        slot("Zeta", "1", [{ size: "M", qty: 1 }]),
        slot("Alpha", "2", [{ size: "M", qty: 1 }]),
      ],
      "size",
    );

    expect(rows.map((r) => r[0])).toEqual(["Alpha", "Zeta"]);
  });

  it("should keep blanks last inside their own size group", () => {
    const rows = body(
      [
        blank([
          { size: "S", qty: 1 },
          { size: "M", qty: 1 },
        ]),
        slot("Zeta", "1", [{ size: "M", qty: 1 }]),
      ],
      "size",
    );

    expect(rows).toEqual([
      ["", "", "S"],
      ["Zeta", "1", "M"],
      ["", "", "M"],
    ]);
  });

  it("should trail the unfilled slots after every size group", () => {
    const rows = body(
      [
        slot("Cole", "4", []),
        slot("Ruiz", "7", [{ size: "S", qty: 1 }]),
        slot("Abbot", "2", []),
      ],
      "size",
    );

    expect(rows).toEqual([
      ["Ruiz", "7", "S"],
      ["Abbot", "2", ""],
      ["Cole", "4", ""],
    ]);
  });
});

describe("buildRosterCsv", () => {
  it("should emit a header and CRLF-terminated rows", () => {
    expect(buildRosterCsv([slot("Ruiz", "7", [{ size: "L", qty: 2 }])], "name"))
      .toBe("Name,Number,Size\r\nRuiz,7,L\r\nRuiz,7,L");
  });

  it("should neutralize a name a spreadsheet would evaluate as a formula", () => {
    const csv = buildRosterCsv(
      [slot("=cmd|calc", "7", [{ size: "L", qty: 1 }])],
      "name",
    );

    expect(csv).toContain("\"'=cmd|calc\"");
  });

  it("should quote a name containing a comma", () => {
    const csv = buildRosterCsv(
      [slot("Ruiz, Ana", "7", [{ size: "L", qty: 1 }])],
      "name",
    );

    expect(csv).toContain('"Ruiz, Ana"');
  });

  it("should still emit the header for a design with no roster", () => {
    expect(buildRosterCsv([], "name")).toBe("Name,Number,Size");
  });
});

describe("rosterExportFilename", () => {
  it("should name the file for the team, the design and the day", () => {
    expect(
      rosterExportFilename("Vancouver Falcons", "Home Kit", Date.UTC(2026, 6, 19)),
    ).toBe("sidestep-roster-vancouver-falcons-home-kit-2026-07-19.csv");
  });

  it("should fall back when the titles slug to nothing", () => {
    expect(rosterExportFilename("!!!", "???", Date.UTC(2026, 0, 2))).toBe(
      "sidestep-roster-design-2026-01-02.csv",
    );
  });
});
