// The public order form's "type your own name" card (R2-05): one name +
// number on one design, with a count per size. On submit the card expands to
// one `submitOrder` line per (size, qty); lines sharing a name + number +
// design land on one player server-side, so no grouping happens here.
// Pure, so the component stays a thin view over these rules.

import { MAX_QTY, checkQty, checkSize } from "./rules";
import type { CheckResult } from "./rules";

// size -> qty; a missing size or 0 means "not picked".
export type CardSizes = Record<string, number>;

export type JerseyCard = {
  designId: string;
  name: string;
  number: string;
  sizes: CardSizes;
};

export type CardLine = {
  designId: string;
  name: string;
  number: string;
  size: string;
  qty: number;
};

// Lines come out in `sizeOptions` order (canonical when the caller passes
// sorted options), whatever order the sizes were tapped in. Name and number
// pass through untouched: trimming and blank handling stay with the caller.
export function cardToLines(
  card: JerseyCard,
  sizeOptions: readonly string[],
): CheckResult<CardLine[]> {
  for (const [size, qty] of Object.entries(card.sizes)) {
    if (qty === 0) continue;
    const sizeCheck = checkSize(size, sizeOptions);
    if (!sizeCheck.ok) return sizeCheck;
    const qtyCheck = checkQty(qty);
    if (!qtyCheck.ok) return qtyCheck;
  }

  const lines = sizeOptions
    .filter((size) => (card.sizes[size] ?? 0) > 0)
    .map((size) => ({
      designId: card.designId,
      name: card.name,
      number: card.number,
      size,
      qty: card.sizes[size],
    }));
  if (lines.length === 0)
    return { ok: false, error: "Pick at least one size." };
  return { ok: true, value: lines };
}

// Jerseys on one card: Σ qty across its sizes.
export function cardJerseyCount(sizes: CardSizes): number {
  return Object.values(sizes).reduce((sum, qty) => sum + qty, 0);
}

// One tap on a size's counter. Capped at MAX_QTY, the same cap `checkQty`
// enforces, so a tap can never make the card invalid.
export function addOneSize(sizes: CardSizes, size: string): CardSizes {
  const qty = sizes[size] ?? 0;
  if (qty >= MAX_QTY) return sizes;
  return { ...sizes, [size]: qty + 1 };
}

// One tap on a size's `−`. A size that drops to 0 leaves the record, so a
// card's sizes only ever hold picked sizes.
export function removeOneSize(sizes: CardSizes, size: string): CardSizes {
  const qty = sizes[size] ?? 0;
  if (qty <= 1) {
    if (!(size in sizes)) return sizes;
    const rest = { ...sizes };
    delete rest[size];
    return rest;
  }
  return { ...sizes, [size]: qty - 1 };
}
