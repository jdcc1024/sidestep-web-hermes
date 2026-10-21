# Process audit: E2E suite and the feature dev loop

Card t_b6b626db, 2026-10-21. Audit only: no tests, config, app code or skills were changed.

## Verdict

**Most of the time goes into running E2E: 178 of the 237 minutes (75%) that IMG-04 took from picking up
the tests card to SDET approval.** Claude Code's build took 5.2 minutes (2%). The suite is slow, at about
26 min per full run, but the bigger cost is how often it runs. On a green path each feature gets 3–4 full
runs (dev, SDET, land, post-merge). Every failure currently triggers a rerun of the whole suite rather
than just the failed tests. Those failures are mostly flakes and fixtures that a feature made obsolete on
purpose, not product bugs. Over the history I could trace, the E2E suite caught **2 real product bugs**,
against 13 flake failures, 4 environment outages and 8 episodes of tests that were wrong (about 65
failures).

The four cheapest cuts delete no tests (P1–P4 below). Together they take an IMG-04-shaped feature from
about 3 h of E2E to about 1 h.

Every number below cites a log file or a script. Scripts are in
`~/.hermes/profiles/ss-architect/cache/scratch/` (read-only on the board DB, with `mode=ro`).

---

## 1. One feature, end to end: IMG-04 (2026-10-20)

Sources: board `task_runs` 257–261 (`feature_runs.py`), E2E start and end times from log mtimes and each
log's Playwright summary line (`timeline.py`), Claude cost and duration from
`~/sidestep/logs/2026-10-20-IMG-04.json`.

```
19:25 ─ SDET acceptance tests (run 257) ................................. 7m
19:32 ┬ ss-dev build, round 1 (run 258) ................................. 68m
      │  Claude Code build    ██ 5.2m  ($1.81)                       IMG-04.json
      │  e2e spec              ▏ 1.1m                                IMG-04-spec.log
      │  e2e FULL             ████████████████████████████████ 36.6m IMG-04-e2e.log   70✓ 33✘
      │  e2e rerun 30          ████ 5.3m                             IMG-04-e2e-rerun.log
      │  e2e public-form       ███ 4.2m                              IMG-04-e2e-pf.log
      │                       └── E2E 47.2m of 68m (69%)
20:41 ─ SDET: changes requested (run 259), stale fixtures ............... 1m
20:43 ┬ ss-dev build, round 2 (run 260) ................................. 112m
      │  e2e touched (46)     ██████████ 11.6m                       IMG-04-r2-e2e-touched.log
      │  e2e egress            ██ 2.0m                               IMG-04-r2-e2e-egress.log
      │  e2e FULL #1          ██████████████████████ 24.7m  1✘ flake IMG-04-r2-e2e-full.log
      │  e2e FULL #2          ███████████████████████ 26.0m 1✘ flake IMG-04-r2-e2e-full2.log
      │  e2e admin             ██ 1.9m                               IMG-04-r2-e2e-admin.log
      │  e2e FULL #3          ████████████████████████ 27.2m 2✘ flake IMG-04-r2-e2e-full3.log
      │                       └── E2E 93.4m of 112m (83%)
22:35 ┬ SDET review (run 261) ........................................... 47m
      │  e2e FULL             ███████████████████████ 26.7m 4✘ flake IMG-04-sdet-e2e.log
      │  e2e rerun 3 files    ██████████ 11.0m                       IMG-04-sdet-rerun.log
      │                       └── E2E 37.7m of 47m (80%)
23:22 ─ approved (with caveat: no single green full run)
        ─────────────────────────────────────────────────────────────
        wall 3h57m · E2E 178.3m (75%) · Claude 5.2m (2%) · 6 full runs incl. SDET
        Still to come: land and post-merge, usually one more full run each.
```

Other features, with the same sources:

| Feature | Board runs (min) | E2E evidence | Claude build |
|---|---|---|---|
| IMG-05 (10-20/21) | tests 5, build 53, review 31 | ≥28.4m in logs: SDET full 21.5m + 5 partials. The dev's full log has no summary line (`img05-e2e-full.log`) | 8.2m, $2.43 (`2026-10-20-IMG-05.json`) |
| 0004 lightbox (10-18) | tests 12, build 25, review 19, land 17 | 3 full runs at about 15.6–15.8m (`2026-10-18-0004-lightbox-e2e.log`; run 250 and 253 summaries) ≈ 47m of 73m | 1.2m (lightbox-375 json) |
| IMG-03 (10-17) | tests 4, build 32, review 3 | SDET ran only the new spec (run 212) | 8.0m, $2.60 |
| R3-02 (10-09→17) | build 49 (blocked on JCC) + 47, review 12, land 7 (blocked: Convex plan limit) + 14 | dev ran **3 full runs** because 2 had flakes on different tests (run 188) | 3.9m, $1.35 |

The pattern holds across all of them. Claude spends minutes, the agents' E2E loop spends hours, and the
loop grows with suite size and flake rate.

---

## 2. Where the E2E time goes

### Suite size and duration over time

| Log | Tests (both projects) | Wall | Sum of test times | Overhead (setup/compile) |
|---|---|---|---|---|
| `2026-10-09-R3-04-e2e.log` | 68 | 11.1m | 10.9m | 0.2m |
| `2026-10-17-land-IMG-e2e.log` | 86 | 13.2m | 12.9m | 0.3m |
| `2026-10-18-0004-lightbox-e2e.log` | 110 | 15.8m | 15.6m | 0.2m |
| `2026-10-20-IMG-04-r2-e2e-full.log` | 114 | 24.7m | 24.4m | 0.3m |
| `2026-10-20-IMG-04-r2-e2e-full3.log` | 114 | 27.2m | 26.9m | 0.3m |

(`trend.py`.) Two findings:

- **Global setup, login and dev-server compile cost almost nothing.** Wall minus summed test time is
  0.2–0.3m on every run. The first desktop test of each spec is no slower than its mobile twin, which
  runs later on a warm server: the median difference is 0.0s on 10-18 and −0.3s on 10-20 (`warm.py`).
  Switching to `next build && next start` would not save time, so I rejected it.
- **From 10-18 to 10-20 the same tests got about 60% slower**, even though they had only 4 new tests to
  add. Specs that IMG-04 did not touch went from 8.1 to 13.0 min (+61%) (`drift.py`). Example:
  `size-chips.0004:98` took 6.5s/6.3s on 10-18 and 18.4s/11.0s and 19.4s/21.2s on 10-20 (`trend.py`).
  ss-dev measured Clerk dev API calls at 3–4.7 s (run 260). I have not proved the cause. Shared dev
  Clerk/Convex latency and machine load (4 cores, 7 GB, with Hermes and Claude running alongside) are the
  suspects. This is also what produces the 10 s timeout flakes in §3.

### Per spec (median of the 4 full runs on 10-20, both projects; `spec_table.py`)

| Spec | Min/run | Share |
|---|---|---|
| public-form.0004 | 4.5 | 17.5% |
| size-chips.0004 | 4.3 | 16.8% |
| public-form.0004-lightbox | 3.2 | 12.7% |
| stored-preview.img03 | 1.7 | 6.8% |
| retire-flat-fields.r203 | 1.5 | 5.8% |
| order-form-sizes.r205 | 1.1 | 4.2% |
| 16 others | 9.3 | 36% |
| **Total** | **25.6** | |

Three files make up 47% of the suite.

### Slowest 10 tests (median of 4 runs on 10-20; `per_spec.py`)

| s | Project | Test |
|---|---|---|
| 35.0 | mobile | stored-preview.img03:63, captain uploads print-size PNG |
| 34.0 | mobile | size-chips.0004:121, no row says 'Added by' |
| 32.7 | desktop | public-form.0004:147, two-design form tiles |
| 29.3 | mobile | size-chips.0004:174, ⋯ lists both people |
| 28.7 | desktop | public-form.0004:116, no picture / only PDF |
| 28.6 | desktop | stored-preview.img03:109, player sees picture, no original |
| 28.4 | desktop | retire-flat-fields.r203:103, player signs in, sees jersey (20.6–59.8s) |
| 27.9 | mobile | image-egress.img02:69, big PNG stored once |
| 27.7 | desktop | public-form.0004:283, pick-your-name alignment |
| 25.5 | desktop | size-chips.0004:121 |

The spread on each test is wide (for example size-chips:121 runs 23–48 s), which points at environment
latency rather than test logic.

### Seeding cost: `npx convex run` per call

`e2e/support/convex.ts` spawns a fresh `npx convex run` process for every seed, attach and cleanup call.
Each test also gets one `cleanup(tag)` in fixture teardown (`fixtures.ts:56`).

- Measured: 8 calls to a read-only internal query, median **1.5 s** each, range 1.15–3.79 s
  (`convex_run_timing.py`).
- Counted statically: about **184 calls per project**, so about 368 per full run (`count_calls.py`;
  approximate, from regexes over the spec bodies).
- Estimate: about 368 × 1.5 s ≈ **9 min per full run, roughly a third of the suite**, spent on process
  spawns and round trips. This is an estimate. Validating it is the first step of P4.

### Fixed waits and timeouts

There are no `waitForTimeout` calls anywhere in `e2e/` (grep count is 0), which is good. The config sets
`retries: 0`, `expect.timeout` 10 s, `actionTimeout` 10 s and `timeout` 60 s. With Clerk at 3–5 s per
call, a 10 s expect has little headroom: every flake in §3 since 10-18 is a 10 s timeout.

---

## 3. Why the suite runs so often

### Who runs it at each step (skills plus run summaries)

| Step | Who | What they run | Evidence |
|---|---|---|---|
| Acceptance tests | ss-sdet | new spec(s), to confirm red | `sidestep-sdet` skill line 75; run 257 |
| Build | ss-dev | spec, then touched, then **full**; full again after any failure | IMG-04 logs above; run 188 (R3-02: 3 fulls) |
| Review | ss-sdet | **full** ("run verify and e2e yourself", skill line 84), then failed files | runs 138, 250, 261, 264 |
| Land | ss-dev | **full** on the merged tree | runs 129, 187, 198, 253 |
| Post-merge check | ss-sdet | **full** (sometimes) | runs 130, 191 |

That is 3–4 full runs on a green path. Each run starts from scratch, even when the tree hash is the same
as the previous run's (SDET's review in run 261 ran on the same tip that the dev's full3 had run on).

### What forced reruns on IMG-04

| Rerun | Cause | Bucket | Min |
|---|---|---|---|
| rerun 30 + public-form (r1) | 33 failures: fixtures attached a main with no preview, which IMG-04 made obsolete | test was wrong (obsolete by design) | 9.5 |
| r2 touched + egress | checking the fixture fix | test was wrong | 13.6 |
| r2 full #2, full #3, admin | full #1 and #2 each failed 1 *different* non-image test (10 s timeouts) | **flake** | 55.1 |
| SDET rerun | 4 failures, all passing on rerun | **flake** | 11.0 |

**66 of IMG-04's 178 E2E minutes were reruns caused by flakes.** Another 23 were the agents finding
out, one full run at a time, that 23 older specs depended on a fixture IMG-04 had made stale. A
`--last-failed` rerun of the 1–4 failures would have taken minutes.

---

## 4. Test effectiveness: what each spec has caught

Sources: every `✘` in `~/sidestep/logs/*e2e*` and the dev/SDET scratch logs (`fail_by_spec.py`), every
board run summary that mentions e2e/fail/flake (`e2e_fail_snips.py`, `bug_grep.py`), and the
`changes_requested` events (`board_changes.py`: there are only 2 on the whole board, F-02 and IMG-04).

### Failure episodes, bucketed

| Episode | Spec(s) | Bucket |
|---|---|---|
| R2-03: `identity.email` always null with the app's Clerk token (fixed ca41044) | retire-flat-fields.r203 | **real bug** |
| U-01 experiment: hydration mismatch in Clerk `UserButton` under `--workers=4` (t_f9bc0150) | order-form-player | **real bug** (low priority, not filed) |
| L-03: leaving order-list row stays in the a11y tree (bc00900, "the 1 failure that was a real code bug", run 65) | not named in the handoff | real bug, spec unattributed |
| R2-02: `/add item/i` locator | roster-entries-legacy.r201 ×2 | test was wrong (rename) |
| R2-05: first-name assertion, old radio locator | order-form-sizes.r205 ×4, retire-flat-fields ×2 | test was wrong |
| Public form: strict-mode `4 jerseys`, ellipsis rect count (run 141/142) | public-form.0004 ×2 | test was wrong |
| U-01 land: usePickMode reload race (run 191) | public-form.0004:223 | test was wrong (race) |
| IMG-04: 33 failures, fixtures without preview | lightbox ×11, public-form ×8, img01 ×4, others | test was wrong (obsolete by design) |
| IMG-05: 8 failures, older specs read the original's id from href; then egress guard on Download popup | img01, img03, img04, public-form | test was wrong |
| R2-04 order-form console error ×2 (run 122); R3-02 build 2 different tests incl. image-previews (run 188, `R3-02/r302-e2e-run2.log`); U-02 order-form-player "Loading order" 1 (run 228) | order-form, image-previews, order-form-player | **flake** |
| IMG-04 r2 full ×3 (1, 1, 2), SDET full 4 | r203 ×2, paste-ordered-by, stored-preview, lightbox, public-form, size-chips ×2 | **flake** (10 s timeouts, pass alone) |
| L-07 `ERR_NAME_NOT_RESOLVED`; R2-05 captain sign-in; R3-02 land Convex plan limit (72/72); Playwright chromium mismatch | all | **env** |

Totals: **2 attributable real bugs** (+1 unattributed), **13 flake failures across 7 runs**, **4 env
outages**, **8 test-was-wrong episodes (~65 failures)** — mostly tests that a feature deliberately
made obsolete and nobody updated before the full run found them.

### Runtime against what each spec caught

| Spec | Min/run | Real bugs | Flakes | Test wrong | Verdict |
|---|---|---|---|---|---|
| public-form.0004 | 4.5 | 0 | 1 | 4 episodes (17 fails) | shrink: layout loops → .ts / by eye (P7) |
| size-chips.0004 | 4.3 | 0 | 2 | 1 | 375-pinned → mobile run is a dup; paste variant → .ts (P3, P7) |
| public-form.0004-lightbox | 3.2 | 0 | 1 | 11 (IMG-04) | 9 pixel tests → keep 2 (P7) |
| stored-preview.img03 | 1.7 | 0 | 1 | 9 (IMG-04/05) | keep (image regression guard) |
| retire-flat-fields.r203 | 1.5 | **1** (identity.email) | 2 | 4 | keep |
| order-form-sizes.r205 | 1.1 | 0 | 0 | 4 | keep |
| captain-image-presets.img01 | 1.0 | 0 | 0 | 9 (IMG-04/05) | keep, one project |
| order-list-players.r202 | 1.0 | 0 | 0 | 0 | 375-pinned → mobile run is a dup |
| paste-ordered-by.0004 | 0.9 | 0 | 1 | 0 | CSV content → .ts |
| image-egress.img02 | 0.9 | 0 | 0 | 3 | keep (it is a guard, not a feature test) |
| proxy-gate.u02 | 0.9 | 0 | 0 | 0 | one project |
| preview-only.img04 | 0.7 | 0 | 0 | 3 | merge with img03:109 |
| paste-grouped / blank-cells / not-columns | 1.5 | 0 | 0 | 1 | paste parsing is logic: 1 E2E, rest .ts |
| image-previews.0004 | 0.5 | 0 | 1 | 2 | merge with img03:109 |
| order-form-player | 0.4 | **1** (UserButton hydration, `--workers=4` only) | 1 | 0 | keep |
| order-form, order-lock, portal.smoke, roster-legacy, home-carousel | 1.5 | 0 | 2 | 3 | keep (cheap smoke) |

("Min/run" = median 10-20, both projects. Failure counts from `fail_by_spec.py` + run summaries above.)

Read the table this way. **About 80% of E2E failures were the suite catching up with changes made on
purpose**, and about 15% were flakes. The real bugs showed up in the feature's own acceptance spec (r203)
or in a deliberate experiment (`--workers=4`). In the logs and handoffs I could trace, no full-suite run
caught a regression that a *later* feature introduced into an older workflow. That doesn't make the full
run worthless, since it is the regression net. It does argue for running it **once per tree**, not 3–6
times.

### Bugs that got past the suite

| Bug | Found by | Why E2E missed it |
|---|---|---|
| Edit sheet showed raw question ids (`q-shorts`) (68a179e, L-03) | dev's screenshot review | fixture keys answers by label |
| 375px lightbox picture 164×123 instead of 343 wide (t_be7f5cdd) | ss-dev by eye; JCC | no size assertion until the lightbox spec existed |
| F-02 hashchange leaves the FAQ item under the sticky nav | SDET review by reading/trying | not in a Done-when |
| Convex egress quota blown by our own E2E runs (t_457cae59) | Convex bill | the suite *was* the cause |
| R3-02 Next optimizer 504 past 7 s on a slow storage fetch | dev probe after a flake | showed up as a flake, not a failure |

Screenshots and review by eye caught at least as many customer-visible bugs as the E2E suite did.

---

## 5. Duplication

### Mobile project (`mobile_dup2.py`, full3 classification by reading each spec)

Every test runs in both `desktop` (1280) and `mobile` (375) projects. Many specs already pin their own
viewport (`test.use({ viewport: 375… })`, `setViewportSize(375)`, or a player context at 375), so
**the desktop project runs them at 375 too**. The same 375 test then runs twice.

| Class | Tests per project | Mobile min/run | Meaning |
|---|---|---|---|
| strict duplicate | 21 | 4.1 | the whole test is pinned to 375: the mobile run is identical |
| near duplicate | 17 | 4.7 | assertions run on a 375-pinned page; only the captain setup runs at the project size, or the check doesn't depend on viewport (CSV, cookie) |
| genuine | 9 | 2.25 | the mobile project is the only 375 run of these steps |

Dropping strict duplicates saves **4.1 min/run** with zero coverage change. Dropping near duplicates too
saves **8.8 min/run**.

### Workflow duplicates and .ts candidates (`cuts.py`, desktop-only saving)

| Group | Tests | Min/run | Why |
|---|---|---|---|
| Lightbox pixel geometry (keep 1280 16:9 + Esc) | 7 | 1.9 | 9 tests measure one CSS rule at different sizes |
| Paste parsing variants (keep paste-grouped:39) | 8 | 1.1 | `lib/paste*` logic already has .ts tests; the browser adds nothing past one workflow |
| public-form layout loops (:184 ×2 widths, :283) | 2 | 0.7 | alignment checks, better by eye |
| Admin CSV content (keep r203:47 as the one download) | 1 | 0.2 | `lib/orderExport.ts` / `rosterExport.ts` have .ts tests |
| "player form shows preview, never original" ×3 | 2 | 0.3 | img03:109, img04:94, 0004 previews cover one rule |
| **Total** | **20** | **4.2** | (and the same again for any of these that also run on mobile) |

---

## 6. Parallelism: what stops `workers > 1`

| Blocker | Status | What it takes |
|---|---|---|
| Shared data | **Mostly solved already.** Every row is tagged `E2E <tag>` per test and swept by tag (`_e2e.ts` cleanup, `fixtures.ts:53-56`) | audit for tests that count *all* the admin's orders or designs rather than their own (dashboard/portal lists) |
| Auth | one admin storage state (`.auth/e2e-state.json`) shared read-only. Fine for parallel use | none |
| Hydration mismatch in Clerk `UserButton` | **real blocker**: 7/18 order-form-player runs fail under `--workers=4` because the console-error guard trips (t_f9bc0150) | fix the bug (ss-dev card) |
| One `next dev` server, 4 cores / 7 GB | unmeasured; dev compiles on demand | try `--workers=2` first |
| Clerk/Convex dev latency | already the flake source at 1 worker | P5 first, or parallel will make it worse |
| Convex egress quota | IMG-02 guard keeps it low | none |

Parallelism is worth having, but it should come after P1–P5. At today's flake rate, two workers would
mostly mean faster reruns.

---

## 7. Proposals, ranked

"Saved per feature" assumes an IMG-04-like feature: 3 green full runs at about 26 min plus that
feature's actual reruns. All savings are estimates derived from the measurements above.

| # | Change | Saved per feature | Effort | Coverage risk | Touches |
|---|---|---|---|---|---|
| **P1** | **Run the full suite once per tree.** The dev runs full once at handoff and writes a receipt (tree hash + log path), as `verify` already does. SDET runs the acceptance specs plus the touched specs and reads the dev's log; it reruns the full suite only if the tree differs. Land runs full once on the merged tree. Post-merge runs smoke only | 26–52m (1–2 full runs) | S: skill text + a small receipt script | none: same tree, same suite | sidestep-sdet, sidestep-dev skills; needs_decision |
| **P2** | **Rerun only what failed.** On red, run `npx playwright test --last-failed`. Rerunning the whole suite is no longer allowed. Keep `retries: 0`: a pass on rerun still counts as a flake and gets logged to one flake card | 20–65m when flaky (IMG-04: 66m → about 5m) | S: skill text | none | sidestep-dev, sidestep-sdet skills; needs_decision |
| **P3** | **Mobile project only where it adds coverage.** Tag the genuine-375 tests (or `grepInvert` in the mobile project for tests whose viewport is pinned) | 4.1 min/run strict (12m/feature); 8.8 min/run with near dups (26m/feature) | S: config + tags | none for strict; low for near | playwright.config.ts, e2e tags (SDET-owned) |
| **P4** | **Cut the `npx convex run` spawns.** One composite `_e2e:seedScenario` internal mutation per test instead of 2–4 calls, plus a batched cleanup. First validate the 9-min estimate with one timed run | about 4–5 min/run (12–15m/feature), estimate | M | none | `convex/_e2e.ts`, `e2e/support/convex.ts` (issue for ss-dev/SDET) |
| **P5** | **Fix the flake causes.** Measure Clerk/Convex latency inside one timed run; give admin-page waits that depend on Clerk an explicit 20 s expect instead of a blanket timeout increase; fix the usePickMode race and the UserButton hydration mismatch | removes most P2 reruns | M | none (better) | e2e specs, app (UserButton) |
| **P6** | **`workers: 2`** after P5 and a shared-count audit | about 40% of each run's wall time, unmeasured | M | flake risk until P5 | playwright.config.ts |
| P7 | **Shrink**: 20 tests to .ts tests or deleted (§5) | 4.2 min/run desktop (about 13m/feature) | M | low; changes the E2E/.ts split | e2e, lib tests; needs_decision |
| **P8** | **Name the specs a feature breaks on purpose before the build.** When an issue changes a shared rule (IMG-04: "pictures only from the preview"; IMG-05: "no original URL before Download"), the architect greps `e2e/` and `convex/_e2e.ts` for the old behaviour and lists the specs and fixtures to update in the issue, so they are fixed before the first full run | IMG-04: 33 failures plus 23m of reruns and 1 changes-requested round (run 259); IMG-05: 8 failures | S | none | sidestep-architect skill (my own) |
| rejected | `next build && next start` for E2E | about 0: compile overhead measures 0.2–0.3m/run | M | | |
| rejected | `retries: 1` in config | hides flakes, against the "flake is a bug" rule | S | hides real intermittent bugs | |

**P1–P4 and P8 delete no tests.** Together they take a green IMG-04-shaped feature from about 3 h of
E2E to about 1 h: one full run at about 26 − 4 − 4 ≈ 18 min, plus targeted SDET and land runs.

## Decisions for JCC

1. **Run the full suite once per tree (P1).** Options: A) dev runs full once and SDET trusts its receipt
   on the same tree (land runs full once, post-merge runs smoke only); B) keep SDET's independent full run
   and drop it from land/post-merge; C) no change. **Recommend A.** SDET still runs the acceptance and
   touched specs, so the independent check covers the new behaviour, and a matching tree hash makes the
   dev's full run as good as a rerun.
2. **Rerun rule on red (P2).** Options: A) `--last-failed` only, and log every pass-on-rerun to one
   standing flake card; B) keep full reruns. **Recommend A.** `retries` stays 0, so flakes stay visible.
3. **Mobile project scope (P3).** Options: A) skip only the strict duplicates (4.1 min/run, zero coverage
   change); B) also skip the near duplicates (8.8 min/run); C) no change. **Recommend A now**, and B after
   SDET reviews the 17 near-duplicate tests one by one.
4. **Shrink the browser suite (P7).** This changes the 2026-10-02 strategy in practice: some "Done when"
   lines would be checked by .ts or by eye rather than by a browser. Options: A) approve the 20-test list
   in §5; B) only the lightbox pixel tests; C) none. **Recommend B for now.** The paste/CSV moves are worth
   it but less urgent once P1–P3 have landed.
5. **Parallel workers (P6).** Recommend deferring it until P5 has landed; no decision needed yet.

### Suggested follow-up cards (to be created after the gate, not now)

1. ss-architect issue: P1 receipt + P2 rerun rule (skill and script text), plus P3 config.
2. ss-sdet: P3 tags; P7 if JCC approves it.
3. ss-dev: P4 composite seed, P5 UserButton hydration fix.
4. One timed `--reporter=json` run to validate the P4 estimate and the latency hypothesis behind the
   10-18→10-20 slowdown.
