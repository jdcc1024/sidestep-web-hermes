# Issue: Start Collecting Panel Enter and Exit

## Status: done

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

## Resolution

**The premise was wrong, and the real defect was next door.** The "panel" is not
an `open`-gated inline div — `StartCollecting` renders a Base UI `<Dialog>`
(and has since M-05 created it; this issue read the `open` state at `:32` and
assumed the render). Base UI holds the popup mounted for the length of its exit
animation, and `components/ui/dialog.tsx` already carries
`data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95`. So it
already animates out rather than being removed.

Measured on the real surface (`/portal/orders/<id>`, Playwright, sampling the
popup's computed scale every frame): **6 frames in flight — 0.950, 0.979,
0.990, 0.996 opening, then 0.989, 0.954 closing.** Those last two are the exit,
which is the criterion this issue was written to add.

Wrapping it in `AnimatePresence` was therefore not just unnecessary but
forbidden: CLAUDE.md and this PRD's own Out of Scope both say converting
`components/ui/*` away from `tw-animate-css` is a regression.

What was genuinely unmet was criterion 4. Nothing suppressed those CSS
animations under reduced motion — `<MotionConfig reducedMotion="user">` covers
Motion only, and the repo had no `prefers-reduced-motion` rule at all. Every
`components/ui/*` primitive zoomed or slid for users who had asked it not to.
Fixed in `app/globals.css` for both CSS mechanisms; same measurement under
`reducedMotion: "reduce"` now reports **0 frames in flight, settling at scale 1,
opacity 1**.

## Acceptance Criteria
- [x] The deadline panel animates in when opened and animates **out** when closed — it is not simply removed *(already true via Base UI + tw-animate-css; measured, not assumed)*
- [x] Rapid open/close does not leave a stuck or duplicated panel *(test: three open/close cycles, then assert a single deadline field)*
- [x] Transition values come from `lib/motion.ts` — **n/a**: no Motion component was added, so there is no transition to centralize
- [x] Under reduced motion the panel appears and disappears without movement, and remains fully usable *(the actual fix)*
- [x] Existing behavior unchanged: deadline entry, validation error display, busy state, and the success toast all work exactly as before
- [x] Screenshots via `node scripts/snap.mjs N-06 <portal order route>` — closed state only; `snap.mjs` navigates and cannot open a dialog. Nothing about this change is visible at default motion settings anyway
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: N-01
- Blocks: N-07, N-08

## PRD Reference
See: docs/prd/motion-adoption.md — Section 1 (exit animations), Section 5 (PO-2), Section 7

## What shipped

- `components/portal/StartCollecting.tsx` — **unchanged.** The component had no
  test file, so `StartCollecting.test.tsx` was added instead: 8 tests pinning
  the behaviour animation must not disturb (fields absent until open, close
  genuinely unmounts, rapid cycling leaves one panel, both validation paths, the
  success path's mutation args + toast + close, and the failure path).
- `app/globals.css` — a `prefers-reduced-motion: reduce` block, the CSS-side
  counterpart to `<MotionConfig reducedMotion="user">`. Two rules, because the
  primitives move by two different mechanisms:
  1. **tw-animate-css keyframes** (dialog, dropdown, popover, select, tooltip) —
     zero `--tw-enter-*`/`--tw-exit-*` translate/scale/rotate. Opacity and blur
     stay: a fade is not movement, and keeping the animation *running* rather
     than `animation: none` is what lets Base UI still delay unmount, so a
     closing dialog fades instead of vanishing.
  2. **Base UI starting/ending-style transitions** (sheet) — these transition
     Tailwind's standalone `translate` property, which rule 1 cannot reach.
     Cancelled in those two states only, scoped to `[data-slot="sheet-content"]`
     so static centring like the dialog's `-translate-1/2` survives.
- `scripts/check-reduced-motion.mjs` — a fifth case covering mechanism 2 via the
  marketing nav's mobile sheet. It is the only `components/ui/*` primitive on a
  route needing no session; mechanism 1 has no publicly reachable instance, so
  it was verified by hand this session and left for **N-09** to automate.

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
