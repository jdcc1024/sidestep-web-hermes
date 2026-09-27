# Issue: Run Surface Lock Controls

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: none (uses the `locked` status and `lockSnapshot` from R-06)
- [ ] API: none expected — `jerseyRuns.lock` / `unlock` already exist
- [x] Frontend: lock/unlock control + locked badge on the captain run surfaces; run settings render read-only when locked
- [x] Tests: control visible per permission; locked run renders read-only

## Description
R-06 shipped the lock as pure backend — `jerseyRuns.lock` / `unlock` mutations, lazy auto-lock, and freeze guards — and its own session report notes "No frontend UI was touched." O-06 then froze the *order* surfaces against that state. The **run** surfaces were never covered: `/portal/orders/[id]/run/setup` and `/portal/orders/[id]/run/responses` still render as if the run were editable, and there is no way for a captain or admin to lock a run deliberately from the UI at all — the only path to `locked` today is the deadline passing.

## Acceptance Criteria
- [ ] A captain or admin can lock a run from the run surface (calls `jerseyRuns.lock`)
- [ ] A locked run shows a locked badge and renders its run settings read-only
- [ ] Unlock is reachable for those permitted (`canUnlock`: admin always, captain pre-deadline)
- [ ] The order detail page's "Manage run" affordance reflects the locked run rather than linking into a frozen editor
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: R-06 (mutations + `effectiveStatus`), O-06 (established the locked-notice pattern and copy)

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — Section 6 (who can lock, reversibility, lock representation)

## Implementation Notes
- `lib/jerseyRun/lock.ts` already exports `canLock` / `canUnlock` / `effectiveStatus` — the UI should call those, not re-derive the rules.
- Reuse `components/portal/OrderLocked.tsx`'s notice treatment so the order and run surfaces explain the freeze the same way.
- Read `effectiveStatus`, never the stored `status`: a run stored `open` past its deadline is already locked.

## TDD Approach
1. Write test: locked run renders read-only settings + badge; the lock control appears for a permitted actor and is absent otherwise.
2. Implement: wire the existing mutations to controls; branch the run surfaces on `effectiveStatus`.
3. Verify: full suite green.
