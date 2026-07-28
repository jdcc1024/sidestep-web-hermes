# Issue: Unified Roster Read + Design-Card Roster Preview

## Status: pending

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [x] API: extend `rosterEntries.listForRun` so each slot carries its ordered sizes (and the run's unattached blank/bulk lines come back too)
- [x] Frontend: each design card on the order detail page shows a roster preview — seeded-unfilled slots included — replacing the order-entry-only `RosterLines`
- [x] Tests: unit tests for the new derivation (unfilled slots, blank lines, totals reconciling); render test for the preview and its overflow cap

## Description
The order detail page and Run Setup currently disagree about what a design's roster is: the order page derives its lines from **order entries** (`lib/jerseyBreakdown.ts` → `rosterLinesByDesign`), so a captain-seeded player nobody has ordered for is invisible there, while `RosterManager` reads **roster entries** and shows that same player as "not yet filled". This slice makes one read that joins both and puts it on the design cards, so a seeded roster is visible where the captain reads their order. It is the foundation every other M slice builds on — no editing yet.

## Acceptance Criteria
- [ ] `rosterEntries.listForRun` returns, per design, each slot with `filled`, `collision`, its **ordered sizes** (`{size, qty}[]`, canonical order), and a `total` (Σ qty)
- [ ] The same read returns the run's **blank/bulk lines** — order entries with no `rosterEntryId` — grouped per design, so no jersey is dropped from the view
- [ ] A new pure derivation in `lib/jerseyBreakdown.ts` turns that read into render-ready per-design rows; slots and blank lines are one list per design
- [ ] Each design card on `/portal/orders/[id]` shows that design's roster: **unfilled slots rendered muted**, filled slots showing their sizes, blank lines labelled via the existing `jerseyLabel` "Blank" treatment
- [ ] The preview is **capped** with an overflow count ("+ 10 more") — pick a cap against a real 15-player design and note the choice in the session report (PRD §10 open question)
- [ ] Per-design Σ qty still reconciles exactly with `orderEntries.countsByRun` — the header total and `DesignRollup` are unchanged
- [ ] A design with no run yet, or a run with an empty roster, keeps a sensible empty treatment (no crash, no "0 jerseys" where "not started" is meant)
- [ ] `RosterLines` / `rosterLinesByDesign` are removed from the order detail page, or retained only where the responses page still needs them — **the responses page (C-02) must not regress**
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: none
- Blocks: M-02, M-03, M-04, M-05

## PRD Reference
See: docs/prd/roster-on-design-cards.md — §5 In Scope (unified per-design roster read, design-card preview), §6 (Roster read, Unfilled slots)

## Implementation Notes
- **`convex/rosterEntries.ts` `listForRun` already does most of this**: it collects the run's order entries to compute `filledSlotIds` and the per-slot email sets for `collision`. Extend that same single scan to accumulate sizes per `rosterEntryId` and to bucket entries with no `rosterEntryId` per design — no extra queries.
- Sort sizes with the existing `sortSizes` from `lib/jerseyRun` so the card, the sheet, and `SizeBreakdown` agree on order.
- Keep the derivation **pure and DOM-free** in `lib/jerseyBreakdown.ts`, matching the file's existing contract ("hands in whatever the query returned, gets back render-ready groups"). The unit is **Σ qty, never row count** — that comment at the top of the file is load-bearing.
- `rosterLinesByDesign` is still used by the responses page via `RosterBreakdown`. Do not delete it; this slice only stops the **order detail page** from using it.
- The order page currently runs three queries (`orders.getMyOrder`, `jerseyRuns.getByOrder`, `orderEntries.countsByRun`, `jerseyRuns.listOrderEntries`). Adding `rosterEntries.listForRun` makes five — consider whether `listOrderEntries` is still needed on this page once the unified read lands, and drop it if not.
- `listForRun` returns `null` for a missing run and the page must already handle "no run yet" (run creation is lazy) — keep that path.

## TDD Approach
1. Write test: derivation returns a seeded slot with **zero** order entries as an unfilled row with `total: 0`; a slot with two fans ordering L and M comes back with both sizes and `total: 2`; a blank/bulk line (qty 3, no slot) appears as its own row and counts toward the design total; per-design totals equal `countsByRun`'s `byDesign`. Convex test: `listForRun` includes sizes and blank lines and still enforces captain/admin access.
2. Implement: extend `listForRun`'s existing scan; add the derivation; add a `DesignRosterPreview` component; mount it in `DesignSection`.
3. Verify: `node scripts/verify.mjs` green; `node scripts/snap.mjs M-01 /portal/orders/<id>` — check a design with only unfilled slots, one with a mix, and one with nothing.
