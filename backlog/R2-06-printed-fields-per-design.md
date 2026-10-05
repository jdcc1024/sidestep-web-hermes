# Issue: Printed fields per design (front number, labels, CSV headers)

## Phase: 3

## Type: feature

## Size: M–L (~14 files, ~$4–5)

## Description

Initiative 0004, phase 1b. JCC (2026-10-05): "a jersey design has the main
design, and then customizeable pieces … Name on back = X, number on front = Y,
number on back = Z. The combinations of X Y Z would count as 1 roster entry."
UX: `docs/ux/0004-roster-sizes.md` §6, frame 8. Design:
`docs/architecture/0004-roster-sizes.md` (data model, `designs.setPrintedFields`).
**Depends on Gate 1 Q3** (the placement list and who may toggle).

1. **Design page card** "Printed on each jersey": one switch per field in
   `PRINTED_FIELDS` (nameBack, numberBack, numberFront, letter). Missing
   `printedFields` = `DEFAULT_PRINTED_FIELDS`. The captain uses
   `designs.setPrintedFields` (owner only, refused while any order linking
   the design is locked). The admin uses `admin.updateDesign`. Turning a field
   off keeps the values. A toggle that would make two live players on any
   order share a key is refused, naming them (Q7).
2. **Sheet and list:** fields come from the design. With `numberFront` on, the
   sheet shows both numbers and a "Same number on the front" checkbox (ticked:
   `frontNumber` unset, mirrors the back). The row shows `Front #n` only when
   it differs.
3. **Public form:** `getPublic` returns each design's fields. The open-mode
   card shows those boxes and sends `frontNumber` (`submitOrder` accepts an
   optional `frontNumber` per line).
4. **Exports:** captain CSV headers follow the design's fields (`Name on back,
   Number on back, Number on front, Role, Size`). The admin export gains a
   front-number column. Paste: front follows back.

## Done when
1. A captain turns on "Number on front" for Home Kit, adds Sidestep #72 with front number 27, and the list row shows "Front #27"; the downloaded CSV has a "Number on front" column with 27.
2. A player on that design's order form sees a front-number box, leaves it matching the back, and the captain's row shows no "Front" line.

## Logic
- `designs.setPrintedFields`: the owner can turn on numberFront; another captain is rejected; an unknown or duplicate field is rejected; it's refused while a linked order is locked; turning numberBack off when "Lee #4" and "Lee #9" are on an order is refused, naming both.
- `playerKey`: with numberFront on, an unset front equals a front matching the back; "72 / front 27" and "72 / front 72" are different players; the letter never changes the key.
- `rosterExportRows`: headers follow the design's fields in order; a design without `printedFields` gives today's headers.

## Dependencies
- Blocked by: R2-05

## Notes
- Files likely touched: `convex/designs.ts` + test, `convex/admin.ts`, `convex/orderForms.ts`, `convex/orderEntries.ts`, `convex/rosterEntries.ts`, `lib/rosterEntry/rules.ts`, `lib/rosterExport.ts` + test, `lib/orderExport.ts`, `components/orderList/{PlayerSheet,PlayerRow}.tsx`, the design page component, `components/run/PublicOrderForm.tsx`, `e2e/` spec.
- If Gate 1 Q3 = B (admin only): drop `designs.setPrintedFields`, and the design page card is read-only for captains. If Q3 = C: this issue is parked; the schema from R2-01 already holds `frontNumber` and `printedFields`, so nothing earlier changes.
- Default and placement list: confirm at Gate 1 (UX `[CONFIRM]` items).
