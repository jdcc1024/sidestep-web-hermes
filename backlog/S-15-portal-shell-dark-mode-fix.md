# Issue: Portal Shell Dark-Mode Fix

## Phase: 3

## Type: bug

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `components/layout/PortalShell.tsx`, `components/portal/OrderTimeline.tsx`, and the teal-accent hover links and brand-teal CTA buttons sprinkled across `app/portal/**/page.tsx`
- [ ] Tests: Existing tests continue to pass

## Description
S-14 swept the **inner** portal page bodies (`app/portal/**/page.tsx`) onto shadcn theme tokens, but two shared components were left behind and never got `dark:` variants:

- `components/layout/PortalShell.tsx` — root `bg-zinc-50`, sidebar `bg-white border-zinc-200`, mobile top bar `border-zinc-200 bg-white`, nav active `bg-teal-50 text-teal-700`, nav inactive `text-zinc-700 hover:bg-zinc-100`, SheetContent `bg-white text-zinc-900`, account caption `text-zinc-600` — **zero `dark:` siblings**. AdminShell pairs every one of these with a proper dark counterpart, so dark mode in the portal renders a stark light shell wrapping dark page bodies.
- `components/portal/OrderTimeline.tsx` — `bg-zinc-200` separators, `text-zinc-900` / `text-zinc-500` labels, `border-zinc-300 bg-white text-zinc-400` upcoming dots, `bg-white text-teal-700` current dot — all hardcoded light.

In addition, the portal pages still have ~10 `text-teal-700 hover:text-teal-800` brand-accent links without `dark:text-teal-300` siblings (admin pairs every one), and the brand CTA buttons (`bg-teal-600 text-white shadow-sm hover:bg-teal-700`) are hand-rolled link buttons instead of the shadcn `<Button>` primitive.

## Acceptance Criteria
- [ ] PortalShell renders correctly in dark mode and matches AdminShell's surface/border/sidebar dark-mode pattern exactly
- [ ] OrderTimeline renders correctly in dark mode — separators, dots, and labels all theme-aware
- [ ] Every `text-teal-700` brand-accent link in `app/portal/**/page.tsx` has a `dark:text-teal-300` sibling
- [ ] Brand-teal CTA link buttons across portal pages migrated to `<Button render={<Link>...</Link>}>` matching the MarketingNav pattern (`bg-teal-600 text-white hover:bg-teal-700`)
- [ ] No regressions to layout, spacing, or exported component APIs
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass

## Dependencies
- Blocked by: S-14 (completes the page-level work; this finishes the shell + shared-component gap S-14 didn't cover)

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 8 (Success Metrics: theme toggle works on every surface)

## Implementation Notes
- The AdminShell dark-mode classes are the spec — match them line-for-line. Both shells should look interchangeable in dark mode.
- For the OrderTimeline "current" dot (`bg-white text-teal-700 ring-2 ring-teal-100`), use `bg-card` + `dark:bg-card` and `dark:text-teal-300 dark:ring-teal-900/40` so the dot reads on both backgrounds.
- The brand-teal Button override is exactly the MarketingNav pattern: `className="bg-teal-600 text-white hover:bg-teal-700"`.

## TDD Approach
1. Run existing test suite to capture green baseline
2. Update PortalShell — toggle theme on `/portal` and verify shell/content seam is gone
3. Update OrderTimeline — toggle theme on an order detail page and verify dots/separators/labels
4. Sweep teal-link siblings and CTA Button migration page by page
5. Final pass: `npm run build/typecheck/lint/test`
