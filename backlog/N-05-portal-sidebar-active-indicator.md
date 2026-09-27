# Issue: Portal Sidebar Active Indicator

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: no change
- [ ] API: no change
- [ ] Frontend: `components/layout/PortalShell.tsx`
- [ ] Tests: nav active-state assertions (`aria-current`)
- [ ] Review: portal screenshots across routes

## Description
`PortalShell` already computes an active nav link and marks it with `aria-current="page"`, but the active state changes instantly. Give it a sliding indicator on `layoutId` — the same primitive N-01 proves on the pricing spotlight, reused on a second surface for near-zero extra concept.

## Acceptance Criteria
- [ ] The active sidebar link is marked by an indicator that slides between links on client-side navigation
- [ ] `aria-current="page"` remains on the active link and remains the test surface; the indicator itself is `aria-hidden`
- [ ] Indicator spring comes from `lib/motion.ts`
- [ ] Works in the desktop sidebar; the mobile `<Sheet>` menu is unaffected (Base UI already animates it — do not touch it)
- [ ] Under reduced motion the indicator jumps without sliding, and the active link is still visually obvious
- [ ] Screenshots via `node scripts/snap.mjs N-05 /portal /portal/designs /portal/orders` (refresh auth first: `node scripts/snap.mjs --login`)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: N-01
- Blocks: none

## PRD Reference
See: docs/prd/motion-adoption.md — Section 5 (PO-1), Section 10 (open question on remounting)

## Implementation Notes
- Active state already exists at `components/layout/PortalShell.tsx:37` (`isActive`) and `:51` (`aria-current`). Drive the indicator off that existing computation — do not add a parallel notion of "current page".
- **Resolve the PRD's open question here:** if `PortalShell` remounts between portal routes, `layoutId` has nothing to animate *from* and the indicator will simply appear in place. Check whether the shell persists across client-side navigation in this App Router layout before building; if it remounts, either accept a non-animated first paint or say so plainly in the session report rather than faking it.
- The mobile menu uses Base UI `<Sheet>` (`PortalShell.tsx:77`) and is explicitly out of scope per the PRD.
- Same clipping caution as N-01: check whether any ancestor sets `overflow-hidden` before positioning the indicator.
- Screenshotting authenticated routes: run `node scripts/snap.mjs --login` first (the Clerk `__session` JWT expires within a minute), and invoke from PowerShell, not Git Bash — see CLAUDE.md.

## TDD Approach
1. **Write test:** assert exactly one nav link carries `aria-current="page"` for a given pathname, and that it is the correct link. This is the behavior; the slide is decoration on top of it.
2. **Implement:** add a `motion.div` with a shared `layoutId` rendered inside the active link only.
3. **Verify:** navigate between portal sections and watch the indicator travel; reduced-motion run shows an instant jump; screenshots on three routes show the indicator on the right link.
