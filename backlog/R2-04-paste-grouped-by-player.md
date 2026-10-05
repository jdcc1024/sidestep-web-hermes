# Issue: Paste a list grouped by player, with a "how many" column

## Phase: 3

## Type: feature

## Size: S–M (~5 files, ~$2)

## Description

Initiative 0004, phase 1b. UX: `docs/ux/0004-roster-sizes.md` §7, frame 6.
Design: `docs/architecture/0004-roster-sizes.md` ("Effect on each surface",
Paste).

`lib/orderItem/paste.ts` changes:

- Columns: name, number, size, and an optional "how many" after the size
  (an integer 1..`MAX_QTY`). A row with more than 4 cells is invalid.
- Rows are grouped by `playerKey` into players, each with `sizes: {size,
  qty}[]` summed per size. A size we don't make adds no line to that player,
  and the row gets a note.
- A player matching an existing one on the design (passed in by `playerKey`)
  is `updated`, with a note naming the sizes it already has and what it adds.
  A match with no size adds nothing ("Nothing to add").
- Counts: new players, updated players, jerseys, players needing sizes,
  invalid rows.

`PasteList.tsx` previews players with chips and calls
`rosterEntries.addMany` with the grouped players.

## Done when
1. A captain pastes three rows "Sidestep 72 S", "Sidestep 72 M 3", "Sidestep 72 XL", sees one player with S, M×3, XL in the preview, confirms, and the list shows one Sidestep #72 row with 5 jerseys.
2. Pasting "Avery Quinn 7 L" onto a design where Avery Quinn #7 already has M shows the "already on your list" note, and afterwards Avery Quinn #7 is still one row, with M and L.

## Logic
- `parseRosterPaste`: three rows for one key (one with "how many" 3) group into one player with S×1, M×3, XL×1; "Lee 4" and "Lee 9" stay two players; a row with 5 cells is invalid; a "how many" of 0 or 501 is invalid; an unknown size adds no line and notes the row.

## Dependencies
- Blocked by: R2-03

## Notes
- Files likely touched: `lib/orderItem/paste.ts` + `lib/orderItem/paste.test.ts`, `components/orderList/PasteList.tsx`, `e2e/` order-list spec.
- `ROSTER_PASTE_MAX_ROWS` (200) still bounds raw rows. `addMany` already resolves matches server-side (R2-01), so the preview is advisory.
