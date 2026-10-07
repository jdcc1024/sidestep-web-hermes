// L-06 acceptance (Q2 = A): `listProblems` is the confirm gate's rule list and
// the phase-2 seam. One rule for now: an item with no size needs one.
import { describe, expect, it } from "vitest";
import { listProblems } from "./checks";
import type { ItemView } from "./summary";

let n = 0;
// A phase-1 item: it may have no size (R2-03: `ItemView.size` is required).
type Item = Omit<ItemView, "size" | "rosterEntryId"> & { size?: string };
function item(o: Partial<Item> = {}): Item {
  n += 1;
  return {
    _id: `i${n}`,
    designId: "d1",
    qty: 1,
    source: "captain",
    customAnswers: {},
    createdAt: n,
    ...o,
  };
}

describe("listProblems (Q2 = A)", () => {
  it("is empty when every item has a size", () => {
    expect(listProblems([item({ size: "M" }), item({ size: "L", qty: 3 })])).toEqual([]);
    expect(listProblems([])).toEqual([]);
  });

  it("reports one needs-size problem per item without a size, labelled like the list", () => {
    const problems = listProblems([
      item({ name: "Jordan Lee", number: "4" }),
      item({ name: "Riley Park", number: "7", size: "M" }),
      item({ name: "Sam Ortiz", number: "11" }),
      item({}),
    ]);
    expect(problems).toHaveLength(3);
    expect(problems.every((p) => p.rule === "needs-size")).toBe(true);
    expect(problems.map((p) => p.label)).toEqual([
      "Jordan Lee #4",
      "Sam Ortiz #11",
      "No name",
    ]);
  });
});
