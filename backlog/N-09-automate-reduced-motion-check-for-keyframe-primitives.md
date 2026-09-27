# Issue: Automate Reduced-Motion Check For Keyframe Primitives

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: no change expected — this is a check, not a fix
- [ ] Tests: `scripts/check-reduced-motion.mjs`
- [ ] Review: the check's console output

## Description

N-06 added a `prefers-reduced-motion` block to `app/globals.css` suppressing
movement for `components/ui/*`. It covers two mechanisms:

1. **tw-animate-css keyframes** — dialog, dropdown, popover, select, tooltip.
2. **Base UI starting/ending-style transitions** on Tailwind's standalone
   `translate` property — the sheet.

`scripts/check-reduced-motion.mjs` only proves mechanism 2, via the marketing
nav's mobile sheet. That is the only such primitive on a route that needs no
Clerk session — every dialog/select/popover in the app is behind `/portal`,
`/admin`, `/dev/components` (all `auth.protect()`ed), or `/run/<id>` (public,
but needs a seeded run).

Mechanism 1 was verified by hand during N-06 — sampling the real
`StartCollecting` dialog gave 6 frames in flight at no-preference (0.950 →
0.996 opening, 0.989 → 0.954 closing) and 0 under reduce. That measurement is
not committed, so nothing catches a regression in it.

## Acceptance Criteria
- [ ] The check drives a tw-animate-css keyframe primitive (dialog, select, popover, dropdown or tooltip)
- [ ] Movement is observed under `no-preference` and none under `reduce`, in the same shape as the existing cases
- [ ] Sampling reads the property the animation actually uses — `transform` for the keyframes, `translate` for Tailwind utilities
- [ ] The check needs no seeded fixture data, or documents the seed it needs
- [ ] `node scripts/check-reduced-motion.mjs` stays green

## Dependencies
- Blocked by: N-06
- Blocks: none

## PRD Reference
See: docs/prd/motion-adoption.md — Section 9 (Testing Strategy), Section 8 (reduced-motion success metric)

## Implementation Notes

- **The property matters.** Tailwind v4 emits `translate-x-*` as the standalone
  `translate` property, so a `transform` sampler reads `none` for the sheet's
  entire slide and concludes nothing moved. The keyframes are the opposite:
  `enter`/`exit` set `transform`, so scale is read off the matrix (`m11`) —
  `m41` is useless there because the dialog's static `-translate-1/2` centring
  swamps it. This cost real time in N-06; don't re-derive it.
- The likely approach is reusing `snap.mjs`'s Clerk session (`.auth/state.json`)
  so the check can reach a portal dialog. Weigh that against the fragility it
  adds — the check currently needs nothing but a dev server, which is a large
  part of why it is trustworthy. An alternative is asking the human to make
  `/dev/components` public, which is a question for the human, not a
  decision to take unilaterally.
- Don't lower the bar by asserting on class names instead of measured motion.
  The existing four cases sample real frames; matching that is the point.
