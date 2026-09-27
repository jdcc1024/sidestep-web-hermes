# Issue: Palette Block Editor

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [x] Database: none (palette lives in `designs.blocks` from D-02)
- [x] API: swatch add/update/remove/reorder within the single palette block (via block mutations)
- [x] Frontend: palette block editing in the shared editor — hex picker, role select, label + Pantone code fields, swatch reorder
- [x] Tests: swatch validation; palette editor interaction tests

## Description
Add palette editing to the shared block editor. The owner/admin can add the one palette block and manage an unlimited, ordered set of swatches — each a hex color picked on-screen, a role (primary/secondary/accent), an optional free label, and an optional free-text Pantone code. Pantone is a label only; no API or dataset.

## Acceptance Criteria
- [x] A design can hold at most one palette block; adding a second is prevented
- [x] Swatches: add, remove, reorder; each has a hex (required), role (primary/secondary/accent defaults), optional label, optional Pantone code text
- [x] Hex chosen via an on-screen color picker; hex is the stored source of truth
- [x] Optional caption on the palette block
- [x] Swatch edits validate against the D-02 validators and persist to `designs.blocks`
- [ ] Renders correctly light + dark — **unverified**: the saved Clerk session in
      `.auth/state.json` has expired, so `snap.mjs` photographed the sign-in wall
      instead of the portal. Needs `node scripts/snap.mjs --login` (human, once).
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: D-03
- Blocks: D-06

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 2, Section 5 (palette block), Section 6 (swatch model / Pantone decisions), Appendix slice 3

## Implementation Notes
- Use native `<input type="color">` or a lightweight shadcn-styled picker; do not add an external color/Pantone service.
- Pantone code is a plain text label (e.g. "PMS 186 C") — no validation beyond length; production treats it as the source of truth, hex is a screen approximation.
- Plug into the `DesignBlockEditor` from D-03 as the palette block-type; keep swatch-row editing a self-contained subcomponent.

## TDD Approach
1. Write test: single-palette rule; swatch add/remove/reorder; hex + role required/valid; Pantone label persists.
2. Implement: palette block-type editor + swatch row UI wired into the shared editor.
3. Verify: component + convex tests green; manual light/dark check.
