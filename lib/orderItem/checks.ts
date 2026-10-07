// The confirm gate (L-06, Q2 = A): what has to be true of an order before JCC
// can confirm the order size. A list of rule functions, so phase 2 adds a
// rule rather than a branch. Pure; the caller loads the players.

import { itemLabel } from "./label";
import type { ItemView, PlayerView } from "./summary";

export type Problem = { rule: "needs-size"; label: string };

type CheckedPlayer = Pick<PlayerView, "name" | "number" | "needsSizes">;
type PlayerRule = (player: CheckedPlayer) => Problem | null;

// A named player with no live size line (R2-02). A blank entry never "needs
// sizes": `summarizeRoster` only sets the flag on a player with a name or
// number.
const needsSizes: PlayerRule = (player) =>
  player.needsSizes ? { rule: "needs-size", label: itemLabel(player) } : null;

const PLAYER_RULES: PlayerRule[] = [needsSizes];

export function listPlayerProblems(players: CheckedPlayer[]): Problem[] {
  const problems: Problem[] = [];
  for (const player of players) {
    for (const rule of PLAYER_RULES) {
      const problem = rule(player);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

// Phase-1 item rule, pinned by its L-06 acceptance test. Nothing on the
// server calls it since R2-02 moved the gate to players; it goes with the
// flat item fields in R2-03.
type CheckedItem = Pick<ItemView, "name" | "number" | "size">;

export function listProblems(items: CheckedItem[]): Problem[] {
  return items.flatMap((item) =>
    item.size ? [] : [{ rule: "needs-size" as const, label: itemLabel(item) }],
  );
}

const NAMED_LIMIT = 5;

// `2 players need sizes: Jordan Lee #4, Sam #9`; past five names,
// `…, Player5 #5 and 2 more`. Admin copy, shown on the stage checklist.
export function needsSizesMessage(problems: Problem[]): string {
  const labels = problems
    .filter((p) => p.rule === "needs-size")
    .map((p) => p.label);
  const n = labels.length;
  const named = labels.slice(0, NAMED_LIMIT).join(", ");
  const rest = n - NAMED_LIMIT;
  const tail = rest > 0 ? ` and ${rest} more` : "";
  return `${n} ${n === 1 ? "player needs" : "players need"} sizes: ${named}${tail}`;
}
