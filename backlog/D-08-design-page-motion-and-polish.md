# Issue: Design Page Motion and Polish

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: none
- [ ] API: none
- [ ] Frontend: motion, hover states, transitions, and visual polish across the design page + editor
- [ ] Tests: visual/interaction sanity; no functional regressions

## Description
The deliberately-deferred polish pass. After the functional skeleton lands (blocks, palette, galleries, shared editor, admin, order image), add tasteful motion, hover states, and transitions to bring the design page to life. Scope is intentionally open and should start with a short human design discussion before implementation.

## Acceptance Criteria
- [ ] Human design direction agreed first (what moves, how much, where) — see note below
- [ ] Motion/hover/transition polish applied to the design page + block editor per the agreed direction
- [ ] Respects reduced-motion preferences
- [ ] No functional regressions in blocks, palette, galleries, or editing
- [ ] All tests pass

## Dependencies
- Blocked by: D-06, D-07
- Blocks: none

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 2 (skeleton first), Section 5 (Out of Scope: motion is a later task), Appendix slice 8

## Implementation Notes
- **Human-in-the-loop:** per the grill (#10) and PRD, motion direction is a taste decision. When picked up, stop and raise it under `## NEEDS DECISION` (or run a short `/grill-me`) to agree scope before building, and record the agreed direction in this file.
- Keep it tasteful and performance-safe; honor `prefers-reduced-motion`.
- This exists as a placeholder so the backlog reflects the full plan; refine scope when the skeleton is done.

## TDD Approach
1. Agree direction with a human; capture it in this file.
2. Implement the agreed motion/polish; guard reduced-motion.
3. Verify: existing tests green; manual pass across breakpoints + light/dark.
