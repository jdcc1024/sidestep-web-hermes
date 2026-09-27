# Issue: SEO, Performance, and Mobile Polish

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: Next.js metadata, image optimization, accessibility fixes, final mobile responsiveness pass
- [ ] Tests: Lighthouse score targets; axe accessibility audit passes; TypeScript compiles clean

## Description
Final pre-launch polish pass. Add Next.js metadata (title, description, OG image) to all pages. Run a Lighthouse audit and fix the top performance issues (primarily image optimization and font loading). Run an axe accessibility audit and fix critical issues (heading hierarchy, ARIA labels, color contrast). Final review of all pages at 375px mobile — fix any layout breaks or unusable UI that survived earlier development.

## Acceptance Criteria
- [ ] Every page has a unique `<title>` and `<meta name="description">` via Next.js `generateMetadata`
- [ ] Homepage has `og:title`, `og:description`, and `og:image` (jersey photo or brand image)
- [ ] All images use Next.js `<Image>` component with correct `width`, `height`, and `alt` attributes
- [ ] Jersey photos (provided by client) are added to the hero and marketing sections (replacing placeholders)
- [ ] Lighthouse Performance score ≥ 85 on mobile for the marketing homepage
- [ ] Lighthouse Accessibility score ≥ 90 on all public pages
- [ ] axe DevTools finds zero critical accessibility violations on all pages
- [ ] All pages are usable and visually correct at 375px (iPhone SE viewport)
- [ ] TypeScript compiles with zero errors (`tsc --noEmit`)
- [ ] ESLint reports zero errors
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-13 (all Phase 2 features must be built before the final polish pass)
- Blocks: none (this is the last issue before launch)

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 7 (Technical Constraints — mobile responsive), Section 8 (Success Metrics)

## Implementation Notes
- Next.js metadata: use the App Router `metadata` export for static pages and `generateMetadata` for dynamic pages
- OG image: can be a simple static image placed in `/public/og-image.jpg` — no dynamic OG generation needed for Phase 1
- Font loading: use `next/font` for any custom fonts to avoid FOUT
- Lighthouse audits: run via Chrome DevTools on the production build (`npm run build && npm start`) — not the dev server
- Jersey photos: client to provide before this issue is started; this issue is explicitly blocked on having real photos
- If client photos aren't ready, complete all other acceptance criteria and leave photo placeholders in place

## TDD Approach
1. Write test: Run `tsc --noEmit` and ESLint → assert zero errors (these are automated checks, not unit tests)
2. Implement: Add metadata to all pages, swap in `<Image>` components, add jersey photos, fix any axe violations found during audit
3. Verify: Run Lighthouse in Chrome DevTools on the production build; run axe DevTools extension on every public page; manually test on a physical iOS and Android device if available, or Chrome DevTools mobile simulator
