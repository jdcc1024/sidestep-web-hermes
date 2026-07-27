# Issue: Jersey Breakdown Derivations + Order Detail Roster/Size View

## Status: done

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none — reads existing `orderEntries` (R-01) via `jerseyRuns.listOrderEntries`
- [ ] API: none new — reuses `jerseyRuns.listOrderEntries` (already captain/admin gated)
- [x] Frontend: order detail page shows, per design, the collected jerseys as name/number/size lines; a combined size breakdown component beside it
- [x] Tests: unit tests for the pure derivations (`lib/jerseyBreakdown.ts`); order-detail render test for the per-design breakdown + empty state

## Description
Today the order detail page (`app/portal/orders/[id]/page.tsx`) shows only a Σ-qty rollup per design (`DesignRollup`, reading `countsByRun`). This slice adds the actual collected jerseys — each ordered jersey's **name, number, and size** — grouped **per design**, plus a small **combined size breakdown** (S×3 · M×5 · L×2) that is a pure UI-only derivation. It also establishes `lib/jerseyBreakdown.ts`, the reusable pure-function layer C-02 builds its captain-responses views on.

## Acceptance Criteria
- [x] `lib/jerseyBreakdown.ts` exports pure derivations over the `listOrderEntries` entry shape: roster lines grouped by design (in the order's design order) and a size tally (combined, and per design)
- [x] The order detail page fetches entries via `jerseyRuns.listOrderEntries` (skipped until a run exists) and renders, inside each design's section, that design's collected jerseys as name / number / size lines
- [x] A design with no collected jerseys keeps its existing "nothing collected yet" empty treatment
- [x] A combined size breakdown renders as a UI-only component derived from the same entries (no new query)
- [x] The per-design line totals reconcile with the existing `countsByRun` per-design count already shown (same underlying entries)
- [x] Admin surfaces are untouched (out of scope, deferred)
- [x] All tests pass
- [x] No regressions in existing tests

## Outcome
Shipped 2026-07-27. `rosterLinesByDesign` / `sizeTally` / `entriesForDesigns` /
`jerseyLabel` in `lib/jerseyBreakdown.ts`; `RosterLines` + `RosterBreakdown`
(`components/portal/RosterBreakdown.tsx`) and `SizeBreakdown`. Two decisions
worth knowing: identical jerseys (same slot, same size) collapse to one line
with Σ qty, and entries on a since-removed design are scoped out so the lines
reconcile with `countsByRun`. `RosterBreakdown` is tested but not yet mounted —
it exists for C-02's "By roster" view. **No screenshots**: the saved Clerk
session is expired (D-09).

## Dependencies
- Blocked by: none (R-07 landed the `orderEntries` model and `listOrderEntries`; A-08 settled the qty rollup)
- Blocks: C-02

## PRD Reference
See: docs/prd/roster-manager-and-lock.md — collected-roster surfacing. (Feature refined in the 2026-07-26 design conversation; no dedicated PRD section — this issue captures the agreed shape.)

## Implementation Notes
- Data source is already there: `jerseyRuns.listOrderEntries` returns each entry with `designId`, `designTitle`, `name`, `number`, `size`, `qty`, `submitterName`, `submitterEmail`. No backend change needed.
- Put derivations in a new `lib/jerseyBreakdown.ts` (single-responsibility, DOM-free, unit-testable) rather than swelling `lib/jerseyRunDashboard.ts`. Suggested shape:
  - `rosterLinesByDesign(entries, designOrder)` → `Array<{ designId, designTitle, lines: Array<{ name?, number?, size, qty }> }>`, designs in the order's `designIds` sequence, blank lines rendered as "Blank" the way the responses table already does.
  - `sizeTally(entries)` → `Array<{ size, qty }>` for the combined breakdown; keep it capable of per-design tallying too so C-02 can reuse it.
- Reuse the existing name/number join the responses table does: jersey label is `[name, number && "#"+number].filter(Boolean).join(" ")` → falls back to "Blank".
- New components: `components/portal/RosterBreakdown.tsx` (per-design lines) and `components/portal/SizeBreakdown.tsx` (combined tally chips). Both are reused by C-02 — keep their props entry-array-shaped, not page-specific.
- The order detail page already skips the counts query until `run` exists; gate the entries query the same way.

## TDD Approach
1. Write test: `lib/jerseyBreakdown.test.ts` — `rosterLinesByDesign` groups in design order, keeps blank lines, and drops nothing; `sizeTally` sums per size across designs. Order-detail render test: a run with two designs shows each design's name/number/size lines and the combined size chips; a design with no entries shows the empty treatment.
2. Implement: derivations in `lib/jerseyBreakdown.ts`; `RosterBreakdown` + `SizeBreakdown` components; wire the entries query and both components into `DesignSection` / the page.
3. Verify: `node scripts/verify.mjs` green; screenshots of the order detail page (light + dark) via `node scripts/snap.mjs`.
