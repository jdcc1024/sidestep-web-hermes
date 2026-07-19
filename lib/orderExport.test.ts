import { describe, expect, it } from "vitest";
import {
  buildOrderCsv,
  exportFilename,
  toCsv,
  type OrderExport,
} from "./orderExport";

describe("toCsv", () => {
  it("should join cells with commas and rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });

  it("should quote a value containing a comma", () => {
    expect(toCsv([["Ruiz, Ana"]])).toBe('"Ruiz, Ana"');
  });

  it("should quote and double up embedded quotes", () => {
    expect(toCsv([['He said "hi"']])).toBe('"He said ""hi"""');
  });

  it("should quote a value containing a newline", () => {
    expect(toCsv([["line one\nline two"]])).toBe('"line one\nline two"');
  });

  it("should leave a plain value unquoted", () => {
    expect(toCsv([["Falcons"]])).toBe("Falcons");
  });

  it("should neutralize a value that a spreadsheet would read as a formula", () => {
    // Supplier handoff opens in Excel/Sheets; a name field starting with =
    // must not execute. Prefixed with ' and quoted, so the text survives.
    expect(toCsv([["=SUM(A1:A9)"]])).toBe("\"'=SUM(A1:A9)\"");
    expect(toCsv([["+1 555 0100"]])).toBe("\"'+1 555 0100\"");
  });
});

describe("exportFilename", () => {
  it("should slugify the team name and date-stamp the file", () => {
    expect(exportFilename("Vancouver Falcons", Date.UTC(2026, 6, 19))).toBe(
      "sidestep-order-vancouver-falcons-2026-07-19.csv",
    );
  });

  it("should strip punctuation and collapse separators", () => {
    expect(exportFilename("O'Brien's  A/C Team!", Date.UTC(2026, 0, 2))).toBe(
      "sidestep-order-obriens-a-c-team-2026-01-02.csv",
    );
  });

  it("should fall back to 'order' when the team name has no usable characters", () => {
    expect(exportFilename("!!!", Date.UTC(2026, 0, 2))).toBe(
      "sidestep-order-order-2026-01-02.csv",
    );
  });
});

const baseOrder: OrderExport = {
  teamName: "Falcons",
  sport: "Soccer",
  captainName: "Ana Ruiz",
  captainEmail: "ana@example.com",
  estimatedQuantity: 12,
  orderDate: Date.UTC(2026, 6, 1),
  hasRun: false,
  customQuestions: [],
  rows: [],
};

function parse(csv: string): string[][] {
  // Test-only parser: the fixtures below contain no embedded newlines.
  return csv.split("\r\n").map((line) => {
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    return cells;
  });
}

describe("buildOrderCsv — order with a jersey run", () => {
  const withRun: OrderExport = {
    ...baseOrder,
    hasRun: true,
    customQuestions: [
      { id: "q1", label: "Pickup location" },
      { id: "q2", label: "Phone" },
    ],
    rows: [
      {
        designTitle: "Home",
        jerseyStyle: "Pro",
        neckline: "V-neck",
        sleeveStyle: "Short",
        nameOnJersey: "Gretzky",
        numberOnJersey: "99",
        size: "L",
        qty: 2,
        submitterName: "Ben Chu",
        submitterEmail: "ben@example.com",
        submittedAt: Date.UTC(2026, 6, 10),
        customAnswers: { q1: "Gym", q2: "555-0100" },
      },
      {
        designTitle: "Away",
        jerseyStyle: "Pro",
        neckline: "Crew",
        sleeveStyle: "Long",
        nameOnJersey: "",
        numberOnJersey: "",
        size: "M",
        qty: 3,
        submitterName: "Cy Okafor",
        submitterEmail: "cy@example.com",
        submittedAt: Date.UTC(2026, 6, 11),
        customAnswers: {},
      },
    ],
  };

  it("should emit one column per custom question, labelled by the question", () => {
    const [header] = parse(buildOrderCsv(withRun));
    expect(header).toEqual([
      "Team name",
      "Sport",
      "Design",
      "Jersey style",
      "Neckline",
      "Sleeve style",
      "Name on jersey",
      "Number on jersey",
      "Size",
      "Quantity",
      "Submitted by",
      "Email",
      "Submitted on",
      "Pickup location",
      "Phone",
    ]);
  });

  it("should emit one row per jersey line with its answers in question order", () => {
    const rows = parse(buildOrderCsv(withRun));
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([
      "Falcons",
      "Soccer",
      "Home",
      "Pro",
      "V-neck",
      "Short",
      "Gretzky",
      "99",
      "L",
      "2",
      "Ben Chu",
      "ben@example.com",
      "2026-07-10",
      "Gym",
      "555-0100",
    ]);
  });

  it("should leave unanswered questions and unnamed bulk lines blank", () => {
    const rows = parse(buildOrderCsv(withRun));
    expect(rows[2][6]).toBe(""); // name on jersey
    expect(rows[2][7]).toBe(""); // number on jersey
    expect(rows[2][13]).toBe(""); // q1
    expect(rows[2][14]).toBe(""); // q2
  });

  it("should emit a header-only file when the run has no submissions", () => {
    const rows = parse(buildOrderCsv({ ...withRun, rows: [] }));
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("Team name");
  });
});

describe("buildOrderCsv — order without a jersey run", () => {
  it("should emit the order-detail columns", () => {
    const [header] = parse(buildOrderCsv(baseOrder));
    expect(header).toEqual([
      "Team name",
      "Captain",
      "Captain email",
      "Sport",
      "Quantity",
      "Design",
      "Jersey style",
      "Neckline",
      "Sleeve style",
      "Order date",
    ]);
  });

  it("should emit a single row of order details when no designs are linked", () => {
    const rows = parse(buildOrderCsv(baseOrder));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([
      "Falcons",
      "Ana Ruiz",
      "ana@example.com",
      "Soccer",
      "12",
      "",
      "",
      "",
      "",
      "2026-07-01",
    ]);
  });

  it("should emit one row per linked design, since specs live on the design", () => {
    const rows = parse(
      buildOrderCsv({
        ...baseOrder,
        rows: [
          {
            designTitle: "Home",
            jerseyStyle: "Pro",
            neckline: "V-neck",
            sleeveStyle: "Short",
            nameOnJersey: "",
            numberOnJersey: "",
            size: "",
            qty: 0,
            submitterName: "",
            submitterEmail: "",
            submittedAt: 0,
            customAnswers: {},
          },
          {
            designTitle: "Away",
            jerseyStyle: "",
            neckline: "",
            sleeveStyle: "",
            nameOnJersey: "",
            numberOnJersey: "",
            size: "",
            qty: 0,
            submitterName: "",
            submitterEmail: "",
            submittedAt: 0,
            customAnswers: {},
          },
        ],
      }),
    );
    expect(rows).toHaveLength(3);
    expect(rows[1][5]).toBe("Home");
    expect(rows[1][6]).toBe("Pro");
    expect(rows[2][5]).toBe("Away");
    expect(rows[2][6]).toBe("");
  });
});
