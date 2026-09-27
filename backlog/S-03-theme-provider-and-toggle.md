# Issue: Theme Provider, Dark Mode, and Theme Toggle Component

## Phase: 3

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: `<ThemeProvider>` in root layout; dark-mode CSS variables in `globals.css`; reusable `<ThemeToggle>` component
- [ ] Tests: Toggle component renders; preference persists across reloads

## Description
Wire `next-themes` `<ThemeProvider>` into the root layout, define shadcn's dark-mode CSS variables in `app/globals.css` using Tailwind v4's `@theme` directive, and build a reusable `<ThemeToggle>` component. The toggle is not yet placed in any nav/header — that happens during each surface sweep. This issue establishes the theming substrate so every later issue can drop a working toggle into place without rebuilding the mechanism.

## Acceptance Criteria
- [ ] `<ThemeProvider>` from `next-themes` wraps the app in `app/layout.tsx` with `attribute="class"` and `defaultTheme="system"`
- [ ] Light and dark CSS variables defined in `app/globals.css` using `@theme` directive (Tailwind v4 style, not v3 `tailwind.config.ts`)
- [ ] `<ThemeToggle>` component lives at a shared location (e.g. `components/theme-toggle.tsx`), uses `useTheme()` from `next-themes`, renders lucide-react `Sun`/`Moon` icons inside a shadcn `<Button variant="ghost" size="icon">`
- [ ] Theme preference persists across reloads (next-themes default storage)
- [ ] No FOUC on initial render (`suppressHydrationWarning` on `<html>`)
- [ ] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: S-02
- Blocks: S-05

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 5 (In Scope: dark mode) and Section 7 (Technical Constraints: Tailwind v4 `@theme`)

## Implementation Notes
- shadcn's documented dark-mode setup assumes v3 `tailwind.config.ts darkMode: "class"` — translate that into Tailwind v4's `@theme` blocks for `:root` and `.dark`
- `suppressHydrationWarning` belongs on `<html>` per next-themes docs
- Toggle UI: copy the shadcn docs example (Sun/Moon icons with `next-themes`)
- Component goes in a shared spot since all three shells will import it (S-05, S-09, S-12)
- Do not place the toggle in any nav/header yet — that is done as part of each surface sweep

## TDD Approach
1. Write a vitest test: render the toggle wrapped in `<ThemeProvider>`, click it, assert the next-themes mock receives the new theme value
2. Implement provider, CSS variables, and toggle
3. Manually verify in browser at `/` that toggling switches the body class and persists across a hard reload
