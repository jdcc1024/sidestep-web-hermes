# Issue (parked): Printed fields per design (front number, labels, CSV headers)

## Parked

JCC, Gate 1b Q3 (2026-10-05): "leave things as is, but let's park this idea
for a future backlog item. For now, we only support name and number, no
special fields yet. … it should be something easy to extend to, BUT it is not
something we will do now." Record: `~/sidestep/docs/gates/0004-gate1b.md`.

Not in the R2-01..R2-05 chain and not on the board. It lives in
`backlog/parked/` so nothing picks it up by accident. To revive it: re-check
the sketch below against `main`, settle Q7 and the placement list with JCC,
refresh the UX (§6 of `docs/ux/0004-roster-sizes.md`, frame 8), then move
this file back to `backlog/` with a current `Blocked by:`.

## Phase: 3

## Type: feature

## Size: M–L (~14 files, ~$4–5), estimate as of Gate 1b

## How this slots in later

After R2-05 the model is order → roster entry (name, number, letter) → order
items (size lines). Nothing built in R2-01..R2-05 has to be migrated:

```
designs.printedFields?: ("nameBack"|"numberBack"|"numberFront"|"letter")[]
        absent = DEFAULT_PRINTED_FIELDS (nameBack, numberBack, letter) = today
rosterEntries.frontNumber?: string
        absent = same as the back number
playerKey({ name, number, frontNumber? })
        frontNumber joins the key only when it is set AND differs from number
```

- **Schema.** Two `v.optional` fields. Existing docs stay valid, so no
  migration and no backfill.
- **Player key.** `playerKey` already takes an object (R2-01). Because an
  absent or equal front number adds nothing to the key, every key computed
  before this issue is unchanged after it, so invariant 1 (one live entry per
  order + design + key) holds with no re-key pass. `resolveEntry` needs no
  change beyond passing the new value through.
- **Args that grow an optional `frontNumber`:** `rosterEntries.add`,
  `update`, `addMany` (paste: front follows back), and each `submitOrder`
  line. `orderForms.getPublic` returns each design's `printedFields` so the
  form renders the right boxes.
- **Reads.** `summarizeRoster` gains a `fieldsByDesign` option; `PlayerView`
  and `ItemView` carry `frontNumber`; `playerLabel` appends `Front #n` only
  when it differs. Captain CSV headers follow the design's fields; the admin
  export gains a front-number column.
- **New function** `designs.setPrintedFields(designId, fields)`: design owner
  only, refused while any order linking the design is locked (it would change
  a confirmed export); admin goes via `admin.updateDesign` (`requireAdmin`).
  Rejects unknown or duplicate fields.
- **Q7 comes back with this issue** (moot at Gate 1b): turning a text field
  off can make two players identical ("Lee #4" and "Lee #9" both become
  "Lee" when the number is hidden). Options were A: refuse and name the
  clash, B: merge silently; architect recommended A. Needs JCC's answer
  before this is built.
- **Placement list and default** still need JCC to confirm (UX §6
  `[CONFIRM]` items). Adding a placement later (e.g. sleeve number) is one
  more optional column + one literal, the same pattern.

## Description (sketch, as designed at Gate 1b)

JCC (2026-10-05): "a jersey design has the main design, and then
customizeable pieces … Name on back = X, number on front = Y, number on back
= Z. The combinations of X Y Z would count as 1 roster entry."

1. **Design page card** "Printed on each jersey": one switch per field in
   `PRINTED_FIELDS`. Missing `printedFields` = `DEFAULT_PRINTED_FIELDS`. The
   captain uses `designs.setPrintedFields`; the admin uses
   `admin.updateDesign`. Turning a field off keeps the values. Switches meet
   the 40px tap target (mockup frame 8 had 26px).
2. **Sheet and list:** fields come from the design. With `numberFront` on, the
   sheet shows both numbers and a "Same number on the front" checkbox (ticked:
   `frontNumber` unset, mirrors the back). The row shows `Front #n` only when
   it differs.
3. **Public form:** the open-mode card shows the design's boxes and sends
   `frontNumber`.
4. **Exports:** captain CSV headers follow the design's fields (`Name on back,
   Number on back, Number on front, Role, Size`). The admin export gains a
   front-number column.

## Done when
1. A captain turns on "Number on front" for Home Kit, adds Sidestep #72 with front number 27, and the list row shows "Front #27"; the downloaded CSV has a "Number on front" column with 27.
2. A player on that design's order form sees a front-number box, leaves it matching the back, and the captain's row shows no "Front" line.

## Logic
- `designs.setPrintedFields`: the owner can turn on numberFront; another captain is rejected; an unknown or duplicate field is rejected; it's refused while a linked order is locked; (if Q7 = A) turning numberBack off when "Lee #4" and "Lee #9" are on an order is refused, naming both.
- `playerKey`: with numberFront on, an unset front equals a front matching the back; "72 / front 27" and "72 / front 72" are different players; the letter never changes the key.
- `rosterExportRows`: headers follow the design's fields in order; a design without `printedFields` gives today's headers.

## Dependencies
- Blocked by: none recorded while parked. Needs R2-01..R2-05 on `main`, plus JCC's answers to Q7 and the placement list.

## Notes
- Files likely touched: `convex/schema.ts`, `convex/designs.ts` + test, `convex/admin.ts`, `convex/orderForms.ts`, `convex/orderEntries.ts`, `convex/rosterEntries.ts`, `lib/rosterEntry/rules.ts`, `lib/orderItem/summary.ts`, `lib/rosterExport.ts` + test, `lib/orderExport.ts`, `components/orderList/{PlayerSheet,PlayerRow}.tsx`, the design page component, `components/run/PublicOrderForm.tsx`, `e2e/` spec.
- Design: `docs/architecture/0004-roster-sizes.md` → "How it slots in later".
