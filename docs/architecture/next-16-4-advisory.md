# Next.js 16.4.0 security advisory: triage

Card t_8461b46c, 2026-10-25. Investigation only, no dependency change.

## Verdict

**Already fixed on `main`. No U-05 needed.** `00e005c` (2026-10-25) moved
`next` 16.4.0 → 16.4.3 (patch, same minor). Next's own advisory check now
returns nothing for 16.4.3, and `npm audit` is clean. One of the three
advisories did reach us on 16.4.0 (Server Actions DoS, via Clerk), one was
already mitigated (SVG RCE, by our sharp pin) and one never applied (`use cache`).

The `SecurityFatalError` is not a flaky one-off. It is Next's **agent-only**
upgrade nudge, and on an affected version it fails **every other** agent
`next build` / `next dev`, not just the first one. On 16.4.3 it is silent.

```
node scratch/assess.cjs     (calls next/dist/lib/upgrade/nudge.js assessUpgrade)
detected agent: hermes-agent
16.4.0 -> {"kind":"security","installedVersion":"16.4.0","targetVersion":"16.4.3",...}
16.4.3 -> null
npm audit --omit=dev  -> found 0 vulnerabilities   (also 0 with dev deps)
```

## 1. The advisories (all published 2026-10-22, all `>=16.0.0 <=16.4.0`)

| Advisory | Sev | Surface | Do we use it? |
|---|---|---|---|
| GHSA-p3m5-59mp-jv5r (CVE-2026-94482): DoS in App Router via Server Actions | high | prod runtime: crafted request pins CPU, blocks the process | **Yes, before 00e005c.** We wrote no `"use server"`, but Clerk's `invalidateCacheAction` (`node_modules/@clerk/nextjs/dist/esm/app-router/server-actions.js:1`) is a Server Action imported by `ClerkProvider` (`app/providers.tsx:26`). The built `.next/server/server-reference-manifest.json` registers it on all 26 app pages. |
| GHSA-2464-fhr4-w9xw: RCE in Image Optimization API with SVG | critical | prod runtime, `/_next/image` on glibc Linux; the bug is in sharp/libvips | **Mitigated.** The advisory's workaround is sharp ≥ 0.35.5. We pin `sharp ^0.35.5` as a direct dependency (`package.json:38`, since 3f5a5d0, 2026-10-12), and the lockfile at 16.4.0 (86cb1b8) already resolved 0.35.5. Next has no nested sharp (`node_modules/next/node_modules` holds only postcss). We also never send SVG to the optimizer: `lib/images.ts:41` limits `canOptimize` to png/jpeg/webp, and `remotePatterns` is our Convex host only (`lib/images.ts:107-112`). |
| GHSA-673q-mjm6-r5xr: RCE in `use cache` functions returning typed arrays | critical | prod runtime, App Router with Cache Components | **No.** There is no `"use cache"` anywhere in the repo and no `cacheComponents` in `next.config.ts`. |

Exposure window: only if a deployment was built from 16.4.0 and served
Clerk pages. Any build from `main` at 00e005c or later is clean.

## 2. `SecurityFatalError`: what it is

Source: `node_modules/next/dist/lib/upgrade/nudge.js`. Docs:
`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/agentUpgrade.md`.

```
next build / next dev
  └─ experimental.agentUpgrade  (default 'security', config-shared.js:192)
       └─ assessUpgrade(): POST registry.npmjs.org/-/npm/v1/security/advisories/bulk
            (prepare-upgrade.js:108,230), the same data npm audit uses, 10s timeout
            network error → warn and continue (nudge.js:209-211), never fatal
       └─ affected?  ── no → silent
            └─ yes: who is running it? (@vercel/detect-agent: AI_AGENT, CLAUDECODE, …)
                 human + TTY → 10s skippable prompt, never fatal
                 agent       → allowNudgeRetry() (nudge.js:117)
                                 no receipt  → write receipt, throw SecurityFatalError (exit 1)
                                 receipt <5m → consume it, warn, continue
```

- **Who triggers it:** only a detected agent. This Hermes worker's env has
  `AI_AGENT=hermes-agent`, and Claude Code sets `CLAUDECODE`. JCC in his own
  terminal gets a skippable prompt.
- **Why it failed once and the retry passed:** the first run writes a receipt to
  `.next/cache/next-agentic-upgrade-retries/<sha256>.json` and exits 1. A retry
  within 5 minutes consumes that receipt and continues. The empty directory from
  ss-dev's run is still there (`2026-10-24T15:41`).
- **Why it would have come back:** the successful retry *deletes* the receipt, so
  the next agent run on the same version writes a new one and fails again. The
  pattern is fail, pass, fail, pass. In `next build` the check runs in the
  background but is awaited at the end (`build/index.js:2948`), so a full build
  is wasted. In `next dev` it calls `printAndExit` (`server/lib/router-server.js:206-208`),
  and that dev server is the one Playwright's `webServer` starts (`npm run dev`).
- **Can it be turned off?** Yes: `experimental: { agentUpgrade: false }` in
  `next.config.ts` turns off reminders in both dev and build. **Recommendation:
  keep the default.** It is our only advisory gate that runs on every build
  (`scripts/verify.mjs` doesn't run `npm audit`), and it only stops agents, and
  only while a fix is available. Turning it off would hide exactly what it found
  here. If it becomes a nuisance, set it to `false` and add
  `npm audit --omit=dev --audit-level=high` to `verify --build` in the same
  change. The data is the same, and audit fails every run instead of every other one.

## 3. Fixed version and size of the jump

- First patched: **16.4.1** (2026-10-14), for all three. npm `latest` is **16.4.3**
  (2026-10-23), which is what `main` has. It's a patch inside 16.4.x, plus
  react/react-dom 19.3.0 → 19.3.1 and `eslint-config-next` in lockstep.
- Release notes: 16.4.1 is security fixes only. 16.4.2 has Turbopack fixes and
  doc backports. 16.4.3 is backports: Google font URLs, `proxy.ts` no longer loads
  the app-page runtime, an OTel trace fix, and a revert of a Turbopack
  loader-invalidation change. **None are breaking.** The only gate evidence on
  16.4.3 is the t_390d2cd2 run on 490efe0: `verify --build` 1347/1347 and
  `e2e:full` 82 passed, 0 flaky.

## Follow-ups (not done here)

- Agent rule worth adding to `sidestep-dev` / `sidestep-sdet` (PM to route): *if
  `next dev`/`next build` stops with `SecurityFatalError`, retry once, and put the
  advisory and its target version in `needs_decision`. Never treat it as a flake.*
- If anything was ever deployed from 16.4.0, redeploy from `main`.
