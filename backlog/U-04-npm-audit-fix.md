# Issue: Clear the transitive npm audit findings (lockfile fix + shadcn to devDependencies)

## Phase: 3

## Type: infrastructure

## Size: S (2 files: `package.json`, `package-lock.json`; ss-dev by hand, no Claude run expected; SDET ~$0.5)

## Description

Follows U-02 (on origin/main at 8050c38). Approved at Gate 2 U-02
(`~/sidestep/docs/gates/process-next-upgrade.md`, JCC Q2 = A, 2026-10-18).

Decision: **`npm audit fix` (lockfile only), then move `shadcn` from
`dependencies` to `devDependencies`.** With both, `npm audit --omit=dev` goes
from 21 findings to 0. No direct dependency takes a major bump, no `--force`,
and no `overrides`.

Two findings matter for the slice:

1. **None of the 21 findings is in the runtime bundle.** 20 of them reach
   us only through `shadcn@4.8.0`: its CLI, its MCP server
   (`@modelcontextprotocol/sdk` → express / hono) and its codemods (ts-morph,
   babel). The app never imports `shadcn` JS. The only import is
   `@import "shadcn/tailwind.css"` in `app/globals.css`, and that is read at
   build time. The other one (`baseline-browser-mapping`, through `next`) and
   `source-map-js` (through `@tailwindcss/postcss`) are also build-time only.
   Evidence: a search of the current `.next/server` and `.next/static` output
   finds no `node_modules/{shadcn,express,proxy-addr,hono,browserslist,js-yaml,@babel/core}/`
   module. `source-map-js` appears only in `.next/build/` (the PostCSS
   build worker). So the critical `proxy-addr` (IP spoofing in express
   `trust proxy`) applies only when someone runs `shadcn mcp` locally.
   Risk is low, the fix is cheap, and the noise hides real findings.
2. **`npm audit fix` alone leaves 7 high findings, and no upstream fix exists for them.** All 7 share one
   root: `braces` GHSA-vfj7-8cjw-p6xm (stack exhaustion on deeply nested
   glob patterns), range `<=3.0.3`, and 3.0.3 is the latest `braces` on
   npm. The chain is `shadcn` → `fast-glob` / `ts-morph` / `@shadcn/registry` →
   `micromatch` → `braces`. npm's suggested "fix" is `shadcn@1.0.0`, a
   downgrade across 3 majors. An `overrides` entry can't help, because
   there is no patched version to pin. `shadcn` belongs in `devDependencies` anyway:
   it is a scaffolding CLI, and the build already needs devDependencies
   (`tailwindcss` and `@tailwindcss/postcss` live there). After the move,
   `npm audit --omit=dev` is clean. The `braces` chain still shows in
   the full `npm audit` as dev-tool-only (see Deferred).

### Audit table (origin/main 8050c38, npm 12.1.0, 2026-10-18)

`npm audit --omit=dev`: 21 findings (1 critical, 14 high, 4 moderate,
2 low). "Fix" = cleared by `npm audit fix` with no `--force`, measured by
running it with `--package-lock-only` in a scratch copy. "Where" = does it
ship? All 21 are **build/dev-tool only**. None is in the browser bundle or
the Next server bundle.

| Package | Sev | Pulled in by (direct dep) | Fix | Lock version before → after | Where |
|---|---|---|---|---|---|
| proxy-addr | critical | shadcn → @modelcontextprotocol/sdk → express | yes | 2.0.7 → 2.0.8 | shadcn MCP server (CLI) |
| @modelcontextprotocol/sdk | high | shadcn | yes | 1.29.0 → 1.32.1 | shadcn CLI |
| hono | high | shadcn → MCP sdk | yes | 4.12.22 → 4.13.13 | shadcn CLI |
| fast-uri | high | shadcn → MCP sdk → ajv | yes | 3.1.2 → 3.1.8 | shadcn CLI |
| ip-address | high | shadcn → MCP sdk → express-rate-limit | yes | 10.2.0 → 10.7.4 | shadcn CLI |
| js-yaml | high | shadcn → cosmiconfig; eslint → @eslint/eslintrc | yes | 4.1.1 → 4.3.2 | CLI / lint |
| browserslist | high | shadcn (direct + via @babel/core) | yes | 4.28.2 → 4.29.3 | shadcn CLI |
| source-map-js | high | @tailwindcss/postcss, postcss, jsdom | yes | 1.2.1 → 1.2.2 | build (PostCSS) / test |
| brace-expansion | high | shadcn → ts-morph; eslint-config-next → typescript-eslint | yes | 5.0.6 → 5.0.12 (and 1.1.14 → 1.1.21 under eslint) | CLI / lint |
| shadcn | high | **direct** | no (only `shadcn@1.0.0`, a downgrade) | 4.8.0 → 4.22.1 | CLI + build-time CSS |
| ts-morph | high | shadcn | no | 26.0.0 (same) | shadcn CLI |
| @ts-morph/common | high | shadcn → ts-morph | no | 0.27.0 (same) | shadcn CLI |
| fast-glob | high | shadcn, shadcn → ts-morph | no | 3.3.3 (same) | shadcn CLI |
| micromatch | high | shadcn → fast-glob | no | 4.0.8 (same) | shadcn CLI |
| braces | high | shadcn → fast-glob → micromatch | **no patched version** | 3.0.3 (latest on npm) | shadcn CLI |
| @hono/node-server | moderate | shadcn → MCP sdk | yes | 1.19.14 → 2.1.5 (transitive major, allowed by MCP sdk's range) | shadcn CLI |
| baseline-browser-mapping | moderate | next; shadcn → browserslist | yes | 2.10.30 → 2.11.29 | build (Next targets) |
| postcss-selector-parser | moderate | shadcn | yes | 7.1.1 → 7.1.6 | shadcn CLI |
| qs | moderate | shadcn → MCP sdk → express | yes | 6.15.2 → 6.16.1 | shadcn CLI |
| @babel/core | low | shadcn; eslint-config-next → react-hooks plugin | yes | 7.29.0 → 7.29.7 | CLI / lint |
| body-parser | low | shadcn → MCP sdk → express | yes | 2.2.2 → 2.3.0 | shadcn CLI |

The full `npm audit` (dev included) has 6 more findings:

| Package | Sev | Pulled in by | Fix | Where |
|---|---|---|---|---|
| vite | high | vitest | yes (8.0.13 → 8.3.4) | test |
| undici | high | jsdom | yes (7.25.0 → 7.30.1) | test |
| vitest, @vitest/mocker | moderate | **direct** devDep | yes (4.1.6 → 4.1.12, inside `^4.1.6`) | test |
| eslint-config-next, @next/eslint-plugin-next | high | **direct** devDep → fast-glob 3.3.1 → braces | no (only `eslint-config-next@14.2.35`, a downgrade) | lint |

Measured results (scratch copy, `--package-lock-only --ignore-scripts`):

| State | `--omit=dev` | full `npm audit` |
|---|---|---|
| origin/main | 21 (1 crit, 14 high, 4 mod, 2 low) | 27 |
| after step 1 (`npm audit fix`) | 7 high (all shadcn → braces) | 9 high |
| after step 2 (shadcn → devDependencies) | **0** | 9 high (deferred) |

Step 1 changes 85 lock entries, adds 24 and removes 61 (shadcn 4.22 drops
`msw` and its tree). `package.json` does not change. `@clerk/*`, `convex`,
`ws`, `next`, `react` and `sharp` keep their versions.

### Options considered

| Option | Result | Verdict |
|---|---|---|
| A. `npm audit fix` only | 21 → 7 high, all from `braces`, which has no patched version | Not enough on its own: the gate would still show 7 high "findings" with no action we can take |
| **B. A + move `shadcn` to `devDependencies`** | **21 → 0** for `--omit=dev`. No major bump, no overrides | **Picked.** It is also the right classification: shadcn is a dev CLI |
| C. A + `overrides: { braces: … }` | Nothing to override to (3.0.3 is the latest and is in range) | Rejected: it can't work, and U-02 just removed overrides |
| D. `npm audit fix --force` | `shadcn@1.0.0` and `eslint-config-next@14.2.35` | Rejected: downgrades across majors would break `components.json` (base-nova) and Next 16 lint |
| E. Remove `shadcn` entirely and vendor `tailwind.css` | Clears the full audit too | Rejected: we'd lose `npx shadcn add`, and a vendored stylesheet goes stale. Not worth it for a dev-only DoS |

### Build steps

1. **Branch + baseline.** `git switch -c chore/u-04-npm-audit-fix` from
   up-to-date `main`. Run `npm audit --omit=dev` and save its summary line
   for the handoff (expect 21: 1 critical, 14 high, 4 moderate, 2 low).
2. **Lockfile fix.** `npm audit fix` (no `--force`). Check:
   - `git diff --stat` shows only `package-lock.json`, and `git diff package.json` is empty
   - `npm audit --omit=dev` shows only the shadcn → braces chain (expect 7 high)
   - `npm ls next react convex @clerk/nextjs @clerk/testing convex-test sharp`
     shows the same versions as `main` (16.4.0, 19.3.0, 1.46.0, 7.9.17, 2.2.47, 0.0.61, 0.35.x)

   Commit: `chore(deps): npm audit fix, lockfile only (U-04)`.
3. **Move shadcn.** `npm install --save-dev shadcn@^4.22.1`. That removes
   it from `dependencies` and adds it under `devDependencies`. Check:
   - `npm audit --omit=dev` → `found 0 vulnerabilities`
   - `git diff package.json` shows only the `shadcn` line moving (with its
     range now `^4.22.1`)

   Commit: `chore(deps): shadcn is a dev CLI, move to devDependencies (U-04)`.

   If the Hermes scan blocks an `npm` line in steps 2–3, stop and ask JCC to
   run it himself (same as U-01).
4. **Verify.** `npm run verify -- --build`. vitest moves 4.1.6 → 4.1.12
   and vite moves 8.0 → 8.3, so a test-harness fallout would show here. Fix
   test setup only. Don't change assertions and don't add `eslint-disable`.
5. **Run it.** Full `npm run e2e`. For the handoff, record the before and after
   `npm audit --omit=dev` summaries, the full `npm audit` residual (expect
   9 high, all `braces`), and the e2e counts.

## Done when
1. `npm audit --omit=dev` on the branch reports `found 0 vulnerabilities` (it was 21, including 1 critical), and `package.json` changes only by moving `shadcn` to `devDependencies`.
2. A signed-out visitor who opens `/portal` still lands on sign-in, and a player can still open and submit the public `/run/<token>` roster form without signing in (covered by `e2e/proxy-gate.u02.spec.ts` and `e2e/public-form.0004.spec.ts`; no new spec).
3. `npm run verify -- --build` and the full `npm run e2e` pass on the branch.

## Logic
- none. No function changes. `npm run verify` is the regression check.

## Dependencies
- Blocked by: U-02 (landed, 8050c38). Nothing else in flight touches
  `package.json` / `package-lock.json`. If another card lands a lockfile
  change first, rebase and re-run step 2 instead of merging lockfiles by hand.

## Notes
- Files likely touched: `package.json`, `package-lock.json`. Nothing else.
- **Deferred (stays in the full `npm audit`, dev tools only):** `braces`
  GHSA-vfj7-8cjw-p6xm through `shadcn` (ts-morph, fast-glob,
  @shadcn/registry, micromatch) and through `eslint-config-next` →
  `@next/eslint-plugin-next` → fast-glob 3.3.1. That is 9 high, one root.
  Reasons: no patched `braces` exists, npm's only offer is a cross-major
  downgrade, and the trigger needs a hostile glob pattern passed to our own
  CLI or linter. Revisit when `braces` > 3.0.3 ships or
  `eslint-config-next` drops `fast-glob` (a later `npm audit fix` picks it up).
- shadcn 4.8 → 4.22 `dist/tailwind.css`: the first 95 lines are
  byte-identical to 4.8.0. It only appends `scroll-fade` / `shimmer`
  utilities plus their `@property` rules and a `.shimmer`
  reduced-motion rule. We use neither class (grep `app components lib`).
  Expect a slightly larger compiled CSS and no visible change.
- Review checks:
  - `git diff main -- package.json`: only `shadcn` moves from
    `dependencies` to `devDependencies`. No `overrides` block. No other
    range changes.
  - `npm ls next react react-dom convex @clerk/nextjs sharp` matches `main`.
  - No change outside `package.json` / `package-lock.json`. No
    `eslint-disable` added.
  - `grep -rnE "shimmer|scroll-fade" app components lib` is still empty.
  - The handoff includes both `npm audit --omit=dev` summaries and the
    full-audit residual.
