# Issue: Public order form line logic moves to lib (fixed-mode tally, payload, schema)

## Phase: 3

## Type: improvement

## Size: M (~6 files, ~$2.5)

## Description

From the `.tsx` logic audit (`docs/architecture/tsx-logic-audit.md`, findings
1–4). The public order form decides **what a player orders**, and since
`.tsx` render tests were frozen (JCC, 2026-10-02) none of that logic is
covered by `npm test`. The server can't catch a wrong count: `qty: 3` is valid
whether the player meant 3 or 2. So these move into pure functions with `.ts`
tests, and the component calls them. **Behaviour and copy do not change.**

File names are post-L-07. Before L-07 the component is
`components/run/JerseyRunPublicForm.tsx`.

### 1. `lib/orderEntry/lines.ts` (new, pure, no React)

Lift these functions out of `components/run/PublicOrderForm.tsx` unchanged.
Type `LineValues` moves with them.

- `emptyLine(designs)`: preselects the only design (`:127`).
- `addSize(lines, designId, itemId, size): LineValues[]`: appends a qty-1 line,
  or bumps the matching (item × size) line, but not past `MAX_QTY` (`:309-325`).
- `removeSize(lines, itemId, size): LineValues[]`: decrements, and drops the
  line at qty 1. No matching line returns the input unchanged (`:327-336`).
- `qtyFor(lines, itemId, size): number`: 0 when there's no line or the qty
  doesn't parse (`:760-767`).
- `jerseyCount(namesMode, lines): number`: fixed = Σ qty, open = line count
  (`:402-408`).
- `toSubmitLines(namesMode, lines)`: the `submitOrder` `lines` arg (`:347-364`).
- `hasPlainJersey(namesMode, lines): boolean`: open mode and some line has
  neither name nor number (`:381-389`).

The component keeps `useFieldArray`. Its `addSize`/`removeSize` handlers
compute the next array with the lib function and then call `replace` (or
`append`/`update`/`remove` with the index the lib returns, whichever is the
smaller diff). The decision belongs to lib, and the wiring stays in the
component.

### 2. `lib/orderEntry/publicForm.ts` (new): the form's checks

Move `buildSchema` (`:143-259`) here as `publicFormSchema(run, designs)`. Every
per-field rule calls the **same** `lib/orderEntry` / `lib/rosterEntry` /
`lib/jerseyRunResponse` (post-L-07 `lib/orderFormResponse`) check function
that `convex/orderEntries.ts` `submitOrder` uses (`checkSubmitterName`,
`checkSubmitterEmail`, `checkSize`, `checkQty`, `checkItemName`,
`checkRosterNumber`, `checkCustomAnswer`), so client and server can't drift.
Where the form's message differs from the check's, keep the **form's**
message. Customers see it today, so pass it as an override or map it in the
schema. Don't change the server's message.

zod is already a dependency of the app, and `lib/` may import it (only
`convex/` must not, because `submitOrder` doesn't need the schema).

## Done when

1. A player opens a fixed-mode order form, taps `M` twice and `L` once for one name, taps the `M` minus once, submits, and the captain's order list shows that name with M×1 and L×1.
2. A player on an open-mode form adds a second jersey with no name or number, is asked to confirm the plain jersey, confirms, and both items appear on the captain's list.

## Logic

- `addSize` / `removeSize` / `qtyFor`: tap adds then bumps; bump stops at `MAX_QTY`; minus at qty 1 removes the line; minus on an absent line is a no-op.
- `jerseyCount` + `toSubmitLines`: fixed sums qty and sends `itemId` with no name/number; open counts lines and sends trimmed name/number with blanks omitted.
- `hasPlainJersey`: true for an open line with a blank name and number; false in fixed mode; false when only one of name/number is blank.
- `publicFormSchema`: valid input passes; a fixed line whose `itemId` is on another design fails on `itemId`; qty `MAX_QTY + 1` fails on `qty`; an over-long answer fails on `customAnswers`.

## Dependencies

- Blocked by: L-07 (it renames this component and `lib/jerseyRunResponse`;
  running after it avoids a conflict on the same file)

## Notes

- Files likely touched: `lib/orderEntry/{lines,publicForm,index}.ts` (+ `lib/orderEntry/lines.test.ts`, `publicForm.test.ts` from SDET), `components/run/PublicOrderForm.tsx`.
- Review check: `PublicOrderForm.tsx` keeps every string and every element. The diff in it is only deleted function bodies and calls into `lib/orderEntry`. `grep -nE "parseInt|reduce\(|superRefine" components/run/PublicOrderForm.tsx` returns nothing.
- Review check: no message a player sees changes. Compare the deleted strings in the component with the strings in `publicForm.ts`.
- Security: no Convex change. `submitOrder` is still the gate, and this only makes the client agree with it sooner.
