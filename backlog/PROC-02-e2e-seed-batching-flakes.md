# Issue: E2E flake fixes (P5) + cheap seeding cuts (P4a/P4b)

## Phase: 3

## Type: infrastructure

## Size: S (~7 files; Claude ~$2; SDET ~$2–3)

## Description

JCC approved P4 (seed batching) and P5 (flake fixes) at the E2E audit gate
(t_75e92ddc, "Q3. A", ~$6 of Claude), **on condition that one timed run
proves the estimate**. The timed run is
`docs/architecture/process-e2e-timed-run.md`. Short version:

- **P4 as the audit wrote it (composite `_e2e:seedScenario`) is dropped.**
  Spawns cost 5.1 min/run, not 9, and a composite seed removes only about one
  call per test (≈ 1.1 min) for an M-sized rewrite of ~20 specs.
- **Two cheaper cuts are kept: P4a and P4b, ≈ 2.4 min/run together.** That is
  below JCC's 5 min/run bar, so the handoff asks whether to keep them
  (`needs_decision`). If JCC says P5 only, drop §1 and §2 and the matching
  Done-when and Logic lines.
- **P5: the 3 known flakes plus the `usePickMode` race are traced to file:line.**
  Two are test waits, one is a test race, and one is an app bug: an
  unretried Clerk call 500s admin pages.
- **Scope after JCC's answer (#office-hours, 2026-10-25, "Q1. A / Q2. A"):**
  this issue is **P4a, P4b and P5 b–d**, held until after the speed check
  (t_d81a8104). The app bug (P5 a) moved to
  `backlog/B-10-admin-currentuser-retry.md` and ships now on its own.

JCC's goal for E2E, which every change here is checked against: *"catch error
messages from next JS that show up while browsing each page, as well as the
functionality of KEY operations"*. Nothing here deletes a test, loosens an
assertion, raises a global timeout or adds retries to the config.

```
per test today      seed ─ seed ─ [browser steps] ─ cleanup          (each = new `npx convex run`, ~1.2 s)
after P4a           seed ─ seed ─ [browser steps] ─ cleanup          (each spawn ~0.33 s cheaper: no npx)
after P4a+P4b       seed ─ seed ─ [browser steps] ┐
                                                  └ cleanup runs in the background while the next test starts;
                                                    the run fails at the end if any cleanup failed
```

### Options considered

| Option | Saving/run | Verdict |
|---|---|---|
| **P4a. Spawn `node_modules/.bin/convex`, not `npx convex`** | ≈ 1.3 min | **Picked.** One line. The npx wrapper alone costs 0.33 s a call (measured) |
| **P4b. Run the teardown cleanup in the background, drain at the end of the worker** | ≈ 1.1 min | **Picked.** Test-side only, no Convex change. Rows outlive their test by ~1 s, the same exposure `workers: 2` will bring anyway |
| P4b′. One batched cleanup at the end of the run (`tags[]`) | ≈ 1.1 min | Rejected. ~76 orders pile up on the admin account during the run, so the portal lists every later test opens get bigger and slower. It also needs a Convex arg change |
| P4c. Composite `_e2e:seedScenario` (the audit's P4) | ≈ 1.1 min | Rejected. New internal mutation plus seed rewrites across ~20 SDET-owned specs, for the same saving as P4b |
| P4d. In-process `ConvexHttpClient` with a deploy key | ≈ 3 min | Rejected. It needs a new secret in `.env.local` and `setAdminAuth`, which isn't public API |
| P5 alt. Raise `expect.timeout` to 20 s for everything | — | Rejected. Clerk median is 138 ms today, and 0 of 1,051 expects took 4 s or more. The flakes are single failed or stalled calls. A blanket timeout hides real slowness everywhere |

### 1. P4a: no npx

`e2e/support/convex.ts:18`: `execFileSync("npx", ["convex", "run", …])` →
`execFileSync(CONVEX_BIN, ["run", …])`, with
`CONVEX_BIN = path.resolve("node_modules/.bin/convex")`. Playwright's cwd is the
repo root. Keep the transport retry (`TRANSIENT`, :13) exactly as it is.

### 2. P4b: cleanup off the critical path

Today `fixtures.ts:53-57` calls `cleanup(tag)` synchronously after every test
(78 calls, 99 s in the timed run).

- New `lib/e2eCleanupQueue.ts`: a tiny queue with `enqueue(label, job: () => Promise<void>)`
  and `drain(): Promise<void>`. `drain` waits for every job and then rejects
  with every failed label if any job failed. It is plain logic, so it gets a
  `.ts` test.
- `e2e/support/convex.ts`: an async `cleanupAsync(tag)` that spawns the same
  `_e2e:cleanup` call(s) with `execFile` (promisified, same `TRANSIENT` retry)
  instead of `execFileSync`. The sync `cleanup` stays for `sweepStale`.
- `e2e/support/fixtures.ts`: the `tag` fixture enqueues `cleanupAsync(tag)`
  instead of blocking. A new **worker-scoped auto fixture** owns the queue and
  `await queue.drain()` in its teardown. A failed cleanup fails the run, so
  leftovers are never silent. `sweepStale()` in global setup is still the
  safety net.
- Overlap check (SDET, from reading specs): no test may count *all* of the
  admin's orders or designs. Audit §6 already flagged this for P6, and I have
  not checked every spec for it. If one does, fix that spec here rather than
  dropping P4b.

### 3. P5: flake fixes (root causes from the timed-run doc §3)

| # | Where | Root cause | Fix |
|---|---|---|---|
| a | `app/admin/layout.tsx:15` (**app**) | `currentUser()` has no retry; one dropped Clerk call 500s admin pages (`order-lock.spec.ts:110` flake) | **Moved to `backlog/B-10-admin-currentuser-retry.md`** (JCC, 2026-10-25: fix the admin 500 now as a bug). Not in this issue |
| b | `e2e/proxy-gate.u02.spec.ts:57` | `visitor.goto("/portal")` waits for `load` across Clerk's dev handshake redirects to sign-in. One slow Clerk hop used up the 20 s navigation timeout, while our server answered `/portal` in 45–107 ms | `goto("/portal", { waitUntil: "commit" })`, then the existing `toHaveURL(/\/sign-in/)` (:58) and sign-in text (:59) with `{ timeout: 20_000 }` |
| c | `e2e/stored-preview.img03.spec.ts:59-61` | In `waitForPreview`, the `naturalWidth > 0` poll uses the default 10 s, while the step before it on the same pipeline gets `PREVIEW_WAIT_MS` (30 s, :23). It failed at 10 s on 10-21 with no optimizer error logged | Give that poll `{ timeout: PREVIEW_WAIT_MS }` too. Image specs block lands when they fail, so this one matters |
| d | `e2e/public-form.0004.spec.ts:46-57` (`usePickMode`) | `toBeChecked()` (:52) passes on the optimistic UI (`components/portal/OrderFormSettings.tsx:190-205`, `pending ?? run.namesMode`) before `setNamesMode` commits, so `reload()` (:53) can read the old mode. Seen in U-01 land run 191 | Replace :53–56 with `await expect(async () => { await page.reload(); await expect(radio).toBeChecked({ timeout: 2_000 }); }).toPass({ timeout: 20_000 })` |

Out of scope: the UserButton hydration mismatch (only with `--workers=4`).
It goes with P6, which stays deferred.

## Done when
1. A full `npm run e2e:full` on the branch passes with **0 flaky**, and the timed-run step reporter (`docs/architecture/process-e2e-timed-run/tools/step-reporter.mjs`, run once with `--reporter=list,json,<that file>`) shows the `tag` fixture's total under 10 s (baseline 99 s) and summed test time at least 2 min under the 12.8 min baseline. (Evidence: both numbers and the receipt line in the handoff. Skip the timing part if JCC drops P4a/P4b.)
2. `proxy-gate.u02.spec.ts:24`, `stored-preview.img03.spec.ts:110` and the two `usePickMode` tests in `public-form.0004.spec.ts` pass 10/10 with `--repeat-each=10` in both projects where they run. (The real proof is the flake log card t_678ad8f6 staying empty for these over the next features. Say so in the handoff. `order-lock.spec.ts:110` is B-10's.)

(The old Done-when 3, admin still sees the order when one Clerk call fails, is B-10's Done-when 3.)

## Logic
- `e2eCleanupQueue` (`lib/e2eCleanupQueue.ts`): `drain()` resolves after every enqueued job has settled; one failing job → `drain()` rejects naming that job's label, and the other jobs still ran; `drain()` on an empty queue resolves.

## Dependencies
- Blocked by: PROC-01 landed on `main` (t_26065634). This touches
  `e2e/support/` and three specs PROC-01 tagged.
- Not blocked by B-10: they share no file. B-10 will usually have landed
  first; if so, `order-lock.spec.ts:110` should already be quiet.
- Sequencing (PM, not technical): JCC decided on 2026-10-25 to hold this
  build until the speed check after 3 features (t_d81a8104), so that check
  measures PROC-01 alone. P4a/P4b change the e2e minutes it measures. P5 alone
  barely does.

## Notes

**Review checks (read the diff, not tests)**
- No app code changes: `app/admin/layout.tsx` and `lib/transientRetry.ts`
  belong to B-10 and must not appear in this diff.
- `playwright.config.ts` is unchanged: `retries: 0`, `expect.timeout` 10 s,
  `workers: 1`.
- No test removed, no assertion loosened. Only the three waits in §3 b–d change.
- `e2e/support/convex.ts` still refuses a non-`dev:` deployment before it
  spawns anything (sync and async paths both).
- No new dependency in `package.json`.

**Who does what**
- SDET (tests card): `lib/e2eCleanupQueue.test.ts`, the three spec edits
  (§3 b–d), and the overlap check in §2.
- Dev (build card): `lib/e2eCleanupQueue.ts`, `e2e/support/convex.ts`,
  `e2e/support/fixtures.ts`. Runs Done-when 1–2.

**Files likely touched (7)**
- new: `lib/e2eCleanupQueue.ts` (+ its `.test.ts`)
- changed: `e2e/support/convex.ts`, `e2e/support/fixtures.ts`,
  `e2e/proxy-gate.u02.spec.ts`, `e2e/stored-preview.img03.spec.ts`,
  `e2e/public-form.0004.spec.ts`

**Specs this changes on purpose (P8)**: the three in §3 b–d only. No shared
rule changes, so no other spec should need an update. `grep -rn "cleanup(" e2e/`
should still show only the fixture and `sweepStale`.

**Branch:** `chore/PROC-02-e2e-flakes`, cut from `main` after PROC-01 lands.
