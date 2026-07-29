// The mirror (M-04): a home and an away kit carry the same fifteen people,
// so one design's slots seed another's in a single action. Pure and DOM-free
// like the paste parser beside it — the mutation decides what to write with
// this function, and the sheet renders the outcome with the message below,
// so what the captain is told is what the server actually did.
//
// Slots only, never sizes or order entries: copying jerseys would fabricate
// production nobody asked for (PRD §6). The copy is purely additive — this
// plan only ever *adds*, so there is no path here that touches an existing
// target slot or the jerseys hanging off it.

import { rosterSlotKey } from "./rules";

export type RosterCopySlot = {
  name: string;
  number?: string;
};

export type RosterCopyPlan = {
  // Exactly what to insert on the target, in source order.
  additions: { name: string; number: string | undefined }[];
  copied: number;
  // Source slots the target already had — silently skipped, but counted so
  // the captain hears about them.
  skipped: number;
};

// What copying `source`'s slots onto `target` would create. Dedupe is
// `rosterSlotKey` — the same normalization the fan-attach path matches on
// (R-02), which is the point: a duplicate slot would split one player's
// future orders across two rows unpredictably.
export function planRosterCopy(
  source: readonly RosterCopySlot[],
  target: readonly RosterCopySlot[],
): RosterCopyPlan {
  const taken = new Set(
    target.map((slot) => rosterSlotKey(slot.name, slot.number)),
  );

  const additions: RosterCopyPlan["additions"] = [];
  let skipped = 0;
  for (const slot of source) {
    const key = rosterSlotKey(slot.name, slot.number);
    // `taken` grows as we go, so a slot repeated within the source itself
    // lands once — nothing dedupes `create`, so a source roster can hold
    // two of the same player, and copying both would defeat the rule above.
    if (taken.has(key)) {
      skipped += 1;
      continue;
    }
    taken.add(key);
    additions.push({ name: slot.name, number: slot.number });
  }

  return { additions, copied: additions.length, skipped };
}

// The outcome, in the captain's words. A re-run that copies nothing is the
// skip rule working correctly, so it reads as reassurance rather than
// failure (PRD §9).
export function describeRosterCopy({
  copied,
  skipped,
}: Pick<RosterCopyPlan, "copied" | "skipped">): string {
  if (copied === 0 && skipped === 0)
    return "Nothing to copy — that design has no players yet.";
  if (copied === 0)
    return skipped === 1
      ? "Nothing to copy — that player is already here."
      : `Nothing to copy — all ${skipped} players are already here.`;
  return skipped === 0
    ? `${copied} copied`
    : `${copied} copied, ${skipped} already there`;
}
