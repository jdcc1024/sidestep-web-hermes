# Issue: Paste a list keeps blank cells in their place

## Phase: 3

## Type: bug

## Size: S (~3 files, ~$3 Claude)

## Description

Initiative 0004, roster import. UX: `docs/ux/0004-roster-import.md` §2, §6 P1.
Design: `docs/architecture/0004-roster-import.md` "R3-03: blank cells".

Today `cellsOf` in `lib/orderItem/paste.ts` drops **every** empty cell, so an
empty Number cell moves the next column left:

- `COACH R,,S,1` saves COACH R **#1** with S×1. The preview count looks right,
  so nobody notices.
- `COACH R,,S` saves COACH R **#S**, with no size.
- A line made only of separators (`,,,`) throws a `TypeError` inside
  `parseRosterPaste` (measured on main f974345), so the sheet errors.

The fix (option A in the design note):

1. `cellsOf`: trim each cell, then drop empty cells **only at the start and end**
   of the row. An empty cell inside the row stays as `""`. If nothing is left,
   the line counts as blank. Do this before rows are numbered, so a
   separators-only line is skipped like a blank line and isn't numbered.
2. `splitSize`: if the name/number/size zone (cells 1–3) has an empty cell,
   it means one of the three is missing. Drop the blanks and look for a size
   among the cells that are left, **even when only 2 are left** (today a size
   is only looked for with 3). If none is found and 2 are left, the numeric
   one is the number and there's no size. If neither is numeric, the first is
   the name and the second is a size we don't make (`Chen,,youth L` → Chen,
   no number, unknown-size note). A zone with no blank works exactly as it
   does today.
3. An empty number cell means no number (`checkRosterNumber("")` already
   returns `undefined`). An empty name cell is a skipped row, as a missing
   name is today.
4. The 4th cell (How many) must still be a whole number. An empty 4th cell
   inside the row is invalid, the same as `abc` is today. R3-04 relaxes this
   only when a 5th cell follows.

Nothing else changes. Tab still beats comma, columns are still detected per
row, `Name 99` still parses, and the 200-row bound and grouping stay as they
are. No new copy.

## Done when
1. An admin pastes `COACH R,,S,1` and `Abbott,8,M` into a design, sees `COACH R` with no number and `S×1` next to `Abbott #8` with `M×1`, adds them, and the list shows COACH R with no number and one S jersey.

## Logic
- `parseRosterPaste`: `COACH R,,S,1`, `COACH R,,S` and `COACH R⇥⇥S⇥1` each give COACH R with no number and S×1; `Chen,,youth L` gives Chen with no number and an unknown-size note; `Gretzky⇥⇥99` and `,,Gretzky,99,,` still give Gretzky #99 with no size; a line of only separators (`,,,`) between two real rows is skipped like a blank line and doesn't throw.

## Dependencies
- Blocked by: none (R2-04 is on main)

## Notes
- Files likely touched: `lib/orderItem/paste.ts`, `lib/orderItem/paste.test.ts` (SDET), `e2e/paste-grouped.r204.spec.ts` or a new `e2e/paste-import.0004.spec.ts` (SDET).
- Existing tests: **none change**. `paste.test.ts:85` ("drops the empty columns a spreadsheet selection carries", `Gretzky⇥⇥99`) must still pass as written. If it doesn't, the rule is wrong, not the test. Update its title to say "the empty columns at either end, and an empty column a size can't explain".
- `parseRosterPaste` is pure, so there is no auth line. `addMany` is unchanged.
- E2E: an admin session (SNAP_UID) on a seeded order, the same as `paste-grouped.r204.spec.ts`.
- Review checks:
  - The diff doesn't touch the separator choice (tab vs comma), `ROSTER_PASTE_MAX_ROWS` or `addMany`.
  - No new separator, bracket or tag handling (JCC 2026-10-09: the parser never learns new shapes).
