# Issue: Roster & Order Entry Data Model

## Phase: 1

## Type: infrastructure

## Vertical Slice
This issue touches:
- [x] Database: add `rosterEntries` + `orderEntries` tables; extend `jerseyRuns.status` union with `locked`; (old tables stay for now)
- [x] API: `lib/rosterEntry/{rules,form}.ts` + `lib/orderEntry/{rules,form}.ts`; `convex/rosterEntries.ts` + `convex/orderEntries.ts` create/list; one-run-per-order guard
- [ ] Frontend: none (foundation — UI slices repoint to it next)
- [x] Tests: schema smoke + lib unit tests for both modules

## Description
Establish the unified roster data model as **additive** schema: a `rosterEntries` table (the name+number "player slot" on a design) and an `orderEntries` table (one jersey to make: size + qty + submitter + source). This is the load-bearing foundation every downstream slice reads/writes; the old `jerseyRunResponses` table and `jerseyRuns.fixedRoster` field are left in place and retired later in R-07 so the app keeps compiling between slices.

## Acceptance Criteria
- [x] `rosterEntries` exists: `{ runId, orderId, designId, name, number, source: captain|fan, createdAt }`, indexed by run and by design
- [x] `orderEntries` exists: `{ runId, designId, rosterEntryId (optional — blanks have none), size, qty, source, submitterName, submitterEmail, createdAt }`, indexed by run and by rosterEntry
- [x] `jerseyRuns.status` union extended to `open | closed | locked` (value added now, behaviour wired in R-06)
- [x] `lib/rosterEntry` + `lib/orderEntry` rules/form modules validate + shape payloads, mirroring `lib/jerseyRunResponse`
- [x] A run-creation guard rejects creating a second run for an order already having one (one-run-per-order) — pre-existing in `jerseyRuns.create`, covered by `jerseyRuns.test.ts`
- [x] `convex dev` starts clean; schema smoke + lib unit tests pass
- [x] All tests pass (389)
- [x] No regressions in existing tests

## Dependencies
- Blocked by: none (builds on the existing run infra; O-05 already shipped lazy run handoff)
- Blocks: R-02, R-03

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — Section 2 (hierarchy), Section 6 (core hierarchy, roster/order entry, run↔order rows)

## Implementation Notes
- Two tables, not one: a captain-seeded roster entry can have **zero** order entries ("not yet filled"), which can't be derived from order entries — so rosterEntry must be first-class.
- `orderEntry` carries `designId` directly (denormalized from its roster entry) so blank/bulk lines (no roster entry) still group by design and per-design counts are a simple group-by.
- Follow the `jerseyRun` / `jerseyRunResponse` rules+form split and shared auth helpers (A-01…A-04 pattern, PRD §7).

## TDD Approach
1. Write test: rules accept a valid roster/order entry and reject bad ones; one-run-per-order guard throws on a second run.
2. Implement: schema additions + lib modules + create/list functions + guard.
3. Verify: `convex dev` clean, smoke + unit green, old surfaces still compile (additive).
