// How an order item reads on the captain's list (L-03, UX §4): the row's
// label, the "Added by" credit under it, and the sentence its removal toasts.
// Pure, so the row, the sheet, the Undo toast and the row menu's accessible
// name all say the same thing about the same item.

import type { ItemView, PlayerLine, PlayerView } from "./summary";

type Labelled = Pick<ItemView, "name" | "number">;

// `<Name> #<Number>`, either half alone, or `No name` for a bulk line that
// carries neither.
export function itemLabel({ name, number }: Labelled): string {
  const parts = [name?.trim(), number?.trim() ? `#${number.trim()}` : null];
  return parts.filter(Boolean).join(" ") || "No name";
}

// Whoever sent the item through the order form, by first name; the captain's
// own items read as theirs. A captain-seeded item a player filled in (fixed
// names mode) carries the player as submitter, so it credits the player.
export function itemAddedBy(
  item: Pick<ItemView, "submitterName" | "submitterEmail">,
): string {
  if (!item.submitterEmail && !item.submitterName) return "Added by you";
  const first = item.submitterName?.trim().split(/\s+/)[0];
  return first ? `Added by ${first}` : "Added by a player";
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

// `S×1 M×2 …`, the chip text and the footer's run of sizes.
export function sizeChip({ size, qty }: { size: string; qty: number }): string {
  return `${size}×${qty}`;
}

export function itemCountText(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
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

// `M×3`, or `S` alone for one: the row chips and the match notice.
export function sizeQtyText({ size, qty }: { size: string; qty: number }): string {
  return qty > 1 ? `${size}×${qty}` : size;
}

// One group of a player's lines per person who sent them: the captain's own
// lines (no submitter) are "you", a player's are keyed by email. In order of
// each person's first line, the captain first. "Added by" and the sheet's
// "Sizes added by" both read this, so they name the same people.
export type LineSender<L extends AddedByLine = AddedByLine> = {
  key: string;
  isYou: boolean;
  name?: string;
  email?: string;
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
    byKey.set(key, sender);
  }
  const senders = [...byKey.values()];
  return [...senders.filter((s) => s.isYou), ...senders.filter((s) => !s.isYou)];
}

// `Added by you and Riley`: every distinct person behind a player's lines,
// by first name. A player with no lines yet credits whoever created it.
export function playerAddedBy(
  player: Pick<PlayerView, "source"> & { lines: readonly AddedByLine[] },
): string {
  const senders = sendersOf(player.lines);
  if (senders.length === 0)
    return player.source === "captain" ? "Added by you" : "Added by a player";
  const names = senders.map((s) =>
    s.isYou ? "you" : (s.name?.trim().split(/\s+/)[0] ?? "a player"),
  );
  return `Added by ${joinNames(names)}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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
