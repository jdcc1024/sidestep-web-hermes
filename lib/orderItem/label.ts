// How an order item reads on the captain's list (L-03, UX §4): the row's
// label, the "Added by" credit under it, and the sentence its removal toasts.
// Pure, so the row, the sheet, the Undo toast and the row menu's accessible
// name all say the same thing about the same item.

import type { ItemView } from "./summary";

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

export function removedItemMessage(
  item: Labelled & Pick<ItemView, "size">,
): string {
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
