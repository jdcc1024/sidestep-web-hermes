# Issue: Public order form: several sizes on one jersey card

## Phase: 3

## Type: feature

## Size: M (~5 files, ~$2.5)

## Description

Initiative 0004, phase 1b. UX: `docs/ux/0004-roster-sizes.md` §8, frame 7
(ignore the "Sizes from …" flag bullet: Gate 1b Q5 dropped it). Design:
`docs/architecture/0004-roster-sizes.md` ("Write: the public form").

"Type your own name" mode (`JerseyLine` in `components/run/PublicOrderForm.tsx`):
the card keeps today's name and number boxes. The single size radio and the
Quantity box become the `SizeCounter` grid (extracted in R2-02), limited to
the form's `sizeOptions`. "Add another jersey" becomes "+ Add a different
name or number". The header count is Σ counters, in jerseys. A card with no
sizes shows "Pick at least one size."

On submit, each card expands to one `submitOrder` line per (size, qty). The
server API doesn't change: lines with the same key already land on one entry
(R2-02). Move the card → lines expansion and the per-card validation into
`lib/orderEntry/` (pure) instead of growing the component (the R-09
direction from `docs/architecture/tsx-logic-audit.md`).

Same name + number from a second person joins the existing player silently
(Gate 1b Q5): no warning on the form and no flag on the captain's list. The
captain sees both people under "Added by".

"Pick from list" mode is unchanged.

## Done when
1. A player opens the order form at 375px, fills one card as Sidestep #72 with S, M×3 and XL, submits, and the captain's list shows one Sidestep #72 row with 5 jerseys, "Added by" that player.
2. A second player with a different email submits Sidestep #72 with an L; the captain sees the same single Sidestep #72 row, now with L and 6 jerseys, "Added by" both players, and the edit sheet's "Sizes added by" lists each player's own sizes.

## Logic
- `cardToLines` (lib/orderEntry): a card with S×1, M×3, XL×1 gives 3 lines with those sizes and qtys and the card's name, number and design; a card with no sizes is a validation error; a size not in the form's `sizeOptions` is a validation error.

## Dependencies
- Blocked by: R2-04

## Notes
- Files likely touched: `components/run/PublicOrderForm.tsx`, `lib/orderEntry/form.ts` (new) + `lib/orderEntry.test.ts`, `components/orderList/SizeCounter.tsx` (if it needs a `sizes` prop), `e2e/order-form-player.spec.ts`.
- `cardToLines` is pure, so its auth line is n/a; `submitOrder`'s auth and the two-emails-one-player rule are tested in R2-02.
- `PublicOrderForm.test.tsx` is frozen; update only what the id/field changes break, and don't add render tests.
