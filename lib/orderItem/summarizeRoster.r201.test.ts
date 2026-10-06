// R2-01 acceptance tests (initiative 0004, phase 1b): `summarizeRoster`, the
// pure read model over roster entries + their size lines.
// Spec: backlog/R2-01-roster-entries-model.md (Logic: summarizeRoster),
// docs/architecture/0004-roster-sizes.md "Reads". Written before the build:
// fails because `summarizeRoster` is not exported yet.
import { describe, expect, it } from "vitest";
import { summarizeRoster } from "./summary";

type Entry = Parameters<typeof summarizeRoster>[0][number];
type Line = Parameters<typeof summarizeRoster>[1][number];

const HOME = "design_home";
const AWAY = "design_away";
const GONE = "design_unlinked";
const opts = {
  designIds: [HOME, AWAY],
  titles: { [HOME]: "Home", [AWAY]: "Away", [GONE]: "Old" },
} as never;

let n = 0;
function entry(o: Partial<Entry> & { designId?: string } = {}): Entry {
  n += 1;
  return {
    _id: `e${n}`,
    designId: HOME,
    source: "captain",
    createdAt: 1000 + n,
    ...o,
  } as Entry;
}
function line(entryId: string, o: Partial<Line> = {}): Line {
  n += 1;
  return {
    _id: `i${n}`,
    rosterEntryId: entryId,
    size: "M",
    qty: 1,
    source: "captain",
    createdAt: 2000 + n,
    ...o,
  } as Line;
}

describe("jerseyCount = sum of live item qty on linked designs", () => {
  it("counts qty, not lines, and leaves unlinked designs out of totals", () => {
    const sidestep = entry({ name: "Sidestep", number: "72" });
    const riley = entry({ name: "Riley", number: "7", designId: AWAY });
    const old = entry({ name: "Old", number: "1", designId: GONE });
    const items = [
      line(sidestep._id, { size: "S", qty: 1 }),
      line(sidestep._id, { size: "M", qty: 3 }),
      line(sidestep._id, { size: "XL", qty: 1 }),
      line(riley._id, { size: "L", qty: 2 }),
      line(old._id, { size: "L", qty: 9 }),
    ];
    const out = summarizeRoster([sidestep, riley, old], items, opts);
    const home = out.designs.find((d) => d.designId === HOME)!;
    const away = out.designs.find((d) => d.designId === AWAY)!;
    expect(home.summary.jerseyCount).toBe(5);
    expect(away.summary.jerseyCount).toBe(2);
    expect(out.summary.jerseyCount).toBe(7);
    expect(out.summary.bySize.map((s) => [s.size, s.qty]).sort()).toEqual(
      [["L", 2], ["M", 3], ["S", 1], ["XL", 1]].sort(),
    );
  });

  it("aggregates a player's sizes into one chip each and keeps one PlayerView", () => {
    const e = entry({ name: "Sidestep", number: "72" });
    const out = summarizeRoster(
      [e],
      [
        line(e._id, { size: "M", qty: 1 }),
        line(e._id, { size: "M", qty: 2 }),
        line(e._id, { size: "S", qty: 1 }),
      ],
      opts,
    );
    const players = out.designs[0].players;
    expect(players).toHaveLength(1);
    expect(players[0].entryId).toBe(e._id);
    expect(players[0].jerseyCount).toBe(4);
    expect(players[0].needsSizes).toBe(false);
    const bySize = Object.fromEntries(players[0].sizes.map((s) => [s.size, s.qty]));
    expect(bySize).toEqual({ M: 3, S: 1 });
  });
});

describe("needsSizes counts named entries with no live items", () => {
  it("counts players, not quantity; a sized player does not count", () => {
    const sized = entry({ name: "Sam", number: "9" });
    const bare1 = entry({ name: "Jordan Lee", number: "4" });
    const bare2 = entry({ name: "Mo", number: "88" });
    const out = summarizeRoster(
      [sized, bare1, bare2],
      [line(sized._id)],
      opts,
    );
    expect(out.designs[0].summary.needsSizes).toBe(2);
    expect(out.summary.needsSizes).toBe(2);
    const flagged = out.designs[0].players.filter((p) => p.needsSizes);
    expect(flagged.map((p) => p.entryId).sort()).toEqual(
      [bare1._id, bare2._id].sort(),
    );
    // a player with no sizes adds nothing to the jersey count
    expect(out.summary.jerseyCount).toBe(1);
  });
});

describe("a blank entry is not a player", () => {
  it("is excluded from playerCount and needsSizes, but its jerseys still count", () => {
    const blankBare = entry({ designId: HOME });
    const blankSized = entry({ designId: AWAY });
    const named = entry({ name: "Sam", number: "9" });
    const out = summarizeRoster(
      [blankBare, blankSized, named],
      [line(named._id), line(blankSized._id, { qty: 4 })],
      opts,
    );
    expect(out.summary.playerCount).toBe(1);
    expect(out.summary.needsSizes).toBe(0);
    expect(out.summary.jerseyCount).toBe(5);
  });
});

describe("two submitters on one player stay one PlayerView with both lines", () => {
  it("keeps both emails in `lines` and never adds a collision field", () => {
    const e = entry({ name: "Sidestep", number: "72" });
    const out = summarizeRoster(
      [e],
      [
        line(e._id, {
          size: "M",
          source: "fan",
          submitterName: "Pat",
          submitterEmail: "pat@example.com",
        }),
        line(e._id, {
          size: "L",
          source: "fan",
          submitterName: "Sam",
          submitterEmail: "sam@example.com",
        }),
      ],
      opts,
    );
    const players = out.designs[0].players;
    expect(players).toHaveLength(1);
    expect(players[0].lines.map((l) => l.submitterEmail).sort()).toEqual([
      "pat@example.com",
      "sam@example.com",
    ]);
    expect(players[0].lines.map((l) => l.itemId)).toHaveLength(2);
    expect(players[0]).not.toHaveProperty("collision");
    for (const item of out.designs[0].items)
      expect(item).not.toHaveProperty("collision", true);
  });
});

describe("designs[].items flattens size lines with the player's values", () => {
  it("one ItemView per line, carrying name, number, letter and rosterEntryId", () => {
    const e = entry({ name: "Sidestep", number: "72", designation: "C" });
    const l1 = line(e._id, { size: "S", qty: 1 });
    const l2 = line(e._id, { size: "M", qty: 3 });
    const out = summarizeRoster([e], [l1, l2], opts);
    const items = out.designs[0].items;
    expect(items.map((i) => i._id).sort()).toEqual([l1._id, l2._id].sort());
    for (const i of items) {
      expect(i.name).toBe("Sidestep");
      expect(i.number).toBe("72");
      expect(i.designation).toBe("C");
      expect(i.designId).toBe(HOME);
      expect((i as { rosterEntryId?: string }).rosterEntryId).toBe(e._id);
    }
  });

  it("ignores a line whose entry is not in the list instead of throwing", () => {
    const e = entry({ name: "Sam", number: "9" });
    expect(() =>
      summarizeRoster([e], [line("missing_entry"), line(e._id)], opts),
    ).not.toThrow();
    const out = summarizeRoster([e], [line("missing_entry"), line(e._id)], opts);
    expect(out.summary.jerseyCount).toBe(1);
  });
});
