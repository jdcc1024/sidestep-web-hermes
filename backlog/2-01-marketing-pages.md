# Issue: Marketing Pages

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: None (static content)
- [ ] API: None
- [ ] Frontend: Hero, Customization, Process, and FAQ sections on the marketing site
- [ ] Tests: Each section renders with correct content; page is accessible; mobile layout verified

## Description
Build the four informational sections of the public marketing site: hero (headline, CTA, jersey photo), customization options (fabric, neckline, sleeve choices), design-to-delivery process (3-step flow), and FAQ (minimum order, timeline, design assistance, Vancouver-only). These replace the existing `sidestep.design` brochure site with a polished, brand-consistent experience. Uses placeholder images until jersey photos are provided by the client.

## Acceptance Criteria
- [ ] Hero section: headline, sub-headline, primary CTA button linking to the intake form, jersey photo (or placeholder)
- [ ] Customization section: fabric options (Athletic Mesh, Smooth Polyester), neckline (Crew, V-Neck), sleeve style (Regular, Raglan) — displayed as cards or an illustrated options grid
- [ ] Process section: 3-step flow (Design Template → 3D Mock-up → Production) with icons or step numbers
- [ ] FAQ section: covers minimum order (10, or 5 with surcharge), timeline (4 weeks), design assistance, Vancouver area only
- [ ] All sections are reachable via the marketing nav anchors (#customize, #process, #pricing, #quote)
- [ ] Fully responsive at 375px, 768px, 1280px
- [ ] Passes basic accessibility check (heading hierarchy, alt text on images, sufficient contrast)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 1-04
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 2 (Proposed Solution), Section 5 (In Scope)

## Implementation Notes
- Content is static — use Next.js Server Components for all sections (no `"use client"` needed)
- Sections live in `app/(marketing)/page.tsx` as a single long-scrolling page with anchor IDs
- Extract each section as its own component in `components/marketing/` (HeroSection, CustomizeSection, ProcessSection, FaqSection)
- FAQ should use a simple accordion or expandable UI for mobile UX
- Client has jersey photos coming — use a high-quality placeholder (e.g., a solid teal gradient) for now with a clear `// TODO: replace with client photos` comment
- Pull exact teal hex from the current site before implementing

## TDD Approach
1. Write test: Render the marketing page and assert each section heading is present; assert CTA button links to `/#quote`
2. Implement: Build each section component with hardcoded content matching the existing site's information
3. Verify: View in browser at all three breakpoints; run axe accessibility check; confirm anchor links scroll correctly
