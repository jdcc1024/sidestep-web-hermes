# Issue: Public order form: several sizes on one jersey card

## Phase: 3

## Type: feature

## Size: M (~6 files, ~$3)

## Description

Initiative 0004, phase 1b. UX: `docs/ux/0004-roster-sizes.md` §8, frame 7.
Design: `docs/architecture/0004-roster-sizes.md` ("Write: the public form").

"Type your own name" mode (`JerseyLine` in `components/run/PublicOrderForm.tsx`):
the single size radio and the Quantity box become the `SizeCounter` grid
(extracted in R2-02), limited to the form's `sizeOptions`. "Add another
jersey" becomes "+ Add a different name or number". The header count is
Σ counters. A card with no sizes shows "Pick at least one size."

On submit, each card expands to one `submitOrder` line per (size, qty). The
server API doesn't change: lines with the same key already land on one entry
(R2-02). Move the card → lines expansion and the per-card validation into
`lib/orderEntry/` (pure) instead of growing the component (the R-09
direction from `docs/architecture/tsx-logic-audit.md`).

"Pick from list" mode is unchanged.

## Done when
1. A player opens the order form at 375px, fills one card as Sidestep #72 with S, M×3 and XL, submits, and the captain's list shows one Sidestep #72 row with 5 jerseys, "Added by" that player.
2. A second player with a different email submits Sidestep #72 with an L; the captain sees the same single row, now with L, and the "Sizes from 2 people" flag.

## Logic
- `cardToLines` (lib/orderEntry): a card with S×1, M×3, XL×1 gives 3 lines with those sizes and qtys and the card's name, number and design; a card with no sizes is a validation error; a size not in the form's `sizeOptions` is a validation error.

## Dependencies
- Blocked by: R2-04

## Notes
- Files likely touched: `components/run/PublicOrderForm.tsx`, `lib/orderEntry/form.ts` (new) + `lib/orderEntry.test.ts`, `components/orderList/SizeCounter.tsx` (if it needs a `sizes` prop), `e2e/order-form-player.spec.ts`.
- `PublicOrderForm.test.tsx` is frozen; update only what the id/field changes break, and don't add render tests.
- Collision copy follows Gate 1 Q5.
