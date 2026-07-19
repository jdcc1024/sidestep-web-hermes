# Issue: Fix Broken useSearchParams in IntakeForm

## Status: done

## Phase: 1

## Type: bug

## Description
`f964c62` ("Intake form takes value from home page, and fix dark mode") added `useInitialQty()` to `components/intake/IntakeForm.tsx`, which calls `useSearchParams().get("qty")` with no null guard. Per Next.js docs, `useSearchParams()` returns `null` when its consumer isn't wrapped in a `<Suspense>` boundary during static rendering — and it also returns `null` in a plain RTL unit-test render with no router context. `app/intake/page.tsx` never added the required `<Suspense>` wrapper around `<IntakeForm />`, so the hook crashed with `Cannot read properties of null (reading 'get')`. This broke `npm test`, which blocks `scripts/verify.mjs` — and therefore blocks `dag-update.js complete` — for every task, not just intake-related ones.

Discovered while verifying 1-05 (an unrelated, already-fixed task): its own work required no code, but `node scripts/verify.mjs` failed on this pre-existing regression before a receipt could be issued.

## Acceptance Criteria
- [x] `useInitialQty` guards against a `null` `searchParams` return
- [x] `app/intake/page.tsx` wraps `<IntakeForm />` in a `<Suspense>` boundary
- [x] `npm test` passes (`IntakeForm.test.tsx` no longer crashes)
- [x] No behavior change to the qty-prefill feature

## Dependencies
- Blocked by: none

## Resolution
- `components/intake/IntakeForm.tsx`: `searchParams.get("qty")` → `searchParams?.get("qty")`
- `app/intake/page.tsx`: `<IntakeForm />` wrapped in `<Suspense fallback={null}>`
