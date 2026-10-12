# Next.js upgrade: 16.2.6 → 16.4

Plan only (card t_d176713e, 2026-10-10). Nothing is installed yet.

## Verdict

**Go to Next 16.4.x and React 19.3 in one slice (U-01), before R3-02.**
Clerk and Convex move later, each in its own slice. If 16.4 fails the
suite in a way U-01 can't fix, fall back to 16.3.8. That still clears every
advisory listed below.

Why not just pin sharp (option A): 16.2 no longer gets security fixes, and
one unfixed 16.2 advisory sits in the image optimizer that R3-02 switches on.
So pinning sharp alone leaves R3-02 exposed.

```
main ──► U-01 next 16.4 + react 19.3 ──► R3-02 rebase (sharp ^0.35.5) ──► Gate 2
                                     └─► U-02 Clerk (later)   U-03 Convex (later)
```

## What we run today (evidence)

`npm ls sharp` → `next@16.2.6 └── sharp@0.34.5`. `npm audit --omit=dev`
reports 2 critical / 18 high / 5 moderate / 2 low in total. For `next` it
lists 16 advisories, all fixed by 16.3.8 or later
(`fixAvailable: next@16.4.0`, range `≤ 16.3.7`).

The advisories that apply to us (Linux, self-hosted `next start`, behind
Tailscale Funnel):

| Advisory | Severity | Affects | First fix | Why it matters here |
|---|---|---|---|---|
| sharp GHSA-f88m / GHSA-rgj7 / GHSA-wq5f | High | sharp < 0.35.0 / 0.35.4 / 0.35.5 | sharp 0.35.5 | R3-02 lets a captain's upload reach sharp (see t_d53f1729) |
| next GHSA-2xp9-vwfh-vxw4: RCE in the Image Optimization API via AVIF | **Critical** | 16.0 – 16.3.2 | **16.3.3** | Same path as R3-02. Next's fix also changed how AVIF is handled, so it is more than just bumping sharp |
| next GHSA-cjq9-62q9-8jv4: SSRF in Image Optimization | High | 16.0 – 16.3.7 | **16.3.8** | Only applies when `images.remotePatterns` is set. R3-02 is what sets it |
| next GHSA-6gpp, m99w, p9j2 … (middleware bypass, Server Action DoS, SSRF in rewrites) | High | < 16.2.11 | 16.2.11 | We run `middleware.ts` and Server Actions |
| next GHSA-4jqv, mcj8 (SSG/ISR cache poisoning, self-hosted) | Moderate | < 16.3.8 | 16.3.8 | We self-host |
| next GHSA-39w2 (dev server MCP endpoint info leak) | Low | < 16.3.8 | 16.3.8 | The dev server is reachable on the LAN (`allowedDevOrigins`) |

Two criticals don't apply to us. GHSA-p293 only affects Windows hosts, and
GHSA-vcvr is in `next/og`, which we don't use.

**16.2 is out of security support.** 16.2.12 (2026-07-25) was its last
release. Every advisory published since 16.3.0 shipped (GHSA-2xp9,
GHSA-vcvr, GHSA-cjq9 and the rest of the 16.3.8 batch) has a patched
version on 16.3.x, and some also on 15.5.x, but none on 16.2. This follows Next's
pattern: once a new minor ships, the old one stops getting security fixes,
and 16.4.0 shipped on 2026-10-06. So expect 16.3 to stop getting them too.

## Options

| | A: 16.2.12 + sharp override | B: 16.3.8 | C: 16.4.x (recommended) |
|---|---|---|---|
| sharp | `^0.35.5`, set by direct dependency + `overrides` | `^0.35.4` from Next itself → 0.35.5 | same as B |
| Clears the sharp advisories | Yes | Yes | Yes |
| Clears the next advisories | 16.2.11 ones only. **GHSA-2xp9 and GHSA-cjq9 stay open, and 16.2 will never get a fix** | All of them | All of them |
| Runs a sharp version Next has tested | No. 0.35 is a breaking release (it removes `failOnError`, renames `format.jp2k` → `jp2`, adds `limitInputChannels`), and Next 16.2 was never tested against it. Next 16.3 even had to fix how Turbopack bundles sharp 0.35 (#94845) | Yes | Yes |
| Security fixes from here on | None | Probably over now that 16.4 is out | Yes (current minor) |
| React | 19.2.x | 19.2.x (Next bundles a 19.2 canary) | **19.3** (Next 16.4 ships with it) |
| Age / patches | 16.2.12 is the final 16.2 release | 16.3.8 is 70 days into the line, 8 patch releases | 16.4.0 is 4 days old, no patches yet |
| Work | package.json + an override we have to keep in sync forever | version bump | version bump + React 19.3 |

**Why C:** it is the only option that stays inside security support. Its
cost is the same small diff as B's. 16.3 and 16.4 add no breaking changes
that touch our code (list below). What 16.4 adds is mostly opt-in (Cache
Components, `ensureStatic`, `navigation()`) or a build-internal change
(export mangling, a shared Turbopack runtime, shorter CSS Module class
names, and we have no CSS Modules).

**Why not B:** it is safer today, since 16.4.0 is a .0 release, but it
puts us on a line that has just stopped getting fixes, so we'd repeat this
work at the next advisory. B stays as the fallback if U-01 hits a 16.4.0
regression we can't fix in the slice.

**Why not A:** it leaves a High SSRF and a Critical AVIF RCE open on the
exact code path R3-02 turns on. It runs sharp on a major version Next 16.2
never tested. And it adds an `overrides` entry that has to be maintained.
It is cheaper by about one e2e run and nothing else.

### Should React, Clerk and Convex move with it?

| Package | Now → latest | Move with Next? | Why |
|---|---|---|---|
| `react`, `react-dom`, `@types/react(-dom)` | 19.2.4 → 19.3.0 | **Yes**, in U-01 | App Router renders with the React that Next bundles (19.3 in Next 16.4). Our `react` package is what Vitest and Testing Library run. If we leave it on 19.2, the unit tests run a different React than production does. |
| `eslint-config-next` | 16.2.6 → same as `next` | **Yes**, in U-01 | Pinned in lock-step with `next` |
| `@clerk/nextjs` | 7.3.5 → 7.9.14 | No, later (U-02) | Its peer range `next ^16.0.10` already allows 16.4 and `react ~19.3.0-0` allows 19.3, so it is not blocking. It is the auth and admin path, so it gets its own slice and its own e2e. It also needs to drop the stale `overrides` (`@clerk/react 6.6.4`, `@clerk/backend 3.4.9`, added in `da30d50` "until @clerk/shared 4.12.1 ships", and shared is at 4.25.5 now). `@clerk/testing` already asks for `@clerk/backend ^3.11.7`. |
| `convex` | 1.39.1 → 1.46.0 | No, later (U-03) | Not coupled to Next. The audit has 1 moderate on it (through `ws` < 8.20.1). It needs `convex-test` compatibility, regenerated `_generated/`, and a dev deploy. One variable per slice, so a regression points at one bump. |

## Breaking changes 16.2.6 → 16.4.0 that touch our code

Checked against the 16.3.0 and 16.4.0 release notes and blog posts, the
16.2.7–16.3.8 notes, and a grep of the repo.

| Change | Our file | Impact |
|---|---|---|
| `images.maximumResponseBody` now applies to local images too (16.3, #92920) | `public/images/carousel/*.png` (largest 3.6 MB), `components/marketing/JerseyCarousel.tsx` | None. The default cap is 50 MB. The U-01 e2e covers it |
| sharp 0.34 → 0.35 (Next's dependency) | the optimizer: landing carousel; public form after R3-02 | Next uses only `resize/rotate/webp/metadata`, so no API we touch. The new `limitInputChannels` default of 5 could reject an exotic CMYK+alpha TIFF. That is acceptable |
| `next dev` writes a managed `<!-- BEGIN:nextjs-agent-rules -->` block into `AGENTS.md` when it detects a coding agent (16.3) | `AGENTS.md` | It points agents at `node_modules/next/dist/docs/`. **Decision: commit it in U-01** so the tree stays clean |
| Edge runtime deprecated (16.3, #93369). `middleware` → `proxy` rename (deprecated since 16.0, still works) | `middleware.ts` (no `runtime` export, so it runs on Edge by default) | Deprecation warnings only, nothing breaks. **Not in U-01:** renaming to `proxy.ts` moves auth onto the Node runtime, and that belongs with Clerk in U-02 |
| TS: Next stops using deprecated `baseUrl`/`node10` defaults (16.3) | `tsconfig.json` (`moduleResolution: bundler`, no `baseUrl`) | None expected. `next build` may still rewrite `tsconfig.json` / `next-env.d.ts`; commit whatever it writes |
| `eslint-config-next` 16.4 brings `typescript-eslint ^8.56`, `react-hooks ^7.1` | whole repo | Possible new lint findings. Fix them in U-01, no rule disables |
| Turbopack build disk cache on by default; export mangling in production (16.4) | `.next/` (gitignored) | None expected. Anything that relies on runtime export names would show up in e2e |
| New opt-ins: `cacheComponents`, `partialPrefetching`, `ensureStatic`, `navigation()`, `catchError`, `useOffline`, `agentUpgrade` | `next.config.ts` | **Not adopted.** U-01 changes nothing in `next.config.ts`, because R3-02 owns that file |

## Issue slices

| Id | Title | Blocked by | Size |
|---|---|---|---|
| U-01 | Next 16.4 + React 19.3 (`backlog/U-01-next-16-4-react-19-3.md`) | none | S: ~5 files, Claude ≤ $2 (only for lint/type fixes), SDET ~$1 |
| R3-02 | rebase on U-01; direct dependency becomes `sharp ^0.35.5` | U-01 | already built: rebase, re-run step-1 optimizer check + e2e, ≤ $1 |
| U-02 | Clerk 7.9.x, drop the stale overrides, `middleware.ts` → `proxy.ts` (`backlog/U-02-clerk-7-9-proxy.md`) | U-01, after U-03 | S, ~$2–3 |
| U-03 | Convex 1.46 + `convex-test`, redeploy dev (`backlog/U-03-convex-1-46.md`) | U-01, R3-02 landed | S, ~$2 |

U-01 has 3 build steps: (1) bump + install, (2) verify + fix lint/type
fallout, (3) optimizer check + full e2e. I'll file U-02 and U-03 if JCC
wants Clerk and Convex moved at all.

## U-02 and U-03, as filed (2026-10-12)

Filed after U-01 landed (636dad6), as JCC approved (Q3 "yes"). Versions
re-checked with `npm view` on 2026-10-12: `@clerk/nextjs` 7.9.14,
`@clerk/testing` 2.2.45, `@clerk/shared` 4.40.0, `convex` 1.46.0,
`convex-test` 0.0.61 (peer `convex ^1.43.0`).

**Correction to the table above:** `npm audit --omit=dev` now rates `ws`
8.0.0–8.20.1 **High** (GHSA-58qx, GHSA-96hv), not moderate. We have
`ws@8.18.0` through `convex@1.39.1`. `convex@1.46.0` pins `ws 8.21.0`.
Exposure is low (Node-side Convex clients only: CLI, `npx convex run`),
but it makes U-03 the one of the two that clears a live finding. No
`@clerk/*` package shows up in the audit.

**Order: sequential, R3-02 → U-03 → U-02.**

```
main (U-01) ─► R3-02 lands ─► U-03 Convex ─► U-02 Clerk + proxy.ts
```

| Option | For | Against |
|---|---|---|
| **Sequential, U-03 first (picked)** | One variable per e2e run. A regression points at one bump. U-03 clears the High `ws` finding, and it is the smaller blast radius (no auth path) | ~1 day longer wall-clock |
| Parallel | Shorter wall-clock | Both rewrite `package.json` + `package-lock.json`, so the second one rebases and re-locks. Both need the one shared **dev** Convex deployment for e2e, and U-03 redeploys it. `max_in_progress: 1` serialises the build cards anyway, so parallel only overlaps SDET and gate time |
| Sequential, U-02 first | Clears the `middleware` deprecation warnings sooner | Leaves the only live audit finding open longer, and puts the riskier (auth) slice first |

U-03 must wait for **R3-02 to land**, not just for U-01. R3-02's branch
deployed its own `convex/_e2e.ts` (`_e2e:uploadUrl`) to dev. A `convex dev
--once` from a branch without it would remove that function from dev and
break R3-02's e2e until someone redeploys.

What U-02 deliberately does not do: replace `createRouteMatcher()` with
per-resource auth checks (Clerk 7.6 deprecated the matcher in favour of
that). Our data is already guarded per function in Convex
(`convex/_auth.ts`), and `app/admin/layout.tsx` re-reads private metadata
server-side. The proxy only decides redirects. Moving those redirects is a
behaviour change with its own e2e cost, so U-02 keeps the matcher as it is
and only renames the file.

## Order relative to R3-02

**U-01 first, then rebase R3-02.** R3-02 is what switches on
`images.remotePatterns`, and GHSA-cjq9 (SSRF) and GHSA-2xp9 (AVIF RCE) are
only fixed on 16.3.3 or later. Landing R3-02 first on 16.2 with option A
would ship that path with two known holes, then change it again a week
later.

The rebase is small. U-01 doesn't touch `next.config.ts` or any file in
R3-02's diff, so the only overlap is `package.json`/`package-lock.json`.
R3-02 changes its direct dependency line from `^0.34.5` to `^0.35.5` and
re-runs `npm install`. It must re-run its step-1 optimizer check and the
full e2e, because the optimizer it measured ran on sharp 0.34.5. The
`ImageLightbox.tsx` conflict from the 375px fix (bb43e44) is separate, and
that rebase is needed anyway.

## Risks and what we'd test

- **16.4.0 is a .0 release.** Covered by the full suite: verify (1205
  tests), all 72 e2e, and one new e2e on the optimizer. Fallback is 16.3.8,
  which needs no other change to the plan.
- **The headless install may be refused.** ss-dev's sharp install was
  blocked by the Hermes security scan (t_d53f1729). `next@16.4.0` and
  `sharp@0.35.5` have no open advisories, so the scan should pass. If it
  doesn't, JCC runs the one `npm install` line in U-01 himself.
- **The dev Convex deployment is unchanged** by U-01 (no Convex code), so
  e2e runs against it as it is.
