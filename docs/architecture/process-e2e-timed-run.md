# Timed E2E run: does P4 hold, what causes the P5 flakes

Card t_1ccf624f, 2026-10-24. Measurement only: no app, test or config files were changed.
This checks the estimates in `process-e2e-audit.md` §2 and §7 (P4, P5).

## Verdict

| | Audit estimate | Measured | Verdict |
|---|---|---|---|
| Time spent in `npx convex run` | ≈ 368 calls × 1.5 s ≈ **9 min/run** | **232 calls × 1.2 s median = 5.1 min/run** (39% of test time) | Estimate was ~1.8× too high |
| P4 saving (composite seed + batched cleanup) | 4–5 min/run | **at most about 2.5 min/run** from changes that are worth making (§2) | **Under JCC's 5 min/run bar** → `needs_decision` |
| Clerk-dependent waits (P5) | 10 s expects, Clerk at 3–5 s/call | **0 steps ≥ 4 s in 1,051 expects. Clerk FAPI median 138 ms** | Not slow today. The flakes are failed or stalled third-party calls, not a slow baseline |
| 10-18 → 10-20 slowdown (+61%) | cause unproven | **Gone.** The same 56 tests sum to 8.6 / 12.7–14.6 / 8.9 / 9.4 / **8.7** min (10-18 / 10-20 / 10-21 ×2 / today) | Transient and external (Clerk dev API latency on 10-20). No code cause |
| Flake causes found | — | 3 of the 3 known flakes traced to file:line (§3) | Fixable, ~6 files |

**Run:** `main`-to-be (`chore/PROC-01-e2e-dev-loop` @ `690019a`, tree `e8fb4219d96b`, the tree the land
card t_26065634 ff-merges). Plain `playwright test` with the config's two projects, 1 worker,
`retries: 0`. **76 passed, 6 skipped (captain account not configured), 0 failed, 0 flaky. Wall 13.1 min,
summed test time 12.8 min**, global setup 10 s. 2026-10-24 02:40–02:53 PDT, load1 median 2.7 on 4
cores.

I did not run `e2e:full`: that writes `.e2e-receipt.json`, and the land card owns the first receipt on
this tree. The flags were the same, plus three read-only instruments:

- a `PATH` shim around `npx` that times every `npx convex run` (`tools/npx-shim.sh`);
- a step reporter that logs every test, fixture, `expect` and `pw:api` step with start time and duration (`tools/step-reporter.mjs`);
- a side probe every 15 s that times Clerk FAPI `/v1/environment`, Convex `/version` and the dev server home page, plus load and swap (`tools/probe.py`).

Data (committed next to this file, in `process-e2e-timed-run/`): `report.json` (Playwright JSON
reporter), `convex-run.tsv` (every call: start s, duration s, function, exit), `probe.jsonl`. Tables
come from `tools/analyse.py` and `tools/compare.py`.

---

## 1. Seeding cost, measured

| Function | Calls | Total s | Median s | Max s |
|---|---|---|---|---|
| `_e2e:cleanup` (fixture teardown, `fixtures.ts:56`) | 78 | 99.0 | 1.20 | 3.68 |
| `_e2e:seedOrder` | 75 | 89.3 | 1.17 | 1.33 |
| `_e2e:makePreview` (action: runs the real preview generator) | 20 | 43.1 | 2.19 | 4.96 |
| `_e2e:seedItems` | 17 | 20.7 | 1.21 | 1.33 |
| `_e2e:insertAsset` | 14 | 16.9 | 1.17 | 1.44 |
| `_e2e:findFixture` | 14 | 16.5 | 1.15 | 1.31 |
| `_e2e:attachFile` | 10 | 14.6 | 1.45 | 1.61 |
| `_e2e:addDesign` | 4 | 4.6 | 1.15 | 1.18 |
| **Total** | **232** | **305 s = 5.1 min** | 1.20 | 4.96 |

- **Calls per test:** median 3 (one of them is cleanup), max 9 (`image-egress.img02:69`). Leaving cleanup
  out, a test makes about 2 seed calls. A composite "seed scenario" mutation can only remove the second one.
- **Why the count is lower than the audit's 368:** PROC-01 dropped 20 mobile duplicates and the lightbox
  cut removed 8 more tests. The static regex count also over-counted.
- **Where each call's 1.2 s goes** (5 runs of each command on the same machine, right after the suite):

  | Command | Seconds |
  |---|---|
  | `npx convex --version` (process start through npx) | 0.73–0.77 |
  | `node_modules/.bin/convex --version` (process start, no npx) | 0.42–0.48 |
  | `npx convex run _e2e:findFixture` | 1.13–1.28 |
  | `node_modules/.bin/convex run _e2e:findFixture` | 0.81–0.99 |

  So about **0.33 s of every call is the npx wrapper** (resolving the package and the npm notice), about
  0.4 s is Node and the CLI starting, and about 0.4 s is the function round trip. The round trip is the
  only part a spawn can't avoid.

### What each P4 option would actually save (from the numbers above)

| Option | Saving/run | Effort, risk | Verdict |
|---|---|---|---|
| **P4a. Call `node_modules/.bin/convex` instead of `npx`** (`e2e/support/convex.ts:18`) | 232 × 0.33 s ≈ **1.3 min** | 1 line. No risk | **Do** |
| **P4b. Cleanup off the critical path:** spawn the teardown cleanup asynchronously, await all of them in a worker-scoped fixture, and fail the run if any fails | 78 × ~0.87 s ≈ **1.1 min** (after P4a) | ~30 lines in `e2e/support/`. Small overlap risk: test N's rows live ~1 s into test N+1 (the same exposure `workers: 2` will have) | **Do**, guarded (see issue) |
| P4c. Composite `_e2e:seedScenario` per test (the audit's P4) | removes ~1 seed call per test: 76 × ~0.87 s ≈ **1.1 min** | New internal mutation + rewriting the seed calls in ~20 specs (SDET-owned). Effort M for P4b's saving | **Reject**: too much churn for 1 min |
| P4d. In-process `ConvexHttpClient` with an admin/deploy key, no spawns | ≈ 232 × 0.8 s ≈ **3 min** | Needs a deploy key in `.env.local` (a new secret JCC must create) and `setAdminAuth`, which is not public API | **Reject**: new secret plus undocumented API, for the one option that gets close to the old estimate |

**P4a + P4b ≈ 2.4 min/run (≈ 18% of today's 13.1 min), about 5 min per feature at 2 full runs.** That is
half of what the audit promised, and below the 5 min/run bar JCC set for the build. Decision in the
handoff.

---

## 2. Clerk-dependent waits and latency (P5)

- **No slow steps today.** Of 1,051 `expect` steps the slowest took 1.4 s. Only 2 `pw:api` steps took
  2 s or more (two navigations at 2.2 and 2.5 s). Navigations: 198, median 1.42 s, p90 1.64 s.
- **Probe, 51 samples over the run:**

  | Target | Median | p90 | Max | Errors |
  |---|---|---|---|---|
  | Clerk FAPI `/v1/environment` | 138 ms | 391 ms | 1,373 ms | 0 |
  | Convex HTTP `/version` | 112 ms | 175 ms | 835 ms | 0 |
  | dev server `/` | 115 ms | 202 ms | 424 ms | 0 |

- **Dev server request timings** (`next dev` logs `proxy.ts` and `application-code` per request) are
  50–640 ms for every portal/admin/run page over the last 3 days, apart from the one 10.8 s 500 in §3.
- Machine: load1 median 2.7, max 5.1 on 4 cores. MemAvailable ≥ 2.6 GB, **swap almost full (86 MB of 4 GB
  free)**. It did not slow this run, but it is the first thing to look at if runs slow down again.

So a blanket "give Clerk waits 20 s" is not justified by latency. The real flakes are single
third-party calls that **fail or stall**. Each one needs a targeted fix where it happens.

## 3. Flake causes, from the 10-21 receipts' JSON and the dev server log

The 3 known flakes (land card t_26065634) are the only failures in the two PROC-01 receipt runs
(`.e2e-logs/20261021T165946Z-*`, `.e2e-logs/20261021T172121Z-*`, excluding the deliberate throwaway spec).
None reproduced today.

| Flake | What happened (evidence) | Root cause | Fix |
|---|---|---|---|
| `order-lock.spec.ts:110` [mobile] | `getByText('Jordan Lee')` not found at :125 after `goto /admin/orders/<id>`, plus browser errors `500`, `ClerkAPIResponseError … Server Components render`. Dev log: `⨯ ClerkAPIResponseError … errors: [{ code: 'unexpected_error', message: 'fetch failed' }]` at `app/admin/layout.tsx:15`, `GET /admin/orders/… 500 in 10.8s (application-code: 10.7s)` | **App:** `currentUser()` (Clerk Backend API) has no retry. One dropped HTTPS call 500s every admin page. A real admin could hit this too, not only the test | Retry `currentUser()` once on a transport failure (no HTTP status, `fetch failed`-class message), then throw as today. Admin decision unchanged: still only `privateMetadata.isAdmin === true` |
| `proxy-gate.u02.spec.ts:24` [mobile] | `page.goto('/portal')` exceeded 20 s waiting for `load` (:57), signed-out visitor. Our server logged every `/portal` request in that window at 45–107 ms | **Test + third party:** a signed-out `/portal` goes through Clerk's dev handshake redirects to sign-in, and `goto` waits for `load` of the last page, Clerk's scripts included. One slow Clerk hop stalls the whole wait. Not proven by trace: the trace was in `test-results/`, which each run wipes | `goto('/portal', { waitUntil: 'commit' })`, then the existing `toHaveURL(/sign-in/)` and sign-in text checks with an explicit 20 s timeout (the audit's "explicit wait on Clerk-dependent steps", applied here only) |
| `stored-preview.img03.spec.ts:110` [desktop] | Failed at 50.2 s in `waitForPreview` (:59–61): the tile switched to the preview within its 30 s poll, then `naturalWidth > 0` stayed 0 for the **default 10 s** | **Test:** the second wait in the helper covers the same async pipeline as the first (preview stored → first `/_next/image` miss for it) but gets 10 s, not `PREVIEW_WAIT_MS` (30 s, :23). Dev log shows no optimizer error, so the image was slow, not broken | Give the `naturalWidth` poll `PREVIEW_WAIT_MS` too. If it still fails with a broken image (naturalWidth 0 after 30 s), that's an app bug to file, not to wait out. Note: image specs are "never a flake" at land, so this one blocks lands |
| `public-form.0004.spec.ts:223/:283` (`usePickMode`, U-01 land run 191) | Not seen in the 10-21 or today's runs | **Test race, confirmed by reading the code:** `usePickMode` (:46–57) checks the radio, asserts `toBeChecked()` and reloads (:53). `NamesModeSetting` shows the choice optimistically (`components/portal/OrderFormSettings.tsx:190–205`, `pending ?? run.namesMode`), so `toBeChecked()` passes before `setNamesMode` commits, and the reload can read the old mode | Reload inside `expect(async () => { reload; expect radio checked }).toPass({ timeout: 20_000 })`, so the check only passes once the stored mode reads back |
| UserButton hydration mismatch (t_f9bc0150) | Only with `--workers=4`. Config is 1 worker | — | **Out of scope:** it belongs to P6 (deferred) |

## 4. The 10-18 → 10-20 slowdown

Per-test durations for the 56 tests with the same `file:line` and project in every run (`tools/compare.py`):

| Run | Sum of the 56 | Median test |
|---|---|---|
| 10-18 lightbox | 8.60 min | 9.1 s |
| 10-20 IMG-04 r2 full #1 | 12.74 min | 11.7 s |
| 10-20 IMG-04 r2 full #3 | 14.57 min | 14.0 s |
| 10-21 receipt run 1 | 8.89 min | 8.8 s |
| 10-21 receipt run 2 | 9.41 min | 9.1 s |
| **10-24 this run** | **8.72 min** | **8.8 s** |

Example: `size-chips.0004:235` [desktop] took 6.7 / 24.4 / 6.1 / 6.4 / 6.7 / 6.2 s. The code didn't change
between 10-20 and 10-21 for these specs, and the suite went back to its 10-18 speed. Clerk FAPI is at
138 ms today, against the 3–4.7 s ss-dev measured on 10-20 (run 260). **Lead: the slowdown was external
(Clerk dev API latency that day), not ours.** Nothing to build. If it comes back, `tools/probe.py`
alongside the run tells the two apart in one pass.

## 5. Where today's 12.8 min goes

| Bucket | Min | Share |
|---|---|---|
| `npx convex run` spawns (§1) | 5.1 | 39% |
| Navigations (`goto`, `reload`, load-state waits) | 3.9 | 30% |
| Everything else (clicks, fills, `expect`s, context setup) | 3.8 | 31% |

The biggest file is `public-form.0004` at 2.9 min (22%). After P4a+P4b the spawns drop to about 2.6 min.
Further gains have to come from running fewer tests (P7) or running them in parallel (P6), not from
seeding.

## Reproduce

```bash
S=$PWD/docs/architecture/process-e2e-timed-run/tools
mkdir -p /tmp/shim && cp $S/npx-shim.sh /tmp/shim/npx && chmod +x /tmp/shim/npx   # edit LOG path inside
PATH=/tmp/shim:$PATH STEP_LOG=steps.jsonl PLAYWRIGHT_JSON_OUTPUT_FILE=report.json \
  node_modules/.bin/playwright test --reporter=list,json,$S/step-reporter.mjs
# analyse.py / compare.py read their inputs from the scratch dir named at the top of each file.
```

Pitfall: `date` on this host is uutils, and `%3N` prints unpadded nanoseconds. `analyse.py` has a
`ms()` helper that handles it.
