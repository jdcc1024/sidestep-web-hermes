import { describe, expect, it } from "vitest";
import { summarize, type SummaryItem } from "./summary";
import { itemBreakdownEntries, itemRosterRows, itemSlots } from "./views";

function list(
  items: Partial<SummaryItem>[],
  namesMode: "open" | "fixed" = "open",
) {
  const full: SummaryItem[] = items.map((item, i) => ({
    _id: `item_${i}`,
    designId: "home",
    qty: 1,
    source: "captain",
    createdAt: 1_000 + i,
    ...item,
  }));
  return summarize(full, {
    designIds: ["home"],
    titles: { home: "Home kit" },
    namesMode,
  });
}

describe("itemSlots", () => {
  it("should give one slot per named item, carrying its own size and qty", () => {
    const home = list([
      { name: "Gretzky", number: "99", size: "L", qty: 2 },
      { name: "Bure", number: "10", qty: 3 },
      { size: "M", qty: 4 },
    ]).designs[0];

    expect(itemSlots(home)).toEqual([
      expect.objectContaining({
        _id: "item_0",
        name: "Gretzky",
        filled: true,
        sizes: [{ size: "L", qty: 2 }],
        total: 2,
        qty: 2,
      }),
      expect.objectContaining({
        _id: "item_1",
        name: "Bure",
        filled: false,
        sizes: [],
        total: 0,
        qty: 3,
      }),
    ]);
  });

  it("should keep the same player twice as two slots (JCC Q7)", () => {
    const home = list([
      { name: "Lee", number: "4", size: "M" },
      { name: "Lee", number: "4", size: "L" },
    ]).designs[0];

    expect(itemSlots(home).map((s) => s._id)).toEqual(["item_0", "item_1"]);
  });
});

describe("itemRosterRows", () => {
  it("should fold unnamed sized items into one blank line after the players", () => {
    const home = list([
      { size: "M", qty: 2 },
      { name: "Gretzky", number: "99", size: "L" },
      { size: "M", qty: 1 },
      { size: "S", qty: 1 },
    ]).designs[0];

    const rows = itemRosterRows(home);
    expect(rows.map((r) => r.label)).toEqual(["Gretzky #99", "Blank"]);
    expect(rows[1]).toMatchObject({
      key: "blank:home",
      blank: true,
      sizes: [
        { size: "S", qty: 1 },
        { size: "M", qty: 3 },
      ],
      total: 4,
    });
  });

  it("should add up to the design's itemCount, with Needs-size rows counting 0", () => {
    const home = list([
      { name: "Gretzky", number: "99", size: "L", qty: 3 },
      { name: "Bure", number: "10" },
      { size: "XL", qty: 2 },
      // A blank jersey that still needs a size counts nowhere.
      { qty: 5 },
    ]).designs[0];

    const rows = itemRosterRows(home);
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(
      home.summary.itemCount,
    );
    expect(home.summary.itemCount).toBe(5);
  });

  it("should carry the open-mode collision flag onto the row", () => {
    const home = list([
      { name: "Gretzky", number: "99", size: "L", submitterEmail: "a@x.com" },
      { name: "Gretzky", number: "99", size: "M", submitterEmail: "b@x.com" },
    ]).designs[0];

    expect(itemRosterRows(home).map((r) => r.collision)).toEqual([true, true]);
  });
});

describe("itemBreakdownEntries", () => {
  it("should list sized items on linked designs only", () => {
    const summary = summarize(
      [
        {
          _id: "a",
          designId: "home",
          size: "M",
          qty: 2,
          source: "fan",
          createdAt: 1,
        },
        {
          _id: "b",
          designId: "home",
          name: "Bure",
          qty: 1,
          source: "captain",
          createdAt: 2,
        },
        {
          _id: "c",
          designId: "gone",
          size: "L",
          qty: 9,
          source: "fan",
          createdAt: 3,
        },
      ],
      { designIds: ["home"], titles: { home: "Home kit" }, namesMode: null },
    );

    expect(itemBreakdownEntries(summary)).toEqual([
      expect.objectContaining({
        designId: "home",
        designTitle: "Home kit",
        size: "M",
        qty: 2,
      }),
    ]);
  });
});
