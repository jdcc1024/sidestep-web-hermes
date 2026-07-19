# Issue: Lock & Freeze

## Status: done

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none (uses the `locked` status added in R-01 + a confirmed-count snapshot field)
- [x] API: manual lock (captain/admin); lazy auto-lock on deadline; unlock (admin always, captain pre-deadline only); freeze guards; count snapshot
- [x] Frontend: lock control + locked badge; read-only hooks the order page consumes
- [x] Tests: manual lock; lazy auto-lock past deadline; unlock permissions; mutations rejected when locked

## Description
Introduce the lock that freezes the confirmed production basis. A captain or admin can lock manually, and a run **auto-locks lazily when its deadline has passed** (evaluated on read, no scheduler). While locked, roster/order/design-link mutations are rejected and a count snapshot is frozen. **Admin can always unlock; a captain can unlock only while the deadline hasn't passed.**

## Acceptance Criteria
- [ ] A captain or admin can lock a run; status becomes `locked` and a confirmed-count snapshot is stored
- [ ] A run whose deadline has passed reads as `locked` without a manual action (lazy, on read)
- [ ] Admin can unlock at any time; a captain can unlock only if the deadline has not passed
- [ ] While locked, roster/order-entry/design-link mutations are rejected with a clear error
- [ ] The locked state is exposed so the order page (O-06) can render read-only
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: R-03, R-04
- Blocks: R-07
- Blocks (EXTERNAL): O-06 (Freeze Order When Roster Locked) consumes this

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — Section 6 (lock rows: who can lock, reversibility, lock representation, auto-lock mechanism), Section 2 (lock)

## Implementation Notes
- Status is the single source of truth (`open | closed | locked`) — no parallel flag (PRD §6).
- Auto-lock is **lazy on read**: a shared helper resolves effective status from `status` + `deadline`; reuse it everywhere the run is loaded. Coordinate with `3-01-jersey-run-deadline-enforcement` so `closed` and `locked` don't fight (PRD §10 residual).
- No "request a change" path — freeze is the whole behaviour.

## TDD Approach
1. Write test: manual lock sets status + snapshot; a past-deadline run reads locked; admin unlock works, captain unlock blocked post-deadline; a roster mutation throws when locked.
2. Implement: lock/unlock mutations + lazy effective-status helper + freeze guards.
3. Verify: pre-lock edits succeed, post-lock rejected; snapshot frozen.
