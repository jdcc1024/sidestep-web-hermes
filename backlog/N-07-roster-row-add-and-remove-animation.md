# Issue: Roster Row Add and Remove Animation

## Status: done

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `components/portal/RosterSheet.tsx`
- [ ] Tests: existing `RosterSheet.test.tsx` must stay green; row add/remove assertions
- [ ] Review: roster screenshots

## Description
A captain editing a roster gets no visual confirmation of what just changed — rows appear and vanish instantly, and remaining rows snap up to fill the gap. Animate row entry and exit, and let the surviving rows slide into their new positions so the change is legible.

## Acceptance Criteria
- [ ] Adding a roster row animates it in
- [ ] Removing a roster row animates it out before it disappears
- [ ] Remaining rows animate into their new positions rather than snapping
- [ ] Rows are keyed on a stable entry identifier, **not** array index
- [ ] Bulk paste import (M-03 behavior) does not produce an overwhelming cascade — a large paste should settle quickly, not animate dozens of rows in a long sequence
- [ ] Under reduced motion rows appear and disappear without movement
- [ ] Existing `RosterSheet.test.tsx` passes; roster editing, locking (`!locked`), and the copy-roster toast are unchanged
- [ ] Screenshots via `node scripts/snap.mjs N-07 <portal design/roster route>`
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: N-06
- Blocks: none

## PRD Reference
See: docs/prd/motion-adoption.md — Section 5 (PO-3), Section 7 (stable keys)

## Implementation Notes
- **N-06 established no `AnimatePresence` shape** — its panel turned out to be a Base UI dialog whose enter/exit is CSS, so nothing was converted. This issue is now the codebase's first `AnimatePresence`, and N-08 copies whatever lands here. Keep it simple and readable rather than clever.
- **Stable keys are a correctness requirement, not a style preference.** `slots.map((slot) => ...)` at `RosterSheet.tsx:136` must key on the slot/entry id. Index keys will make removals animate the *wrong* row out — the row that visually disappears will not be the row that was deleted.
- Combine `AnimatePresence` (enter/exit) with `layout` on the sibling rows so the gap closes smoothly. This is the one place in the PRD where both primitives are needed together.
- Bulk paste (`pasting` state at `:89`) can insert many rows at once. Cap or shorten any stagger so a 30-name paste does not turn into a several-second animation. Check this case explicitly — it is the realistic worst case for this component.
- Do not animate the toast (`sonner` handles it) or the locked state.

## TDD Approach
1. **Write test:** add a row and assert it is in the document; remove a row and assert that *specific* row's content is gone while its siblings remain. The sibling assertion is what catches index-keying bugs.
2. **Implement:** key rows on entry id, wrap in `AnimatePresence`, add `layout` to the row element.
3. **Verify:** add and remove rows in the browser and confirm the correct row leaves; paste a large roster and confirm it settles quickly; run the existing test file; reduced-motion run static; screenshots.
