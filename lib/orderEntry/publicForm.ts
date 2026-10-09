// What the public order form derives for display (0004 R3-01): the
// pick-your-name rows (a slot's picked sizes, the row's accessible name, which
// row is open) and which picture block the header shows. Pure, so the
// component stays a view over these rules.

import { isWebSafeImage } from "../designAsset";
import { sizeQtyText } from "../orderItem/label";

// The form keeps a pick-your-name pick as one line per (slot × size), with
// qty as the string the form field holds.
type PickLine = { rosterEntryId: string; size: string; qty: string };

export type PickedSize = { size: string; qty: number };

export function lineQty(
  lines: readonly PickLine[],
  rosterEntryId: string,
  size: string,
): number {
  const line = lines.find(
    (l) => l.rosterEntryId === rosterEntryId && l.size === size,
  );
  if (!line) return 0;
  const n = Number.parseInt(line.qty, 10);
  return Number.isFinite(n) ? n : 0;
}

// One slot's picks in `sizeOrder` (pass the sorted catalog), so a collapsed
// row's chips read S, M, XL whatever order they were tapped in.
export function pickedSizes(
  lines: readonly PickLine[],
  rosterEntryId: string,
  sizeOrder: readonly string[],
): PickedSize[] {
  return sizeOrder
    .map((size) => ({ size, qty: lineQty(lines, rosterEntryId, size) }))
    .filter((picked) => picked.qty > 0);
}

// `Sidestep, number 72, S×1, M×2` or `Avery Quinn, number 7, no sizes yet`
// (UX §5). The row button's name, so a screen reader hears the whole row,
// including a name the row truncates.
export function rosterRowLabel(
  slot: { name: string; number?: string },
  picked: readonly PickedSize[],
): string {
  const number = slot.number?.trim();
  const sizes = picked.length
    ? picked.map(sizeQtyText).join(", ")
    : "no sizes yet";
  return [slot.name, number ? `number ${number}` : null, sizes]
    .filter(Boolean)
    .join(", ");
}

// One row open at a time (UX §4.4): tapping a row opens it and closes
// whichever was open; tapping the open row closes it.
export function toggleOpenRow(
  open: string | null,
  tapped: string,
): string | null {
  return open === tapped ? null : tapped;
}

type PictureDesign<D> = D & {
  title: string;
  mainImage: { url: string | null; contentType: string } | null;
};

export type PictureBlock<D> =
  | { kind: "single"; design: PictureDesign<D> }
  | { kind: "designLine"; title: string }
  | { kind: "tiles" }
  | { kind: "none" };

function isDrawable(design: PictureDesign<unknown>): boolean {
  return (
    !!design.mainImage?.url && isWebSafeImage(design.mainImage.contentType)
  );
}

// What sits under the form's intro (UX §4.5). One design: its picture, or a
// `Design: <title>` line when it has none. 2+ designs: a tile per design
// (placeholders keep the row even) as long as at least one can be drawn,
// otherwise nothing; the chooser already names every design.
export function pictureBlock<D>(
  designs: readonly PictureDesign<D>[],
): PictureBlock<D> {
  if (designs.length === 1) {
    const [design] = designs;
    return isDrawable(design)
      ? { kind: "single", design }
      : { kind: "designLine", title: design.title };
  }
  if (designs.some(isDrawable)) return { kind: "tiles" };
  return { kind: "none" };
}
