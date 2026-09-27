# Issue: Captain And Assistant Captain Designation

## Phase: 3

## Type: feature

## Description

A rostered player is currently just a name and a number. Some of them wear a
letter — a **C** for the captain, an **A** for an assistant captain — and that
letter is an extra thing to apply to the garment. Nothing in the app records it
today, so it reaches production by email or not at all.

Add an optional designation to a roster slot. Most slots have none; a team
typically has one C and up to a few As.

Decisions taken while implementing:

- **Stored as the letter** (`"C"` / `"A"`), not as the words. `rosterEntries`
  already has a `source` field whose values include `"captain"`, and a second
  field on the same document also valued `"captain"` would make a mistyped field
  name type-check clean. `"C"` cannot be confused with a `source`.
- **Optional, and unconstrained.** No "only one C per design" rule — co-captains
  exist, and a validation error while seeding a roster costs more than a second
  C ever would.
- **Per design**, because a slot is per design. The mirror (M-04) carries the
  designation across, so a captain on the home kit is a captain on the away kit
  without re-picking it.
- **Set from the roster sheet's edit row**, not the add row. The add row is a
  three-column grid at 375px and fourteen of fifteen players want nothing there.
- **Not settable by fans.** The public form creates slots (open names, R-02);
  who wears the C is the captain's call.
- **Not part of a player's identity.** `rosterSlotKey` is unchanged, so paste
  dedupe (M-03) and mirror skip (M-04) still match on name + number — putting a
  letter on someone does not make them a different person.
- **Bulk paste ignores it.** A third column would collide with the "more than
  two cells is an invalid row" rule, and one player out of fifteen is an edit.

## Acceptance Criteria

- [x] A roster slot can carry a Captain or Assistant captain designation, or none
- [x] The captain sets and clears it from the roster sheet's edit row
- [x] The letter shows on the design card preview, the roster sheet, and the
      responses page's by-roster view
- [x] The mirror copies a designation to the other design
- [x] The captain's roster CSV carries a Role column
- [x] The admin order CSV carries a Role column, so production sees it
- [x] A locked run shows the letter and offers no way to change it
- [x] Tests pass

## Dependencies

- Blocked by: none (extends M-01's roster read and M-08's export, both shipped)

## Notes

- `docs/prd/roster-on-design-cards.md#5-scope` — the roster surfaces this rides
  on. The PRD does not mention designations; this is an addition to the model it
  describes, not a change to any decision in it.
- The field rules belong in `lib/rosterEntry/rules.ts` beside the name and number
  checks, so the Convex mutations and the sheet validate identically.
- `rosterEntries.listForRun` already carries each slot to both the card and the
  sheet — the designation rides along on that read, no new query.
- Admin export reads the slot in `convex/admin.ts` `exportOrder` already; it only
  needs the label.
