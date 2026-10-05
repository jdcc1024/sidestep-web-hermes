# Issue: The order list and the order form write players: one row per player, several sizes per sheet

## Phase: 3

## Type: feature

## Size: L (~18 files, ~$5–6)

## Description

Initiative 0004, phase 1b. UX: `docs/ux/0004-roster-sizes.md` §4 (list), §5
(add / edit / remove), frames 1–5. Design: `docs/architecture/0004-roster-sizes.md`.
Builds on R2-01's server API.

1. **List.** `orderItems.listForOrder` returns R2-01's `summarizeRoster`
   (players + items + summary), keeping `locked`, `canEdit` and `form`.
   `components/orderList/ItemRow.tsx` → `PlayerRow.tsx`: label, letter badge,
   "Added by …" (all sources), display-only size chips in catalogue order
   (`×n` only when n > 1), total when > 1 jersey, the amber `Needs sizes`
   pill, and the collision note. Design line and footer read `summary`.
   A blank entry renders as `Blank jerseys`, last.
2. **Sheet.** `ItemSheet.tsx` → `PlayerSheet.tsx`: printed fields (today's:
   name, number, letter), plus a size counter grid. Extract the public form's
   `SizeCounter` into `components/orderList/SizeCounter.tsx` (44px) and use it
   in both places. Add calls `rosterEntries.add`. The match notice and the
   "Add 1 to …" button label come from a client-side `playerKey` lookup over
   the loaded players (the server re-resolves anyway). Edit sends
   `sizeDeltas` (the sheet's counts minus the player's current totals) and
   shows "Sizes added by" from the lines; a rename onto an existing player
   shows the notice and `Merge and save` (`merge: true`). Remove / Undo call
   `rosterEntries.remove` / `restore` with the existing toast + `UNDO_TOAST_MS`.
3. **Public form write path.** `orderEntries.submitOrder`: each line resolves
   its entry (fixed mode: the picked `rosterEntryId`, which must be live, on
   this order and design, and named; open mode: `resolveEntry` on the typed
   values) and then **inserts** a `fan` item (flat fields mirrored). Delete
   the fill-before-insert path. Rename the line's `itemId` → `rosterEntryId`.
   `orderForms.getPublic` builds the picker from live named entries
   (`{_id, name, number}` only). `PublicOrderForm.tsx` changes only the id
   field name. Its UX changes are R2-05.
4. **Remove the flat mutations** `orderItems.add/addMany/update/remove/restore/copyToDesign`.
   `PasteList` and `CopyFromDesign` switch to `rosterEntries.addMany` /
   `copyToDesign` with today's parser output, one player per pasted row
   (R2-04 does the grouping).
5. Confirm gate: `confirmBlocker` reports players with no sizes
   (`2 players need sizes: …`).

## Done when
1. On the order page at 375px, a captain adds Sidestep #72 with 1 S, 3 M and 1 XL in one sheet and sees one row with chips S, M×3, XL and "5 jerseys".
2. The captain adds " sidestep " #72 again with an L, sees the "already on" notice, and the list still has exactly one Sidestep #72 row, now with L; then lowers M to 2 in the edit sheet, and the row, design line and footer update without a refresh.
3. The captain removes Sidestep #72 and presses Undo; the row comes back with the same sizes and "Added by".

## Logic
- `orderEntries.submitOrder`: an open-mode line for an existing player adds an item under that entry (no second entry); a fixed-mode line with a `rosterEntryId` from another order is rejected; two lines of one submission for the same new name + number land on one new entry; a locked list rejects.
- `orderForms.getPublic`: the picker lists each live named entry once, with only `_id`, name and number; a removed entry is not listed.
- `_orderItems.confirmBlocker`: a named player with no live items blocks confirm and is named; a player whose only line was lowered to 0 blocks; blank jerseys never block.

## Dependencies
- Blocked by: R2-01

## Notes
- Files likely touched: `convex/orderItems.ts`, `convex/orderEntries.ts`, `convex/orderForms.ts`, `convex/_orderItems.ts`, `convex/submitOrder.test.ts`, `convex/orderItems.test.ts`, `lib/orderItem/checks.ts`, `lib/orderItem/label.ts`, `components/orderList/{OrderList,PlayerRow,PlayerSheet,SizeCounter,PasteList,CopyFromDesign,shared}.tsx`, `components/run/PublicOrderForm.tsx` (id rename + import `SizeCounter`), `e2e/` order-list spec.
- Copy per UX §11. "player" and "jerseys" follow Gate 1 Q1/Q2; if JCC picks otherwise, only strings change.
- After deploying to dev, re-run `_migrations:groupOrderItemsIntoRosterEntries` once to link rows written since R2-01.
- Review checks: no `.tsx` decides who can edit (it renders `canEdit`); every customer-facing error goes through `userMessage`; the deleted fill path leaves no "fillable" code behind.
- Fallback split if it runs past ~20 files: the match notice + `Merge and save` UI move to R2-02b.
