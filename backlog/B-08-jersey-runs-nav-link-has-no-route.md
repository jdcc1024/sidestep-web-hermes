# Issue: Jersey Runs nav link has no route

## Status: done

## Phase: 1

## Type: bug

## Description

The portal sidebar's third section link pointed at `/portal/runs`, which has no
`page.tsx`. Clicking "Jersey Runs" 404s. Found while capturing screenshots for
N-05 (the sliding active indicator), which correctly parked itself on the dead
link if you landed there.

Either build the section or drop the link.

## Resolution

**Dropped the link.** A jersey run belongs to an order, not to the captain
directly:

- Run setup and responses are reached from `/portal/orders/[id]`, which already
  links to `run/setup` and `run/responses`.
- Runs the user has *responded to* (other captains' runs) are already listed on
  `/portal` under "Your jersey run responses".
- The PRD (`docs/prd/sidestep-website-phase1.md`) describes runs only as a
  per-order capability. It never asks for a top-level runs section.

A `/portal/runs` index would therefore have re-listed the orders already on
`/portal`, so building it would have been new product scope rather than a bug
fix. Filed as **P-01** (needs-human) in case the human wants that section after
all.

## Acceptance Criteria

- [x] Clicking Jersey Runs in the portal nav reaches a real page, or the link is removed
- [x] No portal nav link points at a route that does not exist
- [x] PortalShell tests cover whichever resolution is chosen

## Dependencies

- Blocked by: none

## Notes

The test added is deliberately general rather than a pin on the one bad href:
`PortalShell.test.tsx` renders the nav, reads every `href`, and asserts a
matching `app/<path>/page.tsx` exists. Any future section added to
`portalLinks` before its route exists fails there. Nav hrefs are all static, so
no dynamic-segment resolution is needed.
