# Issue: Removed Designs Section Reveal

## Status: pending

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `components/portal/DesignRemoval.tsx` (`RemovedDesigns`)
- [ ] Tests: existing `DesignRemoval.test.tsx` must stay green; empty vs populated rendering
- [ ] Review: order page screenshots, both states

## Description
`RemovedDesigns` returns `null` until the removed-designs query comes back non-empty, so the section pops into the order page abruptly — often after the rest of the page has settled. Animate its arrival so a section appearing late reads as intentional rather than as a layout glitch.

## Acceptance Criteria
- [ ] The removed-designs section animates in when it goes from absent to present
- [ ] It animates out if it becomes empty again
- [ ] The section is still absent (not merely transparent) when there is nothing to show, and while the query is still loading
- [ ] No layout jump on the surrounding order page content when the section arrives
- [ ] Under reduced motion the section appears without movement
- [ ] Existing `DesignRemoval.test.tsx` passes; the removal warning half of the component is unchanged
- [ ] Screenshots via `node scripts/snap.mjs N-08 <portal order route>` with and without removed designs
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: N-06
- Blocks: none

## PRD Reference
See: docs/prd/motion-adoption.md — Section 5 (PO-4)

## Implementation Notes
- The guard is at `components/portal/DesignRemoval.tsx:72`: `if (!runId || removed === undefined || removed.length === 0) return null;`. Note it conflates two different states — *loading* (`undefined`) and *genuinely empty* (`length === 0`). Only the second should ever be animated; animating the loading→loaded transition would flash the section in on every page load. Distinguish them.
- Reuse the `AnimatePresence` shape from **N-07**, not N-06 — N-06 established none, having found its panel was a Base UI dialog whose enter/exit is already CSS.
- This section sits inside a longer order page. Animating height will push content below it — verify against a real order with content underneath, not an isolated render.
- Convex queries resolve after first paint, so this animation fires slightly late by nature. That is the reason it exists; do not try to preempt it with a skeleton (out of scope).

## TDD Approach
1. **Write test:** assert the component renders nothing while the query is `undefined` and nothing when the result is empty, and renders the section when the result is non-empty. This pins the loading-vs-empty distinction that the implementation note flags.
2. **Implement:** split the loading guard from the empty guard, wrap the populated case in `AnimatePresence`.
3. **Verify:** load an order with removed designs and watch it arrive; load one without and confirm nothing appears or flashes; run the existing test file; reduced-motion run static; screenshots in both states.
