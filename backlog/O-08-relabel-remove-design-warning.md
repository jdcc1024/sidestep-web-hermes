# Issue: Relabel Remove Design Warning

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none (reads the external `rosterEntries`)
- [x] API: removing/relabelling a linked design computes affected submitters; relabel moves submissions
- [x] Frontend: warning surface listing affected submitters; removed indicator
- [x] Tests: relabel moves rows; remove surfaces affected names without dropping data

## Description
When a captain relabels or removes a linked design that already has submissions, warn rather than silently orphan. Relabel carries existing submissions to the new label; remove keeps the rows but flags them with a removed indicator naming the affected submitters so the captain knows who's impacted.

## Acceptance Criteria
- [x] Relabelling a design moves its existing roster submissions to the new label (no data loss)
- [x] Removing a design surfaces a non-destructive warning that **names the affected submitters**
- [x] After removal, affected rows show a clear "removed" indicator rather than disappearing
- [x] The action is a soft warning (resolvable), never a silent hard stop
- [x] All tests pass
- [x] No regressions in existing tests

## Implementation
The UI half of R-05, which shipped the two read queries this consumes.

- `lib/designRemoval.ts` — pure copy/diff helpers: `pendingDesignRemovals`
  (saved design list minus the form's current one, deduped, additions
  ignored), `describeSubmitters` (name-first list capped at 3 with an
  "and N others" overflow), `jerseyCount`.
- `components/portal/DesignRemoval.tsx` — both surfaces in one module:
  - `DesignRemovalWarning` (pre-save, rendered in `OrderForm`'s design
    section once per unchecked design) reads `affectedByDesignRemoval` and
    names who ordered it plus the jerseys that would drop. Silent while
    loading and when nobody ordered the design.
  - `RemovedDesigns` (post-save, on the order detail page) reads
    `removedDesigns` and keeps each dropped design visible with a "Removed"
    badge, its submitters, and the uncounted jersey total.
- Neither surface can block the save — `OrderForm`'s submit path is
  untouched, so removal stays a resolvable warning, never a hard stop.

**Relabel needs no UI.** Entries key off `designId`, so a rename carries
submissions over and simply renders under the new title everywhere; the
data behaviour is covered by R-05's `convex/orderEntries.test.ts` relabel
test. The removal warning correctly never fires for a relabel.

**Scope call:** the "removed" indicator lives on the order detail page.
Per-row indicators on `/portal/orders/[id]/run/responses` are deferred to
R-07, which migrates that page off the legacy `jerseyRunResponses` model —
adding them now would be written against a table R-07 deletes.

## Dependencies
- Blocked by: O-05
- Blocked by: **R-05** (Relabel / Remove Design on the Roster) — provides the relabel-carry-over and remove-flag-and-drop behaviour + affected-submitter payload this issue surfaces. (Was an undeclared external dependency; now tracked in Track R, docs/prd/roster-manager-and-lock.md.)

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 4 (P1 stories), Section 6 (edit-after-collection)

## Implementation Notes
- Consistent with flow spec §6 "conflicts as resolvable warnings."
- Keep copy warm and field-anchored (flow spec §7), e.g. naming who picked the removed design.

## TDD Approach
1. Write test: relabel moves N rows to the new label; remove returns the affected-submitter list and flags rows without deleting them.
2. Implement: relabel/remove handlers + warning UI.
3. Verify: tests green once `rosterEntries` exists.
