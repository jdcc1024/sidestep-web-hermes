# Issue: Paste a list warns when the paste isn't columns

## Phase: 3

## Type: improvement

## Size: S (~3 files, ~$3 Claude)

## Description

Initiative 0004, roster import. UX: `docs/ux/0004-roster-import.md` §2 (first
row of the table), §6 P3. Design: `docs/architecture/0004-roster-import.md`
"R3-05". JCC, 2026-10-09: build it. Applies on top of R3-04.

If you paste a customer's raw message (`Sam - [Dhillon - 44 - 2XL]`), the
preview today shows 18 "new players", each named after the whole line, with no
number or size, and **Add** is enabled. A tired paste goes through.

1. `lib/orderItem/paste.ts` exports a pure
   `looksLikeNotColumns(result: RosterPasteResult): boolean`. It's true when
   at least 3 rows are valid (`new`/`updated`) **and** none of them has a
   number or a catalogue size. Invalid rows don't count. A row whose only
   size is unknown counts as "no size". A separate function, not a field on
   the result (see the design note).
2. `components/orderList/PasteList.tsx` shows the notice above the count line
   when it's true, in the amber notice style already used at
   `components/orderList/OrderList.tsx:218`. Copy, from UX §6:

   > None of these rows has a number or a size. Put a comma or a tab between
   > name, number and size, like `Abbott,8,M`.

   **Add stays enabled.** A list of names only is a real use (sizes come
   later), so this is a hint, not a gate. It isn't shown when the paste is
   over the row bound.

The parser itself doesn't change: no new separators and no attempt to read
` - ` or brackets (JCC 2026-10-09).

## Done when
1. An admin pastes the raw customer message (20 lines like `Kai - [Abbott - 8 - M]`, pseudonyms) into a design and sees the "None of these rows has a number or a size" notice above the preview, with Add still enabled. Then they replace it with the converted `Abbott,8,M,1,Kai` block and the notice is gone.

## Logic
- `looksLikeNotColumns`: three name-only rows (`Kai - [Abbott - 8 - M]` ×3, distinct) give true; the same three plus one `Abbott,8,M` row give false; two name-only rows give false (under the threshold); three rows of `Abbott,,XXXL`-style unknown sizes with no number give true.

## Dependencies
- Blocked by: R3-04-paste-ordered-by-column.md (same files, `lib/orderItem/paste.ts` and `PasteList.tsx`)

## Notes
- Files likely touched: `lib/orderItem/paste.ts`, `lib/orderItem/index.ts` (if `PasteList` imports through the barrel), `components/orderList/PasteList.tsx`; tests (SDET): `lib/orderItem/paste.test.ts` or a new `paste.r305.test.ts`, an `e2e/` paste spec.
- Existing tests that change: none. `parseRosterPaste`'s return shape is unchanged.
- Pure function, so there is no auth line. No Convex change.
- E2E fixture: use the 20-line pseudonym "Customer sent" column from `docs/ux/0004-roster-import.md` §5, not the real sample.
- Review checks:
  - Add's `disabled` condition is unchanged (`busy || toSend.length === 0`).
  - The amber classes match `OrderList.tsx:218` (no new colour tokens).
  - No change to `parseRosterPaste`'s parsing in this diff.
