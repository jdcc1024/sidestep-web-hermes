# Issue: Bulk Paste Roster Import

## Status: pending

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [x] API: new `rosterEntries.createMany` mutation (bulk insert, same ownership/lock/design gates as `create`)
- [x] Frontend: a paste box in the roster sheet with a **preview-and-confirm** step showing what will be created, what's already there, and what didn't parse
- [x] Tests: heavy unit coverage on the pure parser; mutation tests for the gates; component test for the preview flow

## Description
A captain seeding ~15 players types them one at a time today. This slice lets them paste straight out of Excel or Google Sheets: the pasted block is parsed into name/number rows, shown as a preview with duplicates and unparseable rows flagged and excluded, and committed in one action. The parser is a pure function in `lib/` so the preview and the commit can never disagree about what a paste means.

## Acceptance Criteria
- [ ] A **pure, DOM-free parser** in `lib/rosterEntry/` takes a pasted string and returns parsed rows plus per-row problems — no Convex, no React
- [ ] Accepts **tab-separated** (the Sheets/Excel clipboard format), **comma-separated**, and a **single column with a trailing number** (`Gretzky 99`)
- [ ] Detects `Name⇄Number` column order **per row**, based on which column is numeric — a captain's two columns may be in either order
- [ ] Rows are validated with the existing `checkRosterName` / `checkRosterNumber` rules so the paste can't create something the single-add path would reject
- [ ] The preview lists every parsed row and separately flags: rows **already on this design's roster**, rows that **failed to parse**, and rows that **repeat within the paste itself** — all three excluded from the commit count
- [ ] The confirm button states the real count ("Add 15 players"), and nothing is written until it's pressed
- [ ] `rosterEntries.createMany` enforces the **same gates as `create`**: order ownership, run not locked, design belongs to the order, per-row name/number rules
- [ ] `createMany` is bounded — reject an unreasonably large paste rather than inserting it
- [ ] Pasting into a **locked** run is not possible (no paste box in read-only mode) and would be rejected server-side anyway
- [ ] Empty paste, whitespace-only paste, and a paste of entirely duplicate rows all produce a readable preview rather than an error
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: M-02
- Blocks: none

## PRD Reference
See: docs/prd/roster-on-design-cards.md — §5 In Scope (bulk paste), §6 (Paste safety, Paste parsing)

## Implementation Notes
- Put the parser next to the existing rules it depends on: `lib/rosterEntry/` already holds `checkRosterName`, `checkRosterNumber`, `ROSTER_NAME_MAX_LENGTH`, `ROSTER_NUMBER_MAX_LENGTH`. Follow the established **rules + form** split the Convex modules use.
- Duplicate detection must use the **same normalization as M-04's mirror dedupe** — trim + case-fold the name, trim the number. Extract one shared `rosterSlotKey(name, number)` helper so the two features cannot drift; M-04 imports it.
- "Numeric column" detection: a jersey number can have a leading zero (`01`) and can be `0`, so test for *digits*, not truthiness or `Number()` coercion. A player legitimately named with digits is not worth handling.
- Real Sheets clipboard data has trailing empty lines and `\r\n`. Normalize line endings and drop blank lines before parsing.
- **No undo** — the preview is the safety mechanism (PRD §6). Don't build a rollback path.
- Reuse the sheet's existing toast pattern for the commit result.

## TDD Approach
1. Write test: the parser table-tested across TSV both column orders, CSV, single-column trailing number, `01` and `0` numbers, over-length names, blank lines, `\r\n`, in-paste duplicates, and a row that's just a number. Mutation tests: `createMany` rejects a locked run, a design not on the order, a non-owner, and an oversized batch. Component test: preview shows counts, confirm writes exactly the non-excluded rows.
2. Implement: parser in `lib/rosterEntry/`; shared `rosterSlotKey`; `createMany` in `convex/rosterEntries.ts`; paste box + preview in the roster sheet.
3. Verify: `node scripts/verify.mjs` green; manually paste a real 15-row block out of Google Sheets in both column orders; `node scripts/snap.mjs M-03 /portal/orders/<id>` with the preview open at 375px.
