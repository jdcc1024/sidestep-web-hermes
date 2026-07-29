# Issue: Mirror Roster Between Designs

## Status: done

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [x] API: new `rosterEntries.copyToDesign` mutation — additive slot copy with `(design, name, number)` dedupe and an outcome report
- [x] Frontend: a pull-direction "Copy roster from ▾ [design]" control inside the roster sheet
- [x] Tests: dedupe and additivity unit tests; mutation gate tests; component test for the control and its result message

## Description
A typical order carries the same ~15 people across a home and an away design, and the captain enters them twice. This slice adds a one-action mirror: from inside a design's roster sheet, pick another design in the order and copy its **player slots** across. It is strictly additive — existing slots and their ordered jerseys are never touched — and slots that already exist on the target are silently skipped.

## Acceptance Criteria
- [x] The roster sheet offers **"Copy roster from ▾ [design]"** — pull direction, listing the order's *other* designs, **one source at a time**
- [x] Copying creates a slot on the target for each of the source's slots, carrying **name + number only** — never sizes, quantities, or order entries
- [x] Copied slots land as **`source: "captain"`** and **unfilled**, regardless of how the source slot came to exist
- [x] Slots already present on the target — matched on normalized `(name, number)` — are **skipped silently**, not duplicated
- [x] The result is reported back plainly: "18 copied, 2 already there" (and a clean message when everything was skipped, or when the source roster is empty)
- [x] The operation is **purely additive**: existing target slots, their `filled` state, and their order entries are byte-for-byte unchanged after a copy
- [x] `copyToDesign` enforces order ownership, rejects a locked run, and rejects a source or target design not on the order
- [x] Source and target must differ — copying a design onto itself is rejected
- [x] The control is absent in read-only (locked) mode
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: M-02
- Blocks: none

## PRD Reference
See: docs/prd/roster-on-design-cards.md — §5 In Scope (mirror), §6 (Mirror semantics, Mirror direction)

## Implementation Notes
- **Why slots only, not sizes:** copying order entries would fabricate jerseys nobody asked for, and the production total is fan-driven by decision (PRD §5 Out of Scope). Do not add a "copy sizes too" option in this slice.
- **Why the dedupe rule matters:** a fan's submission attaches to an existing slot by matching `design + name + number` (`convex/orderEntries.ts`). A duplicate slot would split one player's future orders across two rows unpredictably. The skip is correctness, not tidiness.
- Import the shared `rosterSlotKey(name, number)` helper M-03 extracts — the mirror's dedupe and the paste's duplicate detection must normalize identically. If M-03 hasn't landed, create the helper here and let M-03 import it instead.
- Pull direction was chosen deliberately: the captain is already in the sheet for the design that's missing players, so it reads as "fill this one in" (PRD §6).
- Reuse `components/ui/select.tsx` or the existing dropdown for the source picker; with 1–2 other designs typical, keep it plain — no search, no multi-select.
- Return the counts from the mutation rather than recomputing them client-side, so the message reflects what the server actually did.

## TDD Approach
1. Write test: copying a 15-slot source onto an empty target creates 15 unfilled captain-sourced slots; re-running creates **0** and reports 15 skipped; copying onto a target that shares 2 names creates 13 and skips 2; a filled slot on the target keeps its order entries and `filled` state after a copy; case/whitespace differences in a name count as a match. Mutation tests: locked run, foreign design, non-owner, and same-design-as-source all reject.
2. Implement: `copyToDesign` in `convex/rosterEntries.ts`; source picker + result toast in the roster sheet.
3. Verify: `node scripts/verify.mjs` green; `node scripts/snap.mjs M-04 /portal/orders/<id>` showing the picker and the post-copy state on a two-design order.
