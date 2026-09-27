# Issue: shadcn Compatibility Smoke Test

## Phase: 3

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: None
- [ ] API: None
- [ ] Frontend: Throwaway page renders `<Button>` from shadcn at `/dev/smoke`
- [ ] Tests: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` continue to pass

## Description
Confirm shadcn/ui installs and runs cleanly against the current Next 16 + React 19 + Tailwind v4 stack before committing to the full migration. The unknown is Tailwind v4 — the shadcn CLI historically assumes v3 `tailwind.config.ts`, and the codebase uses the v4 `@theme` directive in `app/globals.css`. A short spike that runs `npx shadcn init`, adds `Button`, renders it on a throwaway route, and proves the build is still green resolves the highest-risk open question in the PRD.

## Acceptance Criteria
- [x] `npx shadcn init` completes without manual workarounds (or workarounds are documented)
- [x] `<Button>` primitive renders on a throwaway page at `/dev/smoke`
- [x] `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` all pass
- [x] Smoke-test commit can be reverted cleanly if migration is abandoned
- [x] Decision recorded: proceed with sweep, or document blocking incompatibility and stop
- [x] All tests pass
- [x] No regressions in existing tests

## Outcome (2026-05-23)

**Decision: PROCEED with the S-track migration.**

### What happened
- `npx shadcn@latest init -d -y` ran clean against Tailwind v4 + Next 16.2.6 + React 19.2.4. No manual workarounds.
- shadcn CLI version installed: **`shadcn@^4.8.0`**.
- The init wizard detected Tailwind v4 (`✔ Validating Tailwind CSS. Found v4.`) and chose the v4-native path: no `tailwind.config.ts` was written; instead, `app/globals.css` was rewritten with `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@custom-variant dark`, an expanded `@theme inline` block, and `:root` / `.dark` token sets in `oklch`.
- `components.json` was created with `style: "base-nova"` and `baseColor: "neutral"`.
- `components/ui/button.tsx` and `lib/utils.ts` were created on init (the `add button` step is satisfied without a separate invocation).

### Notable finding — Base UI, not Radix
The `base-nova` style imports primitives from **`@base-ui/react`** (e.g. `import { Button as ButtonPrimitive } from "@base-ui/react/button"`), not `@radix-ui/react-*`. This is the modern shadcn registry style and is a deliberate substrate change. S-02 should install the rest of the primitives in this style; the AI-and-human reference catalog from S-04 should reflect the Base UI surface area, not the Radix one.

### Carry-over for S-03 (theme/fonts)
The old `globals.css` referenced `var(--font-geist-sans)` / `var(--font-geist-mono)` — the new file references `var(--font-sans)` / `var(--font-geist-mono)`. The layout still injects Geist as `--font-geist-sans`. Aligning the font binding (rename layout variable to `--font-sans`, or remap inside `@theme`) is an S-03 concern, not a smoke-test blocker.

### Build gate
| Gate        | Before    | After     |
|-------------|-----------|-----------|
| typecheck   | clean     | clean     |
| lint        | 1 pre-existing warning | same 1 warning, 0 new |
| test        | 261/261   | 261/261   |
| build       | green     | green, `/dev/smoke` prerendered as static |

## Dependencies
- Blocked by: none
- Blocks: S-02

## PRD Reference
See: docs/prd/shadcn-migration.md — Section 2 (Proposed Solution, step 1) and Section 10 (Open Questions)

## Implementation Notes
- Tailwind v4 uses `@theme` in `app/globals.css`, not `tailwind.config.ts`. shadcn's CLI may try to write v3-style config — accept what it generates, then port to v4 syntax if needed
- This is a one-commit spike; do not yet add the full primitive set
- Throwaway route lives at `app/dev/smoke/page.tsx` and is removed before S-13 closes the migration (or earlier if not needed)
- If the spike fails, file a blocker, leave the install half-done in a discardable commit, and stop — do not attempt to force-install or hand-patch primitives

## TDD Approach
1. Verify `npm run build` baseline is green on master before installing
2. Install: `npx shadcn init`; `npx shadcn add button`; create `app/dev/smoke/page.tsx` rendering `<Button>`
3. Re-run full build gate; if green, document the shadcn version used and proceed; if red, file the blocker and stop
