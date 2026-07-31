# Issue: Start Collecting Panel Enter and Exit

## Status: pending

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `components/portal/StartCollecting.tsx`
- [ ] Tests: open/close behavior; panel content present when open, absent when closed
- [ ] Review: portal order page screenshots, both states

## Description
The first use of `AnimatePresence` in the codebase, and the first thing here that CSS structurally cannot do: `StartCollecting` renders its deadline panel behind an `open` state, so React unmounts it instantly on close and it can never fade out. This slice establishes the enter/exit pattern that N-07 and N-08 reuse.

## Acceptance Criteria
- [ ] The deadline panel animates in when opened and animates **out** when closed — it is not simply removed
- [ ] Rapid open/close does not leave a stuck or duplicated panel
- [ ] Transition values come from `lib/motion.ts`
- [ ] Under reduced motion the panel appears and disappears without movement, and remains fully usable
- [ ] Existing behavior unchanged: deadline entry, validation error display, busy state, and the success toast all work exactly as before
- [ ] Screenshots via `node scripts/snap.mjs N-06 <portal order route>` in both open and closed states
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: N-01
- Blocks: N-07, N-08

## PRD Reference
See: docs/prd/motion-adoption.md — Section 1 (exit animations), Section 5 (PO-2), Section 7

## Implementation Notes
- State lives at `components/portal/StartCollecting.tsx:32` (`open`), with `deadline`, `error`, and `busy` alongside it. Only the render of the panel changes; leave the mutation path and toast alone.
- `AnimatePresence` requires the conditional child to be a **direct** child with a stable `key`. Wrapping the conditional in an extra div defeats it — this is the most common way this API silently does nothing.
- Animate `opacity` plus a small `y` or `height`. If animating height, be deliberate: it reflows siblings, which is acceptable for a disclosure panel but must not cause the page to jump under the user's cursor.
- Toasts are `sonner`'s job and already animated — do not add motion to the success path.
- This is the pattern-setting issue for exit animations. Whatever shape lands here, N-07 and N-08 copy — so keep it simple and readable rather than clever.

## TDD Approach
1. **Write test:** open the panel and assert its fields are in the document; close it and assert they are gone. In jsdom `AnimatePresence` resolves immediately, so this proves the close path actually unmounts rather than leaving orphaned content behind.
2. **Implement:** wrap the conditional panel in `AnimatePresence` with a keyed `motion.div`.
3. **Verify:** open/close repeatedly in the browser watching for stuck panels; confirm the deadline submit path still works end to end; reduced-motion run shows instant appearance; screenshots in both states.
