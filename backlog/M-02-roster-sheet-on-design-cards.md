# Issue: Roster Sheet on Design Cards

## Status: pending

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [ ] API: none new — reuses `rosterEntries.create` / `update` / `remove` and M-01's extended `listForRun`
- [x] Frontend: a "Manage roster" Sheet per design card with inline add / edit / remove, the collision flag surfaced, and a read-only mode for locked runs. `RosterManager` retires from Run Setup.
- [x] Tests: sheet render + CRUD interaction tests; locked-run read-only test; collision-flag test

## Description
Roster editing currently lives inside `/portal/orders/[id]/run/setup`, a page framed around sharing a link — the captain has no reason to be there while seeding a team. This slice moves the editor onto the design cards: each card's preview (M-01) gains a **Manage roster** button opening a Sheet with that design's full roster and inline CRUD. `RosterManager` is retired and its mount removed from `JerseyRunSetup`.

## Acceptance Criteria
- [ ] Each design card has a **Manage roster** button opening a Sheet scoped to that design
- [ ] The sheet lists the design's slots with the existing `filled` / `not yet filled` treatment, and shows each filled slot's ordered sizes
- [ ] Add a slot (name + optional number) from inside the sheet; the card preview and the order total update without a reload
- [ ] Edit a slot's name/number inline; remove a slot, with the server's existing "slot has orders on it" rejection surfaced as a readable toast, not a raw error
- [ ] The **collision** flag from `listForRun` is surfaced on the affected slot (two different submitter emails on one slot in open mode) — it is currently computed and dropped by the UI
- [ ] When the run is **locked**, the sheet opens **read-only**: no add row, no edit/remove affordances, and a note saying why. Reachable via deadline auto-lock with no lock control exposed.
- [ ] When **no run exists yet**, the card shows a hint pointing at collecting rather than a Manage roster button — the sheet is not reachable and nothing creates a run implicitly
- [ ] Usable at **375px**: the sheet is the primary editing surface on a phone, with 15 rows and an add row visible without horizontal scroll
- [ ] `RosterManager` is removed from `JerseyRunSetup`; `components/portal/RosterManager.tsx` is deleted or fully absorbed into the sheet
- [ ] Fan-created slots behave exactly as today — renameable, not removable while filled. **No behaviour change.**
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: M-01
- Blocks: M-03, M-04, M-05

## PRD Reference
See: docs/prd/roster-on-design-cards.md — §5 In Scope (roster sheet), §6 (Editing surface, Card vs sheet split, Locked runs)

## Implementation Notes
- Use `components/ui/sheet.tsx`, **not** `dialog.tsx` — a 15-row roster is tall and narrow, and the Sheet gives a bottom sheet at 375px for free (PRD §6).
- `components/portal/RosterManager.tsx` already has the working CRUD: `validateRosterEntry`, the add row, `SlotRow`'s edit/remove with toasts. Lift that logic rather than rewriting it — the change is where it lives and that it's scoped to **one** design instead of looping all of them.
- Per CLAUDE.md, `SheetTrigger` takes `render={<Button .../>}` with the label as the **outer primitive's children**, not inside the `render` element.
- Locked state: read it from the run's `effectiveStatus` (the lazily-resolved status the order page already uses), not the stored `status` — a run past its deadline is already locked and its mutations all reject.
- Every mutation is already gated server-side by `isLocked` and `requireOrderOwnership`; the read-only mode is a UX affordance, not the security boundary.
- The remove rejection ("This slot has orders on it — remove those first.") is a `ConvexError` — surface `err.message` in the toast, as the existing handlers do.
- Keep the sheet's data read as M-01's `listForRun` — do not add a second query that could drift from the card preview. That drift is the bug M-01 exists to fix.

## TDD Approach
1. Write test: opening the sheet for a design lists only that design's slots; adding a player calls `create` with the right `designId`; removing a filled slot surfaces the server error as a toast; a locked run renders no add/edit/remove controls; a slot with two submitter emails renders the collision flag.
2. Implement: `RosterSheet` component; trigger on the card; lift CRUD from `RosterManager`; remove the `RosterManager` mount from `JerseyRunSetup`.
3. Verify: `node scripts/verify.mjs` green; `node scripts/snap.mjs M-02 /portal/orders/<id>` at 375/768/1280, light + dark, with the sheet open on a 15-player design.
