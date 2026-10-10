# Issue: Paste a list reads an optional "Ordered by" column

## Phase: 3

## Type: feature

## Size: M (~10 files, ~$5 Claude)

## Description

Initiative 0004, roster import. UX: `docs/ux/0004-roster-import.md` §4.1, §6 P2.
Design: `docs/architecture/0004-roster-import.md` "R3-04". JCC, 2026-10-09: keep
the owner as "Ordered by", and the column is **optional** per row and per paste.
Applies on top of R3-03.

A customer's list says who each jersey is for (`Rob` ordered 7 Fraser #43
jerseys). The Hermes skill writes that as a 5th column:
`Fraser,43,2XL,1,Rob`. Today any 5-cell row is skipped. After this issue:

1. **Parser** (`lib/orderItem/paste.ts`). It accepts an optional 5th cell,
   "Ordered by". The cell is trimmed, and an empty one means none.
   - A 6+ cell row is invalid. Reword the "has more" problem to cover the new
     column.
   - With a 5th cell present, an empty 4th cell means How many = 1
     (`Abbott,8,M,,Kai`). A non-numeric 4th cell is still invalid
     (`Abbott,8,M,Kai` is not read as an owner).
   - An owner over `SUBMITTER_NAME_MAX_LENGTH` (120) makes that row invalid.
   - Size lines in the `players` payload are split per `(size, orderedBy)`:
     `{ size, qty, orderedBy? }`, and `orderedBy` is left out (not
     `undefined`) when absent. The preview chips still sum per size. Each
     preview player gets `orderedBy: string[]` (distinct, first-seen order,
     empty when none). `counts` don't change.
2. **Mutation** (`convex/rosterEntries.ts` `addMany`). Each size accepts an
   optional `orderedBy` string, with its own validator. `add` keeps the plain
   `sizesArg` and **does not** accept it. Trim it, and treat `""` as absent.
   Over 120 characters, the whole paste is rejected with the usual
   `Line n:` prefix. One `orderItems` line is inserted per `(size, orderedBy)`
   with `source: "captain"` and `submitterName: orderedBy`, and never an
   email, answers or form id. The per-size `MAX_QTY` check still applies to
   the player's total across owners.
3. **"Sizes added by"**. `sendersOf` (`lib/orderItem/label.ts`) adds
   `via: "form" | "paste"` to a named sender: `"form"` if any of its lines is
   `source: "fan"` or has an email, otherwise `"paste"`. `PlayerSheet.tsx`
   ends a `"paste"` sender's line with ", from a pasted list" and a `"form"`
   sender's line with ", through the order form", as it does today.
4. **Preview** (`PasteList.tsx`). Under a player's chips, show
   `Ordered by <names joined by ", ">` when `orderedBy` isn't empty: a small
   muted label, with the names in the normal text colour (UX mock
   `after-375-*.png`). Send `orderedBy` through to `addMany`. The help text
   stays the same.
5. **Comments** that say only the public form sets a submitter now say: the
   form sets name + email, and a paste may set a name only, with
   `source: "captain"`. These are in `convex/schema.ts` (above
   `submitterName`), the header of `convex/rosterEntries.ts`,
   `insertSizeLine` in `convex/_orderItems.ts`, and the "Spoofing check"
   paragraph in `docs/architecture/0004-roster-sizes.md`.

The admin order export (`lib/orderExport.ts`, `admin.exportOrder`) already
writes `submitterName`. It needs no change.

## Done when
1. An admin pastes a list that mixes `Fraser,43,2XL,1,Rob`, `Fraser,43,S,1,Rob`, `Dhillon,44,2XL,1,Sam` and the 4-column row `Gill,21,M,1`, sees all three players (none skipped) with `Ordered by Rob` under Fraser #43, `Ordered by Sam` under Dhillon #44 and no "Ordered by" under Gill #21, adds them, then opens Fraser #43 and "Sizes added by" reads `Rob · S×1, 2XL×1 · <today>, from a pasted list`.
2. After that paste, the admin downloads the order export and the submitter name column says `Rob` on both Fraser #43 rows and is empty on Gill #21's row.

## Logic
- `parseRosterPaste`: 5-column rows for one player from two owners (Sam 2XL, Jo 2XL) give one player with the chip 2XL×2, `orderedBy: ["Sam", "Jo"]` and two payload lines `{2XL,1,Sam}`, `{2XL,1,Jo}`; a 4-column row in the same paste is valid with no `orderedBy` key; a 6-cell row is invalid, and so is `Abbott,8,M,Kai` (owner in the How many slot).
- `rosterEntries.addMany`: a captain's paste with `orderedBy` stores each line with `submitterName` set, `source: "captain"` and no `submitterEmail`; another captain's call, or a signed-out one, is refused; an `orderedBy` over 120 characters rejects the whole paste and writes nothing.
- `rosterEntries.addMany`: a size line carrying `submitterEmail` (or `source`) is refused by the validator.
- `sendersOf`: a named line with `source: "captain"` and no email is `via: "paste"`; a `source: "fan"` line is `via: "form"`; the captain's unnamed lines are still `isYou`.

## Dependencies
- Blocked by: R3-03-paste-keeps-blank-cells.md (same file, `lib/orderItem/paste.ts`)

## Notes
- Files likely touched: `lib/orderItem/paste.ts`, `lib/orderItem/label.ts`, `components/orderList/PasteList.tsx`, `components/orderList/PlayerSheet.tsx`, `convex/rosterEntries.ts`, `convex/_orderItems.ts` (comment), `convex/schema.ts` (comment only, no field change), `docs/architecture/0004-roster-sizes.md` (one paragraph); tests (SDET): `lib/orderItem/paste.r204.test.ts`, `lib/orderItem/paste.test.ts`, `lib/orderItem/label.test.ts`, `convex/rosterEntries.r201.test.ts` or a new `convex/rosterEntries.r304.test.ts`, an `e2e/` paste spec.
- Existing tests that change:
  - `lib/orderItem/paste.r204.test.ts:84` ("a row with 5 cells is invalid", `Sidestep⇥72⇥M⇥2⇥extra`). Five cells are now valid. Make it a 6-cell row.
  - Nothing else should change. `players` assertions that use `toEqual` with `{ size, qty }` keep passing because `orderedBy` is left out when absent. If one breaks, fix the payload, not the test.
- No schema change and no new table. `submitterName` is already `v.optional(v.string())`.
- The run-responses page (`app/admin/jersey-runs/[id]`, via `orderForms.listOrderEntries`) also shows `submitterName`, so pasted owners appear there too. That's expected.
- `submittersOf` (design-removal warning) keys on email, so pasted owners aren't counted as form submitters there. Leave it as is.
- Review checks:
  - `rosterEntries.add`, `update` and `copyToDesign` args are unchanged. Only `addMany` gains `orderedBy`.
  - `addMany` never writes `submitterEmail`, `customAnswers` or `orderFormId`, and `source` stays server-set to `"captain"`.
  - The suffix is chosen from `source`/email, never from the name.
  - The parser learns no new separator, bracket or tag (JCC 2026-10-09). Column 5 is positional only.
