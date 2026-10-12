# Issue: Upgrade Convex to 1.46 and convex-test to 0.0.61, redeploy dev

## Phase: 3

## Type: infrastructure

## Size: S (~4 files + `convex/_generated/`, ss-dev by hand; Claude ≤ $2 only if convex-test fallout; SDET ~$0.5)

## Description

Design: `docs/architecture/next-upgrade.md` (section "U-02 and U-03, as filed").
Follows U-01 (on main at 636dad6).

One variable: the Convex client, CLI and its test harness.

- `convex` 1.39.1 → 1.46.0. It pins `ws 8.21.0`. Today `convex@1.39.1`
  brings `ws@8.18.0`, which `npm audit --omit=dev` reports as **High**
  (GHSA-58qx-3vcg-4xpx uninitialized memory disclosure, GHSA-96hv-2xvq-fx4p
  fragment DoS, range 8.0.0–8.20.1). The plan of 2026-10-10 said "1
  moderate". It was re-rated by 2026-10-12. Our exposure is low: `ws` is
  only used by Node-side Convex clients (the CLI, `npx convex run` in e2e),
  not by the browser or the Next server. It is still the only live audit
  finding either U-02 or U-03 clears.
- `convex-test` 0.0.53 → 0.0.61. It has to move with `convex`:
  0.0.61's peer is `convex ^1.43.0`.

Changes in between that touch us (from the convex CHANGELOG 1.40–1.46 and
convex-test 0.0.54–0.0.61):

| Change | Where we'd feel it |
|---|---|
| 1.42.2: fixes `ConvexProviderWithClerk` ignoring session changes in some cases. 1.44: `ConvexProviderWithAuth` context is now referentially stable | `app/providers.tsx`. Should help, not hurt. The e2e auth flows check it |
| 1.44: codegen adds `env` (`CONVEX_SITE_URL`, `CONVEX_CLOUD_URL`) to `_generated/server.d.ts` | `convex/_generated/*`. Regenerated, not hand-edited |
| 1.46: `.optional()` on validators. `FunctionReference_future`. `_args` / `_returnType` deprecated | We use only `FunctionReturnType` (`components/orderList/shared.ts`, `components/portal/order/shared.ts`), which still works |
| 1.40: `npx convex dev --local/--cloud` removed | We don't use them |
| convex-test 0.0.54: only one `.paginate()` per function | We have no `.paginate()` |
| convex-test 0.0.57: `args` must be an object or `v.any()` | All our `args` are objects (grep) |
| convex-test 0.0.58: `fetch` / timers throw inside queries, mutations and `t.run` callbacks | `convex/users.test.ts` stubs `fetch` for the `refreshFromClerk` **action**, which is allowed. A setup `fetch` inside `t.run` would now throw |
| convex-test 0.0.59: better global isolation with `vi.stubGlobal` | `convex/users.test.ts` relies on `vi.stubGlobal("fetch", …)` reaching an action. It is the most likely test to change behaviour |

### Build steps

1. **Bump.** `convex` → `^1.46.0`, `convex-test` → `^0.0.61` (latest on the
   day). Run `npm install`. Check:
   - `npm ls convex` shows one copy, `npm ls ws` shows `8.21.x` or later
   - `npm audit --omit=dev` lists no `ws` or `convex` entry

   If the Hermes scan blocks the install, stop and ask JCC to run the
   install line himself.
2. **Regenerate + redeploy dev.** Check that `CONVEX_DEPLOYMENT` in
   `.env.local` starts with `dev:` (print the prefix only, never the value).
   Then run `npx convex dev --once`. This regenerates `convex/_generated/`
   and pushes the unchanged functions to the **dev** deployment with the
   new CLI. Commit `_generated/` as its own commit. If the CLI also rewrites
   `convex/_generated/ai/*` or the `convex-ai` block in `AGENTS.md` /
   `CLAUDE.md`, commit that as it is, in its own commit. Don't run
   `npx convex ai-files install` (out of scope). Never `npx convex deploy`.
3. **Verify.** `npm run verify -- --build`. If a convex-test change breaks
   an existing test, you may change the test's **setup** to the new harness
   rule (for example, move a `fetch` out of a `t.run` callback), and
   list each change in the handoff for SDET. Never change or remove an
   assertion. If an assertion itself now fails, that's a real behaviour
   change: stop and block.
4. **Run it.** Full `npm run e2e` against the redeployed dev deployment.
   Record the `npx convex dev --once` output (minus URLs) in the handoff.

## Done when
1. A player submits through the captain's `/run` link and the captain sees the item on the order page (already covered: `e2e/order-form-player.spec.ts`, no new spec).
2. A signed-in captain opens the portal and one of their orders (already covered: `e2e/portal.smoke.spec.ts`, no new spec).

## Logic
- none. No new or changed function. `npm run verify` (all `convex/*.test.ts` on convex-test 0.0.61) is the regression check.

## Dependencies
- Blocked by: U-01 (landed) and **R3-02 landing on main**. R3-02's branch
  has its own `convex/_e2e.ts` deployed to dev. A `convex dev --once` from a
  branch cut before R3-02 lands would remove `_e2e:uploadUrl` from dev and
  break R3-02's e2e. Run before U-02. Both touch `package.json` /
  `package-lock.json`.

## Notes
- Files likely touched: `package.json`, `package-lock.json`,
  `convex/_generated/*`, possibly `convex/_generated/ai/*`, `AGENTS.md` /
  `CLAUDE.md` (CLI-managed block only), and at most a few
  `convex/*.test.ts` setup lines (see step 3).
- The dev deployment is shared. While this branch's push is live on dev,
  don't run another branch's e2e that needs different Convex functions.
  `max_in_progress: 1` already gives us that.
- Earlier `convex dev --once` runs printed "Your projects are above the
  Free plan limits." That predates this issue and a redeploy doesn't
  change usage. Mention it in the handoff if it shows up again.
- Review checks:
  - `convex` and `convex-test` both moved, nothing else in `package.json`
    (`@clerk/*`, `next`, `react` unchanged).
  - `npm ls ws` ≥ 8.21.0. `npm audit --omit=dev` output in the handoff
    shows no `ws` / `convex` entry.
  - No change to `convex/schema.ts` or to any non-test, non-generated file
    under `convex/`.
  - `convex/_generated/` diff is codegen output only (it carries the
    "THIS CODE IS AUTOMATICALLY GENERATED" header and has no hand edits).
  - Any test change is setup only, each one listed in the handoff, with no
    assertion changed or removed.
  - The handoff shows `CONVEX_DEPLOYMENT` was a `dev:` deployment (prefix
    only).
