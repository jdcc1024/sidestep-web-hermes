# Issue: Paste a list with sizes; removal warning covers form-less orders

## Phase: 3

## Type: feature

## Size: S–M (~8 files)

## Description

Initiative 0004, phase 1. Two small completions of the order list. UX §3
("whole team from a spreadsheet"), §7 rule 7, §8. Design:
`docs/architecture/0004-order-items.md`.

### 1. Paste takes an optional size column

Extend the paste parser (`lib/rosterEntry/paste.ts`, moved to
`lib/orderItem/paste.ts`) to read **Name ⇥ Number ⇥ Size**, size optional:

- Cells: the size is the cell that normalizes (trim, uppercase, `XXL` → `2XL`)
  to a `SIZE_OPTIONS` value. Name/number resolution stays as today (numeric
  cell = number, either order).
- 3 cells where the third isn't a known size → the row is **still added**, as
  Needs size, and the preview names it: `Row 4: "XXXL" isn't a size we make — added as Needs size.`
  It is not rejected (rule 7).
- Rows with more than 3 cells stay invalid as today.
- Dedupe against existing items / within the paste is unchanged, keyed by name
  + number (`rosterSlotKey`), not size.
- The preview summary adds: `3 need a size`. The confirm button reads
  `Add 14 items`.
- The commit calls `orderItems.addMany` with `size` per row.

### 2. Design-removal warning reads the order, not the run

`components/portal/DesignRemoval.tsx` (`DesignRemovalWarning` on the edit page,
`RemovedDesigns` on the order page) switches from the run-keyed
`orderEntries.affectedByDesignRemoval` / `removedDesigns` to
`orderItems.affectedByDesignRemoval({ orderId, designId })` and
`listForOrder(...).removedDesigns`. Without this, removing a design from an
order that has captain-added items but **no order form** warns about nobody.
Delete the two run-keyed queries.

## Acceptance Criteria

- [ ] Pasting `Sidestep\t72\tM` + `Jordan Lee\t4` + `Sam\t12\tXXXL` previews 3 items: one sized M, two Needs size; the XXXL row is named with its reason; confirming adds all three (§7.7, §8.8)
- [ ] `xxl`, ` l `, `2xl` parse as `2XL`, `L`, `2XL`
- [ ] A two-column paste behaves exactly as before (existing paste tests pass unchanged, apart from wording)
- [ ] The preview at 375 wide doesn't scroll horizontally (§8.2); its controls meet §8.11 (focus, labels, ≥ 40px)
- [ ] No preview or error text contains `CONVEX`, `ConvexError`, `Request ID` or a path (§8.10)
- [ ] On an order with **no order form** and 2 captain items on "Away Kit", unlinking Away Kit on the edit page warns about 2 items; after saving, the order page's removed-designs section lists them
- [ ] All tests pass; no regressions

## Dependencies

- Blocked by: L-03

## Notes

- Files likely touched: `lib/orderItem/paste.ts` (+ test, moved from `lib/rosterEntry/paste.ts`), `components/orderList/PasteList.tsx` (+ test), `components/portal/DesignRemoval.tsx` (+ test), `components/portal/OrderForm.tsx`, `convex/orderEntries.ts` (delete the two queries + their tests).
- The paste bound (`ROSTER_PASTE_MAX_ROWS` = 200) stays.
