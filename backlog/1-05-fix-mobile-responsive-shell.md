# Issue: Fix Mobile Responsive Shell

## Phase: 1

## Type: bug

## Description
1-04 shipped with the mobile hamburger menu broken on `/portal` and `/admin`. The hamburger top bar does not render at 375px in a real browser, and the user also expects hamburger behavior at 768px (tablet), not just at <768px.

Investigation in 1-04's session traced this to a Tailwind v4 oddity: **every `md:` utility class referenced in `components/layout/SidebarShell.tsx` is missing from the generated CSS bundle**, even though `sm:` variants from the same directory and base utilities from `SidebarShell` itself (`translate-x-0`, `-translate-x-full`, `inset-y-0`, `w-64`, etc.) are present. Without `md:hidden` / `md:translate-x-0` / `md:ml-64` / `md:pt-0`, the mobile top bar and the desktop sidebar collide and the hamburger row gets squashed.

## Acceptance Criteria
- [ ] Hamburger top bar renders and toggles the drawer at 375px on `/portal` and `/admin`
- [ ] Hamburger also renders at 768px (tablet should use mobile-style nav, switching to fixed sidebar only at the desktop breakpoint)
- [ ] Fixed sidebar at >= the chosen desktop breakpoint (1024px / `lg` is the recommended switch)
- [ ] Active-link highlight visible on the current route
- [ ] All three layouts visually verified in a real browser at 375 / 768 / 1280
- [ ] No regressions on `/` (marketing layout)

## Dependencies
- Blocked by: 1-04

## Debugging Notes (from 1-04 session)

### Confirmed
- `app/globals.css` uses `@import "tailwindcss"` (v4) via `@tailwindcss/postcss` plugin
- Tailwind IS scanning `components/layout/` — base utilities from `SidebarShell.tsx` (e.g., `inset-y-0`, `w-64`, `translate-x-0`) appear in the compiled CSS
- `sm:` variants from `MarketingNav.tsx` and `MarketingFooter.tsx` work — generated correctly
- `md:` variants from `SidebarShell.tsx` (and only there) are missing — zero `md:` utility classes in the compiled CSS, only `--container-md` / `--radius-md` CSS variables

### To check
- Find the dev server's CSS bundle (`find .next -name "*.css"`) and grep for `md\:` — should currently return 0 matches
- Try a full dev server restart (`Ctrl+C` then `npm run dev`) — this often resolves Tailwind v4 stale-scan issues in Next.js dev. Verify `md:hidden` appears in the CSS afterward
- If restart doesn't fix it, try deleting `.next/` entirely and restarting
- If still broken, suspect a Tailwind v4 + Next.js 16 interaction; minimal repro should be reportable upstream

### Likely fix once `md:` generation works
Shift the breakpoint from `md` (768px) to `lg` (1024px) in `components/layout/SidebarShell.tsx` so tablets also get the hamburger UX:
- `md:hidden` → `lg:hidden`
- `md:translate-x-0` → `lg:translate-x-0`
- `md:ml-64` → `lg:ml-64`
- `md:pt-0` → `lg:pt-0`

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 7 (Technical Constraints — mobile responsive)

## Implementation Notes
- After restart, re-confirm by grepping the compiled CSS for `lg\:hidden`
- Visual verification in Chrome DevTools responsive mode at 375 / 768 / 1024 / 1280 is required — typecheck and curl alone are insufficient
- If a deeper Tailwind config fix is needed (e.g., explicit `@source` directives in `app/globals.css`), document it in the commit and update CLAUDE.md so future tasks don't trip on the same issue

## Resolution
`components/layout/SidebarShell.tsx` (the file with the broken `md:` classes) no longer exists — it was replaced by `PortalShell.tsx` and `AdminShell.tsx` during the shadcn migration (S-05 pilot, then S-12 admin sweep). Both already implement this issue's acceptance criteria exactly: a Sheet-based hamburger header at `lg:hidden` (covers 375px and 768px) and a fixed sidebar at `lg:flex` (1024px+), with `aria-current="page"` active-link highlighting. Verified live in a real browser via `docs/review/1-05/` screenshots (portal + marketing home, 375/768/1280, light+dark). No code change needed; closing as already fixed.
