# Issue: Freeze Order When Roster Locked

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: none (consumes the external `locked` run state)
- [x] API: order mutations reject edits once the order's roster is locked
- [x] Frontend: order detail/edit renders read-only with a "Locked — contact Sidestep to change" note when locked
- [x] Tests: edit allowed pre-lock, rejected post-lock

## Description
Once the roster is locked, freeze the order: its details become read-only and edit mutations are rejected, so the confirmed production basis can't drift. Standalone designs remain reusable elsewhere — only this order's editing is frozen.

## Acceptance Criteria
- [x] While the run is not locked, all order fields remain editable
- [x] When the run is locked, the order detail/edit page renders read-only with a clear "Locked — contact Sidestep" affordance
- [x] `orders.update` (and design-link changes) reject edits when the order's roster is locked
- [x] The lock freezes the roster and order-detail editing only — the underlying design records stay editable in their own surface
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: O-05
- Blocked by: **R-06** (Lock & Freeze) — introduces the `locked` run status + confirmed-count snapshot + freeze guards this issue renders against. (Was an undeclared external dependency; now tracked in Track R, docs/prd/roster-manager-and-lock.md.)

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 5 (Out of Scope: dependencies), Section 6 (Lock behaviour)

## Implementation Notes
- This issue only *reacts* to the locked state; it does not define it.
- Decision deferred (PRD Open Question): whether the locked view offers a "request a change" path beyond the static note.
  **Resolved as "no"** — R-06's session report settled it ("No 'request a change' path — freeze is the whole behaviour"), so the locked view is the static contact note only.

## Outcome (2026-07-26)
- `orders.getMyOrder` now returns `locked`, resolved by the same `isOrderLocked` helper that guards `orders.updateOrder` — one lock rule, so the UI can't offer an edit the server would reject. Includes the lazy past-deadline case (R-06), which nothing materializes.
- `/portal/orders/[id]` drops every edit affordance when locked (Edit order, Manage designs, Attach a design) and shows `components/portal/OrderLocked.tsx`'s notice. The run badge now reads `effectiveStatus`, so a lazily auto-locked run shows "Roster locked" instead of "Collecting".
- `/portal/orders/[id]/edit` stays reachable but swaps the form for a read-only summary plus the same notice. "View design" links survive throughout — designs stay editable in their own surface.
- Follow-up filed: **R-08** (run-surface lock controls) — R-06 declared a lock control + badge as frontend scope but shipped backend-only, so the run surfaces are still unaware of the lock.

## TDD Approach
1. Write test: `orders.update` succeeds when run unlocked, throws when locked; page renders read-only when locked.
2. Implement: lock guard in order mutations + read-only render branch.
3. Verify: tests green once the external `locked` status exists.
