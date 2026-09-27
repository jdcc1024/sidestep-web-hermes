# Issue: Captain Roster Seeding + "Not Yet Filled"

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none (uses R-01 `rosterEntries`)
- [x] API: captain create/edit/delete roster entries (`source: captain`); replaces `jerseyRuns.fixedRoster`
- [x] Frontend: run setup / captain dashboard lets a captain pre-enter name+number per design; roster entries with zero order entries render as "not yet filled"
- [x] Tests: seeded entry has 0 order entries → not-yet-filled; a fan order fills it; collision flag surfaced

## Description
Let the captain pre-enter the roster — name+number player slots per design — replacing the old `fixedRoster` array. A seeded slot with no order entry yet shows as **"not yet filled"** and does not count toward the production total until a size is chosen. This is also where the captain sees (and freely edits) any open-names collision flags raised in R-02.

## Acceptance Criteria
- [x] A captain can add/edit/remove roster entries on a design, stored with `source: captain` (`rosterEntries.create/update/remove`, `RosterManager` UI)
- [x] A roster entry with zero order entries renders as "not yet filled" (derived `filled` flag in `rosterEntries.listForRun`; badge in `RosterManager`)
- [x] When a fan orders a matching slot, it flips to filled (the order entry attaches per R-02) — derivation verified by test; the fan-attach *write* path is R-02
- [~] Captain can see and edit any collision-flagged entries — editing any slot is delivered (covers a flagged slot); the collision **flag itself is raised in R-02**, which owns adding the field + badge, so the visual surfacing lands there
- [x] The old `fixedRoster` editing path is replaced by roster-entry editing — `RosterManager` is the new per-design seeding surface; the legacy run-level `fixedRoster` stays read-only (the public form still reads it until R-02) and is fully removed in R-07
- [x] All tests pass (397)
- [x] No regressions in existing tests

## Implementation Note (interim model)
Roster slots are now first-class per-design documents seeded through `RosterManager` in the run summary. `remove` is blocked when a slot already has an order entry (would orphan a real jersey). The legacy `fixedRoster` field is left intact and shown read-only ("Fixed roster (legacy)") so fixed-mode public submission keeps working until R-02 migrates the public form and R-07 drops the field.

## Dependencies
- Blocked by: R-01
- Blocks: R-04, R-06

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — Section 4 (P0 captain seeding story), Section 6 ("not yet filled", collision resolution)

## Implementation Notes
- Touches `JerseyRunSetup` and the captain dashboard, which previously read/wrote `fixedRoster`.
- "Not yet filled" is purely derived: roster entry with no related order entries — no extra status field.

## TDD Approach
1. Write test: seeded roster entry has 0 order entries → not-yet-filled; after a matching fan order it reports filled.
2. Implement: roster-entry CRUD + captain UI + not-yet-filled rendering.
3. Verify: seeding then filling reconciles; collision-flagged entries are editable.
