# Issue: Application Shell

## Phase: 1

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: Three distinct Next.js layouts (marketing, portal, admin); responsive navigation components; route structure
- [ ] Tests: Each layout renders without errors; navigation links point to correct routes; mobile menu opens/closes

## Description
Create the three Next.js App Router layouts that frame the entire site: (1) the public marketing layout with top navigation and footer, (2) the authenticated customer portal layout with sidebar navigation and user menu, and (3) the admin layout with admin-specific sidebar. Establishes the route hierarchy and shared UI scaffolding that every feature issue drops content into. Fully responsive and mobile-first.

## Acceptance Criteria
- [ ] Public layout (`app/(marketing)/layout.tsx`): top nav with logo + links (Customize, Process, Pricing, Get a Quote), sticky on scroll, footer with contact email and copyright
- [ ] Portal layout (`app/(portal)/layout.tsx`): sidebar with links (My Orders, My Designs, Jersey Runs), user avatar menu (sign out), mobile hamburger menu
- [ ] Admin layout (`app/(admin)/layout.tsx`): sidebar with links (All Orders, All Designs, Customers, Leads), admin badge indicator
- [ ] All three layouts are fully responsive — tested at 375px (mobile), 768px (tablet), 1280px (desktop)
- [ ] Navigation active states highlight the current route
- [ ] Sidestep brand colors (teal) and logo are applied consistently
- [ ] Unauthenticated users attempting to access `/portal` or `/admin` are redirected (handled by auth middleware from 1-03)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 1-03
- Blocks: 2-01, 2-02, 2-03, 2-04, 2-05, 2-06, 2-07, 2-08, 2-09, 2-10, 2-11, 2-12, 2-13

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 7 (Technical Constraints — mobile responsive)

## Implementation Notes
- Use Next.js route groups: `(marketing)`, `(portal)`, `(admin)` to share layouts without affecting URL paths
- Teal color from current site: inspect `https://sidestep.design` for exact hex — use as the Tailwind primary color
- Logo: download from current site assets or use a text-based fallback until client provides files
- Portal and admin sidebars should collapse to a hamburger on mobile
- Use Clerk's `<UserButton>` in the portal layout's user menu area
- Keep components in `components/layout/` — one file per layout section (Navbar, Sidebar, Footer)

## TDD Approach
1. Write test: Render each layout component with React Testing Library; assert all nav links are present and aria-labels are set
2. Implement: Create the three layout files and their child navigation components
3. Verify: Navigate between all routes in the browser; check mobile viewport in DevTools; confirm no layout shift on route change
