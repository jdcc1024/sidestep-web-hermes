import { describe, expect, it } from "vitest";
import {
  entriesForDesigns,
  jerseyLabel,
  jerseysByFan,
  rosterLinesByDesign,
  rosterRowsByDesign,
  sizeTally,
  type BreakdownEntry,
  type DesignRosterRead,
  type FanEntry,
  type RosterSlotRead,
} from "./jerseyBreakdown";

const HOME = { _id: "design_home", title: "Home kit" };
const AWAY = { _id: "design_away", title: "Away kit" };

function entry(overrides: Partial<BreakdownEntry> = {}): BreakdownEntry {
  return {
    designId: HOME._id,
    designTitle: HOME.title,
    name: "Gretzky",
    number: "99",
    size: "L",
    qty: 1,
    ...overrides,
  };
}

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

describe("rosterLinesByDesign", () => {
  it("groups the collected jerseys under their design", () => {
    const groups = rosterLinesByDesign(
      [
        entry({ name: "Gretzky", number: "99", size: "L" }),
        entry({
          designId: AWAY._id,
          designTitle: AWAY.title,
          name: "Luongo",
          number: "1",
          size: "M",
        }),
      ],
      [HOME, AWAY],
    );

    expect(groups.map((g) => g.designId)).toEqual([HOME._id, AWAY._id]);
    expect(groups[0].lines.map((l) => l.label)).toEqual(["Gretzky #99"]);
    expect(groups[1].lines.map((l) => l.label)).toEqual(["Luongo #1"]);
  });

  it("follows the order's design sequence, not the entry sequence", () => {
    const groups = rosterLinesByDesign(
      [entry({ designId: AWAY._id, designTitle: AWAY.title }), entry()],
      // The captain listed Away first on the order.
      [AWAY, HOME],
    );

    expect(groups.map((g) => g.designTitle)).toEqual(["Away kit", "Home kit"]);
  });

  it("keeps a design with nothing collected as an empty group", () => {
    const groups = rosterLinesByDesign([entry()], [HOME, AWAY]);

    expect(groups[1].designId).toBe(AWAY._id);
    expect(groups[1].lines).toEqual([]);
    expect(groups[1].total).toBe(0);
  });

  it("keeps blank/bulk lines instead of dropping the nameless ones", () => {
    const groups = rosterLinesByDesign(
      [
        entry({ name: undefined, number: undefined, size: "XL", qty: 4 }),
        entry({ name: "Gretzky", number: "99", size: "L" }),
      ],
      [HOME],
    );

    const blank = groups[0].lines.find((l) => l.label === "Blank");
    expect(blank).toMatchObject({ size: "XL", qty: 4 });
  });

  it("sums the qty of jerseys that are the same slot in the same size", () => {
    // Two fans each ordered #99 Gretzky in L — that's two jerseys to make,
    // one production line. Σ qty is what has to reconcile, not row count.
    const groups = rosterLinesByDesign(
      [
        entry({ size: "L", qty: 1 }),
        entry({ size: "L", qty: 2 }),
        entry({ size: "M", qty: 1 }),
      ],
      [HOME],
    );

    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].lines.find((l) => l.size === "L")?.qty).toBe(3);
    expect(groups[0].lines.find((l) => l.size === "M")?.qty).toBe(1);
  });

  it("drops no jerseys — each group total is Σ qty of its entries", () => {
    const groups = rosterLinesByDesign(
      [
        entry({ size: "L", qty: 2 }),
        entry({ name: "Luongo", number: "1", size: "S", qty: 1 }),
        entry({ name: undefined, number: undefined, size: "XL", qty: 5 }),
      ],
      [HOME],
    );

    expect(groups[0].total).toBe(8);
    expect(groups[0].lines.reduce((sum, l) => sum + l.qty, 0)).toBe(8);
  });

  it("sorts by player name with blanks last, then by size", () => {
    const groups = rosterLinesByDesign(
      [
        entry({ name: undefined, number: undefined, size: "M" }),
        entry({ name: "Sosa", number: "25", size: "S" }),
        entry({ name: "Gretzky", number: "99", size: "XL" }),
        entry({ name: "Gretzky", number: "99", size: "S" }),
      ],
      [HOME],
    );

    expect(groups[0].lines.map((l) => `${l.label} ${l.size}`)).toEqual([
      "Gretzky #99 S",
      "Gretzky #99 XL",
      "Sosa #25 S",
      "Blank M",
    ]);
  });

  it("ignores entries on a design the order no longer carries", () => {
    // Removed designs stay readable in their own section (O-08); they must
    // not leak into a linked design's roster or inflate its total.
    const groups = rosterLinesByDesign(
      [
        entry(),
        entry({ designId: "design_gone", designTitle: "Warmup", qty: 7 }),
      ],
      [HOME],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(1);
  });
});

// The unified read (M-01): what `rosterEntries.listForRun` hands back once
// it carries each slot's ordered sizes and the run's unattached blank lines.
// Unlike `rosterLinesByDesign` — which only ever sees jerseys people ordered
// — this starts from the *roster*, so a seeded player nobody ordered for is
// a row with total 0 rather than an absence.
function slot(overrides: Partial<RosterSlotRead> = {}): RosterSlotRead {
  return {
    _id: "slot_gretzky",
    name: "Gretzky",
    number: "99",
    source: "captain",
    filled: false,
    collision: false,
    sizes: [],
    total: 0,
    ...overrides,
  };
}

function designRead(
  overrides: Partial<DesignRosterRead> = {},
): DesignRosterRead {
  return {
    designId: HOME._id,
    title: HOME.title,
    entries: [],
    blankSizes: [],
    ...overrides,
  };
}

describe("rosterRowsByDesign", () => {
  it("keeps a seeded slot nobody has ordered for as an unfilled row", () => {
    const [home] = rosterRowsByDesign([
      designRead({ entries: [slot()] }),
    ]);

    expect(home.rows).toHaveLength(1);
    expect(home.rows[0]).toMatchObject({
      label: "Gretzky #99",
      filled: false,
      blank: false,
      sizes: [],
      total: 0,
    });
    expect(home.total).toBe(0);
  });

  it("carries a filled slot's sizes and Σ qty", () => {
    // Two fans claimed #99 — one in L, one in M. Two jerseys, one slot.
    const [home] = rosterRowsByDesign([
      designRead({
        entries: [
          slot({
            filled: true,
            sizes: [
              { size: "M", qty: 1 },
              { size: "L", qty: 1 },
            ],
            total: 2,
          }),
        ],
      }),
    ]);

    expect(home.rows[0]).toMatchObject({ filled: true, total: 2 });
    expect(home.rows[0].sizes).toEqual([
      { size: "M", qty: 1 },
      { size: "L", qty: 1 },
    ]);
    expect(home.total).toBe(2);
  });

  it("gives the design's blank/bulk lines their own row, last", () => {
    const [home] = rosterRowsByDesign([
      designRead({
        entries: [slot({ filled: true, sizes: [{ size: "L", qty: 1 }], total: 1 })],
        blankSizes: [{ size: "XL", qty: 3 }],
      }),
    ]);

    expect(home.rows.map((r) => r.label)).toEqual(["Gretzky #99", "Blank"]);
    const blank = home.rows[1];
    expect(blank).toMatchObject({ blank: true, filled: true, total: 3 });
    // A blank line is a jersey somebody asked for — it counts.
    expect(home.total).toBe(4);
  });

  it("renders no blank row when the design has no unattached jerseys", () => {
    const [home] = rosterRowsByDesign([designRead({ entries: [slot()] })]);
    expect(home.rows.some((r) => r.blank)).toBe(false);
  });

  it("keeps the roster in the order the read handed it over", () => {
    // Creation order, matching the sheet — the card and the editor must not
    // disagree about who comes first.
    const [home] = rosterRowsByDesign([
      designRead({
        entries: [
          slot({ _id: "s3", name: "Sosa", number: "25" }),
          slot({ _id: "s1", name: "Gretzky", number: "99" }),
          slot({ _id: "s2", name: "Luongo", number: "1" }),
        ],
      }),
    ]);

    expect(home.rows.map((r) => r.label)).toEqual([
      "Sosa #25",
      "Gretzky #99",
      "Luongo #1",
    ]);
  });

  it("keeps every design, including one with no roster at all", () => {
    const views = rosterRowsByDesign([
      designRead({ entries: [slot()] }),
      designRead({ designId: AWAY._id, title: AWAY.title }),
    ]);

    expect(views.map((v) => v.designTitle)).toEqual(["Home kit", "Away kit"]);
    expect(views[1].rows).toEqual([]);
    expect(views[1].total).toBe(0);
  });

  it("reconciles each design's total with countsByRun's Σ qty", () => {
    // The numbers `orderEntries.countsByRun` would report for this run:
    // home 6 (4 on slots, 2 blank), away 1.
    const byDesign = new Map([
      [HOME._id, 6],
      [AWAY._id, 1],
    ]);
    const views = rosterRowsByDesign([
      designRead({
        entries: [
          slot({ filled: true, sizes: [{ size: "L", qty: 3 }], total: 3 }),
          slot({ _id: "s2", name: "Sosa", number: "25", filled: true, sizes: [{ size: "S", qty: 1 }], total: 1 }),
          // Seeded, unordered — contributes nothing to the total.
          slot({ _id: "s3", name: "Bure", number: "10" }),
        ],
        blankSizes: [{ size: "XL", qty: 2 }],
      }),
      designRead({
        designId: AWAY._id,
        title: AWAY.title,
        entries: [
          slot({ _id: "s4", filled: true, sizes: [{ size: "M", qty: 1 }], total: 1 }),
        ],
      }),
    ]);

    for (const view of views) {
      expect(view.total).toBe(byDesign.get(view.designId));
      expect(view.rows.reduce((sum, r) => sum + r.total, 0)).toBe(view.total);
    }
  });

  it("gives every row a key that is stable and unique within the design", () => {
    const [home] = rosterRowsByDesign([
      designRead({
        entries: [slot({ _id: "s1" }), slot({ _id: "s2", name: "Sosa" })],
        blankSizes: [{ size: "M", qty: 1 }],
      }),
    ]);

    expect(new Set(home.rows.map((r) => r.key)).size).toBe(3);
  });
});

describe("sizeTally", () => {
  it("sums qty per size across every design", () => {
    expect(
      sizeTally([
        entry({ size: "M", qty: 2 }),
        entry({ designId: AWAY._id, size: "M", qty: 3 }),
        entry({ size: "S", qty: 1 }),
      ]),
    ).toEqual([
      { size: "S", qty: 1 },
      { size: "M", qty: 5 },
    ]);
  });

  it("returns sizes in canonical order, not first-seen order", () => {
    expect(
      sizeTally([
        entry({ size: "XL" }),
        entry({ size: "S" }),
        entry({ size: "2XL" }),
        entry({ size: "M" }),
      ]).map((s) => s.size),
    ).toEqual(["S", "M", "XL", "2XL"]);
  });

  it("tallies one design's entries when handed just those", () => {
    // C-02 reuses this per design; the function stays entry-array-shaped.
    const home = entriesForDesigns(
      [entry({ size: "L" }), entry({ designId: AWAY._id, size: "S" })],
      [HOME],
    );

    expect(sizeTally(home)).toEqual([{ size: "L", qty: 1 }]);
  });

  it("is empty for an empty roster", () => {
    expect(sizeTally([])).toEqual([]);
  });
});

describe("jerseysByFan", () => {
  function fan(overrides: Partial<FanEntry> = {}): FanEntry {
    return {
      ...entry(),
      submitterName: "Sam Fan",
      submitterEmail: "sam@example.com",
      ...overrides,
    };
  }

  it("gives a fan one group holding every jersey they ordered", () => {
    const groups = jerseysByFan([
      fan({ name: "Kobe", number: "21", size: "M" }),
      fan({ name: "Kobe", number: "21", size: "L" }),
      fan({ name: "Bryant", number: "6", size: "S" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].email).toBe("sam@example.com");
    expect(groups[0].jerseys.map((j) => `${j.label} ${j.size}`)).toEqual([
      "Kobe #21 M",
      "Kobe #21 L",
      "Bryant #6 S",
    ]);
  });

  it("keeps every jersey as its own row rather than collapsing the fan to one line", () => {
    const groups = jerseysByFan([
      fan({ name: "Kobe", number: "21", size: "M" }),
      fan({ name: "Kobe", number: "21", size: "M" }),
    ]);

    expect(groups[0].jerseys).toHaveLength(2);
    expect(new Set(groups[0].jerseys.map((j) => j.key)).size).toBe(2);
  });

  it("reads one fan however they capitalized or padded their email", () => {
    // The submit path stores trim+lowercase (checkSubmitterEmail); grouping
    // has to normalize the same way or a fan splits into two groups.
    const groups = jerseysByFan([
      fan({ submitterEmail: "  SAM@Example.com " }),
      fan({ submitterEmail: "sam@example.com" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].email).toBe("sam@example.com");
    expect(groups[0].jerseys).toHaveLength(2);
  });

  it("splits distinct fans and orders them by name", () => {
    const groups = jerseysByFan([
      fan({ submitterName: "Zoe", submitterEmail: "zoe@example.com" }),
      fan({ submitterName: "Ana", submitterEmail: "ana@example.com" }),
    ]);

    expect(groups.map((g) => g.name)).toEqual(["Ana", "Zoe"]);
  });

  it("totals a fan's jerseys as Σ qty, not row count", () => {
    const groups = jerseysByFan([
      fan({ size: "L", qty: 2 }),
      fan({ name: undefined, number: undefined, size: "XL", qty: 5 }),
    ]);

    expect(groups[0].total).toBe(7);
    expect(groups[0].jerseys[1].label).toBe("Blank");
  });

  it("carries the design each jersey was ordered on", () => {
    const groups = jerseysByFan([
      fan(),
      fan({ designId: AWAY._id, designTitle: AWAY.title }),
    ]);

    expect(groups[0].jerseys.map((j) => j.designTitle)).toEqual([
      "Home kit",
      "Away kit",
    ]);
  });

  it("is empty for an empty run", () => {
    expect(jerseysByFan([])).toEqual([]);
  });
});

describe("entriesForDesigns", () => {
  it("keeps only the entries on the order's current designs", () => {
    const kept = entriesForDesigns(
      [entry(), entry({ designId: "design_gone" })],
      [HOME, AWAY],
    );

    expect(kept).toHaveLength(1);
    expect(kept[0].designId).toBe(HOME._id);
  });
});
