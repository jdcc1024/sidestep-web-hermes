# Issue: The order list on the order page: add, edit, remove + Undo

## Phase: 3

## Type: feature

## Size: L (~18 files, UI)

## Description

Initiative 0004, phase 1. This is the captain-facing heart of it. UX:
`docs/ux/0004-order-items.md` §4 (copy, verbatim), §5 + mockup frames 1–6,
§7, §8. Design: `docs/architecture/0004-order-items.md`.

Replace the per-design roster preview + "Manage roster" sheet with **one
Order list card near the top of the order page**, built on L-01's
`listForOrder` and mutations.

### Page layout (`app/portal/orders/[id]/page.tsx`)

Order: header → **timeline folded to one line on phones** ("Step 1 of 8 · Order
started · See all steps", expands to today's timeline; unchanged ≥ sm) → **Order
list** → existing collect card (L-05 reworks it) → order details (the basics
card + design specs, below the list) → removed designs. Split the page into
section components (`OrderListSection`, `OrderDetailsSection`, …) so L-04/L-05
edit those files, not the page.

### `components/orderList/`

- `OrderList`: heading `Order list`, help line, one group per design (thumb,
  title, `3 items · 1 needs a size`, size chips), rows, `+ Add item` and
  `Paste a list` per design, empty-design state, footer
  `6 items · S×1 M×2 …` · `1 needs a size`. Counts follow **rule 5** (JCC confirmed Q8 = A at Gate 1):
  sized Σ qty as items, unsized as "needs a size". Mockup frame 1's "4 items" / "7 items" are
  superseded: the item count must always equal the sum of the size chips.
- Row: `<Name> #<Number>` + C/A badge (reuse `RosterDesignation`), subline
  `Added by you` / `Added by <submitter first name>` (a player-filled captain
  row shows the player), size or `Needs size` pill, qty `×n` when > 1,
  `No name` when neither name nor number, collision marker as today. Row menu
  button labelled `Edit <label>`.
- `ItemSheet` (bottom `Sheet`): add mode (`Add an item`, subtitle design title,
  fields name, number, size pills from `SIZE_OPTIONS`, how many stepper, captain
  letter None/C/A; `Add`, `Add and start another` keeps the sheet open with
  fields cleared and focus on name). Edit mode (`Edit item`, read-only
  "Added by … through the order form" block with custom question labels +
  answers for player items; `Save`, `Remove`).
- Remove: no confirm. Toast `Removed <label> (<size>)` with `Undo` →
  `orderItems.restore`.
- `Paste a list` and `Copy from <design>`: **move** `PasteRoster` /
  `CopyRosterMenu` out of `RosterSheet.tsx` into this folder, same behaviour, new
  words, calling `orderItems.addMany` / `copyToDesign`. (L-04 adds the size
  column.)
- Locked / `canEdit: false`: no add, paste, copy, row menu or sheet; rows and
  `Download CSV` stay.
- `Download CSV` per design: `lib/rosterExport.ts` takes `ItemView[]` (keeps
  expansion, name/size orderings, Needs-size rows with blank size) — rename the
  captain-facing labels.
- All failures: `toast.error("Could not save that item. Please try again.")` or
  the specific sentence via `userMessage`.

### Delete

`components/portal/RosterSheet.tsx`, `DesignRosterPreview.tsx`,
`SizeBreakdown.tsx` (if unused after), their tests, and the L-02 mappers that
become unused.

## Acceptance Criteria

- [ ] At 375×812, with the timeline folded, the `Order list` heading's top is within the first viewport without scrolling (Playwright/snap check; mockup y≈278) (§8.1)
- [ ] At 375 wide no row, sheet or card of the list scrolls horizontally (`scrollWidth <= clientWidth`) (§8.2)
- [ ] From the order page: `+ Add item` → type "Sidestep", "72" → tap `M` → `Add` = 4 taps + typing; the row "Sidestep #72 · M" appears without navigation (§8.3)
- [ ] Editing a player-submitted item's size from M to L updates the row, the design's chips and the footer in the same render, with no reload (§8.4)
- [ ] Removing a sized item shows `Removed … (M)` + `Undo`; Undo restores the same row (name, number, size, qty, letter, "Added by") in the same position (§8.5)
- [ ] An order with **no order form** shows `+ Add item` and `Paste a list`, and adding works; no deadline field appears anywhere in that flow (§8.6)
- [ ] An item saved without a size shows `Needs size`; the design line and footer say `1 needs a size`; it is not in the item count (§8.7)
- [ ] For every design and the footer, the item count equals the sum of that scope's size chips (Q8 = A)
- [ ] When `canEdit` is false, no add / paste / copy / edit / remove control renders; `Download CSV` renders and downloads (§8.9)
- [ ] No text in the list, sheet or toasts contains `CONVEX`, `ConvexError`, `Request ID` or a path (mock a raw rejection) (§8.10)
- [ ] Every control is reachable by Tab with a visible focus ring; row menu buttons have accessible names like `Edit Sidestep #72`; all tap targets ≥ 40×40 px (§8.11)
- [ ] With `prefers-reduced-motion: reduce`, the sheet and the toast appear without animation (`node scripts/check-reduced-motion.mjs` or equivalent covers both) (§8.12)
- [ ] The new components' copy contains none of: roster, slot, jersey run, collected, responses (§8.13, new code only; L-05 sweeps the rest)
- [ ] Copy matches UX §4 verbatim for the list, rows, sheet and toast
- [ ] All tests pass; no regressions

## Dependencies

- Blocked by: L-02

## Notes

- Files likely touched: `app/portal/orders/[id]/page.tsx` (+ test), new `components/portal/order/*Section.tsx`, `components/orderList/{OrderList,ItemRow,ItemSheet,PasteList,CopyFromDesign}.tsx` (+ tests), `components/portal/OrderTimeline.tsx` (+ test), `lib/rosterExport.ts` (+ test), `components/portal/RosterExportButton.tsx` (+ test), deletions listed above.
- The list animation: follow CLAUDE.md "a list whose items animate in *and* out" (RosterSheet was the reference; keep the pattern when moving it).
- Screenshots: `node scripts/snap.mjs L-03 /portal/orders/<live-run-id> /portal/orders/<no-run-id>` (seed first, see CLAUDE.md).
