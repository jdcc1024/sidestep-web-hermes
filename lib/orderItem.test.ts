// L-01 acceptance tests for the pure order-item lib (initiative 0004):
// `checkItemName` / `checkItemSize` (lib/orderItem/rules.ts) and the single
// read model `summarize` (lib/orderItem/summary.ts), both re-exported from
// lib/orderItem/index.ts. Spec: backlog/L-01-order-items-table-and-api.md,
// docs/architecture/0004-order-items.md "Must answer 5", UX §7.5/§7.6/§7.9.
import { describe, expect, it } from "vitest";
import { SIZE_OPTIONS } from "./orderForm/rules";
import { checkItemName, checkItemSize, summarize } from "./orderItem";

// ── rules ──────────────────────────────────────────────────────────────────

describe("checkItemName: optional, trimmed, blank → undefined, ≤ 80", () => {
  it("trims a name", () => {
    expect(checkItemName("  Jordan Lee ")).toEqual({
      ok: true,
      value: "Jordan Lee",
    });
  });

  it("treats blank and missing as no name (a jersey with no name is allowed)", () => {
    expect(checkItemName("")).toEqual({ ok: true, value: undefined });
    expect(checkItemName("   ")).toEqual({ ok: true, value: undefined });
    expect(checkItemName(undefined)).toEqual({ ok: true, value: undefined });
  });

  it("accepts 80 characters and rejects 81 with a message", () => {
    expect(checkItemName("x".repeat(80))).toEqual({
      ok: true,
      value: "x".repeat(80),
    });
    const tooLong = checkItemName("x".repeat(81));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toMatch(/80/);
  });
});

describe("checkItemSize(value, allowed, current?): blank → none; otherwise in allowed or equal to current", () => {
  const allowed = SIZE_OPTIONS;

  it("treats blank and missing as no size (Needs size)", () => {
    expect(checkItemSize(undefined, allowed)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(checkItemSize("", allowed)).toEqual({ ok: true, value: undefined });
    expect(checkItemSize("  ", allowed)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("accepts every catalogue size", () => {
    for (const size of SIZE_OPTIONS)
      expect(checkItemSize(size, allowed)).toEqual({ ok: true, value: size });
  });

  it("rejects a size outside the catalogue", () => {
    const result = checkItemSize("XXXXL", allowed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("keeps a legacy size only when it is the item's current value", () => {
    expect(checkItemSize("XXL", allowed, "XXL")).toEqual({
      ok: true,
      value: "XXL",
    });
    expect(checkItemSize("XXL", allowed, "M").ok).toBe(false);
    expect(checkItemSize("XXL", allowed).ok).toBe(false);
  });

  it("checks against the list it is given (a form's narrower sizeOptions)", () => {
    expect(checkItemSize("XL", ["S", "M", "L"]).ok).toBe(false);
    expect(checkItemSize("M", ["S", "M", "L"])).toEqual({
      ok: true,
      value: "M",
    });
  });
});

// ── summarize ──────────────────────────────────────────────────────────────

type TestItem = {
  _id: string;
  designId: string;
  name?: string;
  number?: string;
  designation?: "C" | "A";
  size?: string;
  qty: number;
  source: "captain" | "fan";
  submitterName?: string;
  submitterEmail?: string;
  customAnswers?: Record<string, string>;
  createdAt: number;
};

let seq = 0;
function item(overrides: Partial<TestItem> & { designId: string }): TestItem {
  seq += 1;
  return {
    _id: `item_${seq}`,
    qty: 1,
    source: "captain",
    createdAt: 1_000 + seq,
    ...overrides,
  };
}

const HOME = "design_home";
const AWAY = "design_away";
const OLD = "design_old";
const titles: Record<string, string> = {
  [HOME]: "Home Kit",
  [AWAY]: "Away Kit",
  [OLD]: "Old Kit",
};

describe("summarize: itemCount = Σ qty of sized items, needsSize = Σ qty of unsized, bySize via sortSizes (§7.5, §7.9)", () => {
  it("counts per design and overall, unsized items apart from the total", () => {
    const items = [
      item({ designId: HOME, name: "A", size: "L", qty: 1 }),
      item({ designId: HOME, name: "B", size: "M", qty: 2 }),
      item({ designId: HOME, name: "Jordan Lee", number: "4" }), // Needs size
      item({ designId: AWAY, size: "XS", qty: 3 }),
      item({ designId: AWAY, size: "M", qty: 1 }),
      item({ designId: AWAY, qty: 2 }), // Needs size, blank, ×2
    ];

    const result = summarize(items, {
      designIds: [HOME, AWAY],
      titles,
      namesMode: "open",
    });

    expect(result.designs.map((d) => d.designId)).toEqual([HOME, AWAY]);
    expect(result.designs.map((d) => d.title)).toEqual([
      "Home Kit",
      "Away Kit",
    ]);

    const [home, away] = result.designs;
    expect(home.summary).toEqual({
      itemCount: 3,
      needsSize: 1,
      bySize: [
        { size: "M", qty: 2 },
        { size: "L", qty: 1 },
      ],
    });
    expect(away.summary).toEqual({
      itemCount: 4,
      needsSize: 2,
      bySize: [
        { size: "XS", qty: 3 },
        { size: "M", qty: 1 },
      ],
    });
    expect(result.summary).toEqual({
      itemCount: 7,
      needsSize: 3,
      bySize: [
        { size: "XS", qty: 3 },
        { size: "M", qty: 3 },
        { size: "L", qty: 1 },
      ],
    });
    // The item count always equals the size chips (Q8 = A).
    const chipSum = result.summary.bySize.reduce((s, c) => s + c.qty, 0);
    expect(chipSum).toBe(result.summary.itemCount);
  });

  it("slots a legacy XXL where 2XL goes", () => {
    const result = summarize(
      [
        item({ designId: HOME, size: "3XL" }),
        item({ designId: HOME, size: "XXL" }),
        item({ designId: HOME, size: "S" }),
      ],
      { designIds: [HOME], titles, namesMode: "open" },
    );
    expect(result.summary.bySize.map((c) => c.size)).toEqual([
      "S",
      "XXL",
      "3XL",
    ]);
  });

  it("returns every linked design, even one with no items, with zero counts", () => {
    const result = summarize([], {
      designIds: [HOME, AWAY],
      titles,
      namesMode: null,
    });
    expect(result.designs).toHaveLength(2);
    for (const d of result.designs) {
      expect(d.items).toEqual([]);
      expect(d.summary).toEqual({ itemCount: 0, needsSize: 0, bySize: [] });
    }
    expect(result.summary).toEqual({ itemCount: 0, needsSize: 0, bySize: [] });
    expect(result.removedDesigns).toEqual([]);
  });

  it("sorts items by createdAt, not input order", () => {
    const late = item({ designId: HOME, name: "Late", createdAt: 9_000 });
    const early = item({ designId: HOME, name: "Early", createdAt: 1 });
    const mid = item({ designId: HOME, name: "Mid", createdAt: 5_000 });
    const result = summarize([late, early, mid], {
      designIds: [HOME],
      titles,
      namesMode: "open",
    });
    expect(result.designs[0].items.map((i) => i.name)).toEqual([
      "Early",
      "Mid",
      "Late",
    ]);
  });

  it("passes the item fields through to the view", () => {
    const fan = item({
      designId: HOME,
      name: "Riley",
      number: "7",
      designation: "A",
      size: "M",
      qty: 2,
      source: "fan",
      submitterName: "Riley",
      submitterEmail: "riley@example.com",
      customAnswers: { q1: "yes" },
    });
    const result = summarize([fan], {
      designIds: [HOME],
      titles,
      namesMode: "open",
    });
    expect(result.designs[0].items[0]).toMatchObject({
      _id: fan._id,
      designId: HOME,
      name: "Riley",
      number: "7",
      designation: "A",
      size: "M",
      qty: 2,
      source: "fan",
      submitterName: "Riley",
      submitterEmail: "riley@example.com",
      customAnswers: { q1: "yes" },
      createdAt: fan.createdAt,
      collision: false,
    });
  });
});

describe("summarize: items on a design not in designIds are excluded from totals and listed in removedDesigns; collision is flagged only in open mode and only across different submitter emails (§7.6 read side, §7.9)", () => {
  it("moves removed-design items out of the totals into removedDesigns", () => {
    const items = [
      item({ designId: HOME, size: "M", qty: 2 }),
      item({
        designId: OLD,
        name: "Ana",
        size: "L",
        qty: 2,
        source: "fan",
        submitterName: "Ana",
        submitterEmail: "ana@example.com",
      }),
      item({
        designId: OLD,
        name: "Ben",
        size: "S",
        qty: 1,
        source: "fan",
        submitterName: "Ben",
        submitterEmail: "ben@example.com",
      }),
    ];
    const result = summarize(items, {
      designIds: [HOME],
      titles,
      namesMode: "open",
    });

    expect(result.designs.map((d) => d.designId)).toEqual([HOME]);
    expect(result.summary.itemCount).toBe(2);
    expect(result.summary.bySize).toEqual([{ size: "M", qty: 2 }]);

    expect(result.removedDesigns).toHaveLength(1);
    const removed = result.removedDesigns[0];
    expect(removed.title).toBe("Old Kit");
    expect(removed.itemCount).toBe(3);
    expect(removed.submitters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "ana@example.com" }),
        expect.objectContaining({ email: "ben@example.com" }),
      ]),
    );
  });

  function pair(
    opts: {
      emails: [string | undefined, string | undefined];
      names?: [string | undefined, string | undefined];
      numbers?: [string | undefined, string | undefined];
      designs?: [string, string];
    },
  ) {
    const names = opts.names ?? ["Jordan Lee", " jordan lee "];
    const numbers = opts.numbers ?? ["4", "4"];
    const designs = opts.designs ?? [HOME, HOME];
    return [0, 1].map((i) =>
      item({
        designId: designs[i],
        name: names[i],
        number: numbers[i],
        size: "M",
        source: "fan",
        submitterName: opts.emails[i] ? `S${i}` : undefined,
        submitterEmail: opts.emails[i],
      }),
    );
  }

  function flags(items: TestItem[], namesMode: "open" | "fixed" | null) {
    const result = summarize(items, {
      designIds: [HOME, AWAY],
      titles,
      namesMode,
    });
    return result.designs.flatMap((d) => d.items.map((i) => i.collision));
  }

  it("flags both items when two different emails share a design + name + number in open mode", () => {
    expect(flags(pair({ emails: ["a@x.com", "b@x.com"] }), "open")).toEqual([
      true,
      true,
    ]);
  });

  it("does not flag the same email twice (one player, two jerseys: Q7)", () => {
    expect(flags(pair({ emails: ["a@x.com", "a@x.com"] }), "open")).toEqual([
      false,
      false,
    ]);
  });

  it("never flags in fixed mode or with no form", () => {
    expect(flags(pair({ emails: ["a@x.com", "b@x.com"] }), "fixed")).toEqual([
      false,
      false,
    ]);
    expect(flags(pair({ emails: ["a@x.com", "b@x.com"] }), null)).toEqual([
      false,
      false,
    ]);
  });

  it("does not flag same name with a different number (two players: Q7)", () => {
    expect(
      flags(
        pair({ emails: ["a@x.com", "b@x.com"], numbers: ["4", "5"] }),
        "open",
      ),
    ).toEqual([false, false]);
  });

  it("does not flag the same key on different designs", () => {
    expect(
      flags(
        pair({ emails: ["a@x.com", "b@x.com"], designs: [HOME, AWAY] }),
        "open",
      ),
    ).toEqual([false, false]);
  });

  it("does not flag unnamed items that share a number", () => {
    expect(
      flags(
        pair({
          emails: ["a@x.com", "b@x.com"],
          names: [undefined, undefined],
        }),
        "open",
      ),
    ).toEqual([false, false]);
  });
});
