# Issue: E2E reuses one stored big-PNG fixture and fails a test that downloads > 1 MB straight from Convex storage

## Phase: 3

## Type: infrastructure

## Size: S (~5 files, ~$1.5 Claude)

## Description

Design: `docs/architecture/0007-image-egress.md` (answer C). E2E runs
against the shared dev deployment, and Convex's free-plan limits are
**team-wide**, so a second cloud deployment wouldn't help. The tests have to
be frugal with storage egress instead, and say so when they aren't.

Today `attachBigPng` (`e2e/support/convex.ts:186`) uploads a new 3.2 MB PNG
on every run, so each run's `/_next/image` URL is new and its cache misses
pull the whole source from Convex. Nothing stops a spec from rendering an
original either. That's how 2–7 GB went unnoticed.

### Build steps

1. **One fixture blob.** Add `internalQuery _e2e:findFixture({ sha256 })`.
   It returns a `_storage` id with that sha256, or null, from
   `ctx.db.system.query("_storage")`. That's fine at dev scale (a handful of
   files). `attachBigPng` computes the PNG's sha256 (base64, as `_storage`
   stores it), reuses the blob if it's there, and uploads only on a miss.
   `_e2e:cleanup` must **not** delete a blob another E2E design row still
   points at. Delete the row, and the blob only if no row references it.
2. **Egress guard** in `e2e/support/fixtures.ts`. Add an auto fixture that
   listens on every page in the test's context (and on contexts the test
   opens through the `browser` fixture), and adds up `response.body()` bytes
   for responses whose URL matches `/api/storage/` and not `/_next/image`.
   Fail the test with the URLs listed if the total goes over 1 MB.
   A spec that really needs an original can opt out with a named tag
   (`@original-download`), and none does today.
3. **Report.** In `globalTeardown` (new, small), print one line: total
   direct-storage bytes, and how many `/_next/image` responses had
   `x-nextjs-cache: HIT` vs `MISS`.

## Done when
1. Running the image-previews spec twice in a row uploads the big PNG only the first time, and the second run's optimizer responses are cache hits.
2. A spec that renders a stored print file as a plain `<img>` fails with the storage URL in its error.

## Logic
- `_e2e:cleanup`: deleting one E2E design whose fixture blob another E2E design still uses keeps the blob; deleting the last user of it removes the blob; it still refuses a non-E2E design.

## Dependencies
- Blocked by: R3-02-design-picture-web-preview.md (built, landing on main)

## Notes
- Files likely touched: `convex/_e2e.ts`, `e2e/support/convex.ts`,
  `e2e/support/fixtures.ts`, `e2e/support/global-teardown.ts` (new),
  `playwright.config.ts`.
- Done-when 2 is proven by a throwaway spec at review, not by a committed
  failing test. The SDET can render a `preset="original"` thumbnail in a
  scratch spec and show the failure output.
- Until IMG-01 lands, the global-setup `/portal` load still pulls originals,
  so the guard **will fail** `portal.smoke` and `retire-flat-fields`. Either
  land IMG-01 first, or have the guard warn instead of fail until IMG-01 is
  on main (one constant). Decide at build time and say which in the handoff.
- Review checks: `_e2e:*` stays `internal*`, and every handler still checks
  the `E2E ` title prefix before deleting anything.
- Agents: one-off optimizer probes (`r302-probe.mjs`-style) go against a
  fixture that already exists, never a new 20 MB upload.
