import { describe, expect, it } from "vitest";
import { csvSlug, isoDate, toCsv } from "./csv";

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

  it("should leave an empty cell empty", () => {
    expect(toCsv([["", "", "L"]])).toBe(",,L");
  });

  it("should neutralize a value that a spreadsheet would read as a formula", () => {
    // Supplier handoff opens in Excel/Sheets; a name field starting with =
    // must not execute. Prefixed with ' and quoted, so the text survives.
    expect(toCsv([["=SUM(A1:A9)"]])).toBe("\"'=SUM(A1:A9)\"");
    expect(toCsv([["+1 555 0100"]])).toBe("\"'+1 555 0100\"");
  });
});

describe("csvSlug", () => {
  it("should lowercase and hyphenate", () => {
    expect(csvSlug("Vancouver Falcons")).toBe("vancouver-falcons");
  });

  it("should drop apostrophes rather than split on them", () => {
    expect(csvSlug("O'Brien's  A/C Team!")).toBe("obriens-a-c-team");
  });

  it("should return empty for text with no usable characters", () => {
    expect(csvSlug("!!!")).toBe("");
  });
});

describe("isoDate", () => {
  it("should render an unambiguous year-month-day", () => {
    expect(isoDate(Date.UTC(2026, 6, 19))).toBe("2026-07-19");
  });
});
