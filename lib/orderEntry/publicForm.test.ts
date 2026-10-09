import { describe, expect, it } from "vitest";
import {
  lineQty,
  pickedSizes,
  pictureBlock,
  rosterRowLabel,
  toggleOpenRow,
} from "@/lib/orderEntry";

const SIZES = ["XS", "S", "M", "L", "XL"];
const line = (rosterEntryId: string, size: string, qty: string) => ({
  rosterEntryId,
  size,
  qty,
});

describe("lineQty", () => {
  it("should read the qty of the matching slot and size", () => {
    expect(lineQty([line("a", "M", "2"), line("b", "M", "5")], "b", "M")).toBe(
      5,
    );
  });

  it("should give 0 when nothing is picked or the qty doesn't parse", () => {
    expect(lineQty([], "a", "M")).toBe(0);
    expect(lineQty([line("a", "M", "")], "a", "M")).toBe(0);
  });
});

describe("pickedSizes", () => {
  it("should list one slot's sizes in size order whatever order they were tapped in", () => {
    const lines = [
      line("a", "XL", "1"),
      line("b", "S", "4"),
      line("a", "S", "1"),
      line("a", "M", "2"),
    ];
    expect(pickedSizes(lines, "a", SIZES)).toEqual([
      { size: "S", qty: 1 },
      { size: "M", qty: 2 },
      { size: "XL", qty: 1 },
    ]);
  });

  it("should leave out sizes at 0", () => {
    expect(pickedSizes([line("a", "S", "0")], "a", SIZES)).toEqual([]);
  });
});

describe("rosterRowLabel", () => {
  it("should name the player, their number and their sizes", () => {
    expect(
      rosterRowLabel({ name: "Sidestep", number: "72" }, [
        { size: "S", qty: 1 },
        { size: "M", qty: 2 },
      ]),
    ).toBe("Sidestep, number 72, S×1, M×2");
  });

  it("should say 'no sizes yet' when nothing is picked", () => {
    expect(rosterRowLabel({ name: "Avery Quinn", number: "7" }, [])).toBe(
      "Avery Quinn, number 7, no sizes yet",
    );
  });

  it("should skip the number when the player has none", () => {
    expect(rosterRowLabel({ name: "Bo", number: " " }, [])).toBe(
      "Bo, no sizes yet",
    );
    expect(rosterRowLabel({ name: "Bo" }, [{ size: "L", qty: 1 }])).toBe(
      "Bo, L×1",
    );
  });
});

describe("toggleOpenRow", () => {
  it("should open a tapped row and close the one that was open", () => {
    expect(toggleOpenRow(null, "a")).toBe("a");
    expect(toggleOpenRow("a", "b")).toBe("b");
  });

  it("should close the open row when it is tapped again", () => {
    expect(toggleOpenRow("a", "a")).toBeNull();
  });
});

describe("pictureBlock", () => {
  const png = { url: "https://x/y.png", contentType: "image/png" };
  const home = { title: "Home Kit", mainImage: png };
  const away = { title: "Away Kit", mainImage: null };

  it("should show one big picture for a single design that has one", () => {
    expect(pictureBlock([home])).toEqual({ kind: "single", design: home });
  });

  it("should show the design line for a single design with no drawable picture", () => {
    expect(pictureBlock([away])).toEqual({
      kind: "designLine",
      title: "Away Kit",
    });
    expect(
      pictureBlock([
        {
          title: "Print",
          mainImage: { url: "https://x/p", contentType: "application/pdf" },
        },
      ]),
    ).toEqual({ kind: "designLine", title: "Print" });
  });

  it("should show a tile per design when 2+ designs and any has a picture", () => {
    expect(pictureBlock([home, away])).toEqual({ kind: "tiles" });
  });

  it("should show nothing when 2+ designs and none has a picture", () => {
    expect(pictureBlock([away, { ...away, title: "Third" }])).toEqual({
      kind: "none",
    });
  });

  it("should show nothing for an order with no designs", () => {
    expect(pictureBlock([])).toEqual({ kind: "none" });
  });
});
