// The confirm gate (L-06, Q2 = A): what has to be true of an order's live
// items before JCC can confirm the order size. A list of rule functions, so
// phase 2 adds a rule rather than a branch. Pure; the caller loads the items.

import { itemLabel } from "./label";
import type { ItemView } from "./summary";

export type Problem = { rule: "needs-size"; label: string };

type CheckedItem = Pick<ItemView, "name" | "number" | "size">;
type Rule = (item: CheckedItem) => Problem | null;

const needsSize: Rule = (item) =>
  item.size ? null : { rule: "needs-size", label: itemLabel(item) };

const RULES: Rule[] = [needsSize];

export function listProblems(items: CheckedItem[]): Problem[] {
  const problems: Problem[] = [];
  for (const item of items) {
    for (const rule of RULES) {
      const problem = rule(item);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

const NAMED_LIMIT = 5;

// `2 items need a size: Jordan Lee #4, Sam Ortiz #11`; past five names,
// `…, Player5 #5 and 2 more`. Admin copy, shown on the stage checklist.
export function needsSizeMessage(problems: Problem[]): string {
  const labels = problems
    .filter((p) => p.rule === "needs-size")
    .map((p) => p.label);
  const n = labels.length;
  const named = labels.slice(0, NAMED_LIMIT).join(", ");
  const rest = n - NAMED_LIMIT;
  const tail = rest > 0 ? ` and ${rest} more` : "";
  return `${n} ${n === 1 ? "item needs" : "items need"} a size: ${named}${tail}`;
}
