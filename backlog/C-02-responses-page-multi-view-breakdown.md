# Issue: Captain Responses Page — Multi-View Breakdown (By Roster / By Fan)

## Status: done

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [ ] API: none new — reuses `jerseyRuns.listOrderEntries`
- [x] Frontend: the captain responses page gains a view switcher over the same collected data — "By roster" (name/number/size per design, reusing C-01) and "By fan" (email → the jerseys that fan ordered), plus the combined size breakdown
- [x] Tests: a switch-the-view render test per mode; unit test for the by-fan derivation

## Description
The captain responses page (`app/portal/orders/[id]/run/responses/page.tsx`) currently shows one flat per-entry table. This slice adds a **view switcher** over the same `listOrderEntries` data so a captain can read the collection different ways: **By roster** (the same name/number/size-per-design breakdown C-01 put on the order detail page) and **By fan** (grouped by submitter email, with **one row per jersey** listed under each fan — e.g. `abc@example.com` as a group heading, then `KOBE 21 M`, `KOBE 21 L`, `BRYANT 6 S` as separate rows). The combined size breakdown from C-01 rides along on the page.

## Acceptance Criteria
- [ ] The responses page offers a view switcher with at least "By roster" and "By fan" modes over the same collected entries
- [ ] "By roster" reuses C-01's per-design name/number/size breakdown (same component, no duplicated logic)
- [ ] "By fan" groups entries by normalized submitter email; each fan is a group heading with **one row per ordered jersey** (name / number / size), not a single collapsed line
- [ ] The combined size breakdown (C-01's UI-only component) is shown on the page
- [ ] The existing detailed per-entry table remains reachable as a view (default view unchanged so nothing is lost) — see decision note
- [ ] Empty run still shows the existing share-link empty state
- [ ] Admin surfaces are untouched (out of scope, deferred)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: C-01 (derivations `lib/jerseyBreakdown.ts` + `RosterBreakdown` / `SizeBreakdown` components)
- Blocks: none

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — collected-roster surfacing. (Feature refined in the 2026-07-26 design conversation.)

## Implementation Notes
- Add `jerseysByFan(entries)` to `lib/jerseyBreakdown.ts`: group by normalized `submitterEmail` → `Array<{ email, name, jerseys: Array<{ designTitle, name?, number?, size, qty }> }>`. The `jerseys` array is rendered **one row per element** (not comma-joined). Normalize email the same way the submit path stores it (trim + lowercase) so a fan reads as one group.
- Reuse `RosterBreakdown` / `SizeBreakdown` from C-01 verbatim — this issue should add no new grouping arithmetic beyond `jerseysByFan`.
- The switcher is UI-only local state (`useState`), not a query param, unless trivially free — keep the page thin.
- **Decision note (UX taste):** default view stays the current detailed table so existing muscle memory and the submitter/email/custom-answer columns aren't lost; the two new views are additional tabs. If the human prefers "By roster" as the default or wants the raw table dropped, adjust — flag it in the session report rather than guessing hard.

## TDD Approach
1. Write test: `jerseysByFan` groups a fan's multiple entries into one group (deduped on normalized email) whose `jerseys` array holds each ordered jersey separately. Responses-page render test: switching to "By roster" shows per-design lines; switching to "By fan" shows each fan heading with one row per jersey; the combined size breakdown is present.
2. Implement: `jerseysByFan` derivation; a small view switcher; the by-fan view component; mount the combined breakdown.
3. Verify: `node scripts/verify.mjs` green; screenshots of each view (light + dark) via `node scripts/snap.mjs`.
