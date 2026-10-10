// How an order item reads on the captain's list (L-03, UX §4): the row's
// label, its size counts, and the sentence its removal toasts. Pure, so the
// row, the sheet, the Undo toast and the row menu's accessible name all say
// the same thing about the same item. Who sent a player's sizes shows in the
// sheet only (0004 size chips §5), via `sendersOf`.

import type { ItemView, PlayerLine, PlayerView } from "./summary";

type Labelled = Pick<ItemView, "name" | "number">;

// `<Name> #<Number>`, either half alone, or `No name` for a bulk line that
// carries neither.
export function itemLabel({ name, number }: Labelled): string {
  const parts = [name?.trim(), number?.trim() ? `#${number.trim()}` : null];
  return parts.filter(Boolean).join(" ") || "No name";
}

// Sent through the order form, so the edit sheet shows who and what they
// answered.
export function isPlayerItem(
  item: Pick<ItemView, "source" | "submitterEmail">,
): boolean {
  return item.source === "fan" || item.submitterEmail !== undefined;
}

export function removedItemMessage(item: Labelled & { size?: string }): string {
  const label = itemLabel(item);
  return item.size ? `Removed ${label} (${item.size})` : `Removed ${label}`;
}

// ── Players (0004 phase 1b, R2-02) ─────────────────────────────────────────
// On screen a roster entry is a "player" and counts are "jerseys" (Gate 1b
// Q1/Q2).

type PlayerLabelled = Pick<PlayerView, "name" | "number">;
type AddedByLine = Pick<
  PlayerLine,
  "source" | "submitterName" | "submitterEmail" | "createdAt"
>;

export function jerseyCountText(count: number): string {
  return `${count} jersey${count === 1 ? "" : "s"}`;
}

export function playerCountText(count: number): string {
  return `${count} player${count === 1 ? "" : "s"}`;
}

// A player's row label: `<Name> #<Number>`, or `Blank jerseys` for the
// design's one entry with nothing printed.
export function playerLabel(player: PlayerLabelled): string {
  return isBlankPlayer(player) ? "Blank jerseys" : itemLabel(player);
}

export function isBlankPlayer({ name, number }: PlayerLabelled): boolean {
  return !name?.trim() && !number?.trim();
}

// `M×3`, and `S×1` for one (0004 size chips §6): one rule for a size with
// its count everywhere, so the row, the breakdown, the footer, the sheet and
// the notices all read the same. `<SizeQty>` renders this text, styled.
export function sizeQtyText({ size, qty }: { size: string; qty: number }): string {
  return `${size}×${qty}`;
}

export const sizeChip = sizeQtyText;

// One group of a player's lines per person who sent them: the captain's own
// lines (no submitter) are "you", a player's are keyed by email. In order of
// each person's first line, the captain first. The sheet's "Sizes added by"
// reads this.
//
// A named sender came `via` the order form or a pasted list's "Ordered by"
// column (R3-04). Decided from `source` and email only, never the name: a
// paste can set a name, but only the form writes `source: "fan"` or an email.
export type LineSender<L extends AddedByLine = AddedByLine> = {
  key: string;
  isYou: boolean;
  name?: string;
  email?: string;
  via?: "form" | "paste";
  lines: L[];
};

export function sendersOf<L extends AddedByLine>(
  lines: readonly L[],
): LineSender<L>[] {
  const byKey = new Map<string, LineSender<L>>();
  const sorted = [...lines].sort((a, b) => a.createdAt - b.createdAt);
  for (const line of sorted) {
    const isYou = !line.submitterEmail && !line.submitterName;
    const key = isYou
      ? "you"
      : (line.submitterEmail ?? `name:${line.submitterName}`);
    const sender = byKey.get(key) ?? {
      key,
      isYou,
      name: line.submitterName,
      email: line.submitterEmail,
      lines: [],
    };
    sender.lines.push(line);
    if (!isYou)
      sender.via =
        sender.via === "form" || isPlayerItem(line) ? "form" : "paste";
    byKey.set(key, sender);
  }
  const senders = [...byKey.values()];
  return [...senders.filter((s) => s.isYou), ...senders.filter((s) => !s.isYou)];
}

// `Removed Sidestep #72 (5 jerseys)`, or `Removed Jordan Lee #4` for a player
// with no sizes yet. The Undo toast.
export function removedPlayerMessage(
  player: PlayerLabelled & Pick<PlayerView, "jerseyCount">,
): string {
  const label = playerLabel(player);
  return player.jerseyCount > 0
    ? `Removed ${label} (${jerseyCountText(player.jerseyCount)})`
    : `Removed ${label}`;
}
