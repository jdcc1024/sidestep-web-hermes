# Issue: Upgrade Next.js to 16.4 and React to 19.3

## Phase: 3

## Type: infrastructure

## Size: S (~5 files, Claude ≤ $2 only if lint/type fixes are needed; SDET ~$1)

## Description

Design: `docs/architecture/next-upgrade.md`. We are on Next 16.2.6, a minor
line that no longer gets security fixes. `npm audit` lists 16 advisories
on `next` and 3 on its `sharp@0.34.5`. Two of them sit on the image
optimizer that R3-02 switches on: GHSA-2xp9 (Critical, AVIF RCE, fixed in
16.3.3) and GHSA-cjq9 (High, SSRF via `remotePatterns`, fixed in 16.3.8).
This issue moves us to the current minor so R3-02 can land on top of it.

Only the version bump and the fallout it causes. No new Next features, no
`next.config.ts` change (R3-02 owns that file), no Clerk or Convex bump.

### Build steps

1. **Bump.** Set `next` and `eslint-config-next` to the same exact `16.4.x`
   (latest 16.4 patch on the day; 16.4.0 as of 2026-10-10). Set `react` and
   `react-dom` exact to `19.3.0`. Set `@types/react` and `@types/react-dom`
   to `^19.3.0`. Run `npm install`. Check:
   - `npm ls sharp` shows `sharp@0.35.5` or later under `next`
   - `npm ls react` shows one 19.3.0
   - `npm audit --omit=dev` lists no advisory on `next` or `sharp`

   Leave `overrides` alone (that's U-02). If the Hermes scan blocks the
   install, stop and ask JCC to run the install line himself.
2. **Verify.** Run `npm run verify -- --build` and fix whatever breaks: new
   `typescript-eslint` / `react-hooks` lint findings, type changes from
   React 19.3. Fix the code; no new `eslint-disable`. If `next build` or
   `next dev` rewrites `tsconfig.json`, `next-env.d.ts` or adds the managed
   `<!-- BEGIN:nextjs-agent-rules -->` block to `AGENTS.md`, commit that as
   it is, in its own commit.
3. **Run it.** Run the full `npm run e2e`. Also run `npm run build && npx next start -p 3001`
   and request `/_next/image?url=%2Fimages%2Fcarousel%2F05-snoop-dodge.png&w=828&q=75`.
   It must return 200 `image/webp`. This is the 3.6 MB local PNG going
   through sharp 0.35. Record the output in the handoff.

If 16.4 has a regression you can't fix within the budget, switch to `next`
and `eslint-config-next` `16.3.8` and React `19.2.x` (leave the React lines
unchanged), re-run steps 1–3, and say so in the handoff.

## Done when
1. A visitor opens the home page on a phone and sees the first jersey in the carousel, served resized through `/_next/image` as WebP.

## Logic
- none. No new or changed function. The existing unit suite (`npm run verify`) is the regression check.

## Dependencies
- Blocked by: none. Land before R3-02 (`R3-02-design-picture-web-preview.md`), which then rebases and sets its direct dependency to `sharp ^0.35.5`.

## Notes
- Files likely touched: `package.json`, `package-lock.json`, possibly
  `AGENTS.md`, `tsconfig.json`, `next-env.d.ts`, plus any file a new lint
  rule flags.
- Expected warnings that are **not** in scope: Edge runtime deprecation and
  the `middleware` → `proxy` rename for `middleware.ts`. That change moves
  auth onto the Node runtime, so it ships with the Clerk bump (U-02).
- The E2E `webServer` is `npm run dev`. The carousel optimizer works in dev.
- Review checks:
  - `next.config.ts` unchanged. No `cacheComponents`, `partialPrefetching`,
    `experimental.*` or `images.*` added.
  - `next` and `eslint-config-next` are pinned exact, to the same version.
  - `overrides` unchanged. `@clerk/nextjs` and `convex` ranges unchanged.
  - No `eslint-disable` added.
  - `npm audit --omit=dev` output in the handoff shows no `next` / `sharp`
    entries.
