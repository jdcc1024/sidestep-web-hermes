# Issue: Migrate Remaining Surfaces + Retire Old Tables

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [x] Database: remove `jerseyRunResponses` table + `jerseyRuns.fixedRoster` field
- [x] API: delete the old response queries/mutations; repoint any remaining readers to `orderEntries`/`rosterEntries`
- [x] Frontend: migrate admin jersey-run oversight, the run responses page, participation history, and logged-in response views onto the new model
- [x] Tests: surfaces read from the new tables; no references to removed tables; full suite green

## Description
Finish the migration. With the public form (R-02), captain seeding (R-03), counts (R-04), relabel/remove (R-05) and lock (R-06) all on the new model, migrate the remaining **read** surfaces and then delete the legacy `jerseyRunResponses` table and `jerseyRuns.fixedRoster` field. This is the cleanup slice that removes the interim dual-model state.

## Acceptance Criteria
- [x] Admin jersey-run oversight reads order/roster entries
- [x] The captain run responses page reads order entries
- [x] Customer participation history (3-04) and logged-in response views (3-08) read order entries
- [x] `jerseyRunResponses` table and `jerseyRuns.fixedRoster` are removed from the schema
- [x] No code references the removed table/field
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: R-05, R-06 (and transitively all R-track issues)
- Blocks: none

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — Section 5 (migration of existing surfaces; schema swap, no migration scripts), Section 7 (blast radius)

## Implementation Notes
- Surfaces touched here previously matched `jerseyRunResponses` / `fixedRoster` (see the grep blast-radius list, ~30 files): `app/admin/jersey-runs/[id]/page.tsx`, `app/portal/orders/[id]/run/responses/page.tsx`, participation-history and response-views surfaces, `convex/admin.ts`.
- Schema swap, no data-migration scripts — pre-launch, no real data to preserve (PRD §6).
- Do this last so every writer is already on the new model before the old table disappears.

## TDD Approach
1. Write test: each migrated surface query returns data from `orderEntries`/`rosterEntries`; a grep/typecheck guard finds no `jerseyRunResponses`/`fixedRoster` references.
2. Implement: repoint readers, delete old queries, drop the table + field.
3. Verify: full suite green; `convex dev` clean with the old table gone.
