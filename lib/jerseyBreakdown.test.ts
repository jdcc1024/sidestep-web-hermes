import { describe, expect, it } from "vitest";
import { jerseyLabel } from "./jerseyBreakdown";

describe("jerseyLabel", () => {
  it("joins the name and number the way the responses table does", () => {
    expect(jerseyLabel("Gretzky", "99")).toBe("Gretzky #99");
  });

  it("keeps a name with no number, and a number with no name", () => {
    expect(jerseyLabel("Gretzky", undefined)).toBe("Gretzky");
    expect(jerseyLabel(undefined, "99")).toBe("#99");
  });

  it("reads Blank when the jersey carries no player identity", () => {
    expect(jerseyLabel(undefined, undefined)).toBe("Blank");
    expect(jerseyLabel("  ", "")).toBe("Blank");
  });
});
