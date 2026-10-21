# Issue: Full E2E suite once per tree (receipt), rerun only what failed, mobile skips 375-pinned tests

## Phase: 3

## Type: infrastructure

## Size: S–M (~9 tooling files + one-line tags in ~11 specs; Claude ~$2; SDET ~$3)

## Description

Approved by JCC at the E2E audit gate (t_75e92ddc, Discord #office-hours
thread 1562381438295343115, "Q1. A, all four"). Audit:
`docs/architecture/process-e2e-audit.md` §3, §5, §7 (P1, P2, P3, P8). The
role-skill text for P1/P2/P8 is in `docs/architecture/process-e2e-skill-diffs.md`.
JCC reviews it at Gate 2. This issue is only the tooling.

JCC's goal for E2E, which every rule here is checked against: *"catch error
messages from next JS that show up while browsing each page, as well as the
functionality of KEY operations (opening and viewing designs and orders,
adding roster entries, jersey run, etc)"*.

```
today (green path)   dev FULL ─ SDET FULL ─ land FULL ─ post-merge FULL    + full reruns on red
after PROC-01        dev FULL ─ SDET check+specs ─ land FULL ─ post-merge SMOKE   + --last-failed on red
                       │            ▲
                       └─ receipt ──┘   (.e2e-receipt.json, pinned to the tree hash)
```

The issue adds no test, deletes no test and loosens no assertion. `retries`
stays `0`.

### Options considered

| Option | Verdict |
|---|---|
| **A. A receipt script modelled on `verify.mjs`** (same tree-hash rule, a gitignored JSON receipt, `check` subcommand) | **Picked.** It follows a pattern the team already trusts, has no new dependency and is about 150 lines |
| B. Trust the dev's handoff text ("full run green") with no receipt | Rejected. The audit found SDET ran a full suite on the *same* tip because nothing proved it was the same (run 261). Text can't prove a tree |
| C. `retries: 1` in config instead of a scripted rerun | Rejected by the gate. It hides flakes, and the scripted rerun records them |
| D. P3 by `testIgnore` of the 7 pinned files in the mobile project | Rejected. It is a file list in the config that silently covers any new test added to those files, and the reason isn't visible at the test. A per-test tag is explicit and greppable |

### 1. What "the same tree" means

`treeHash()` = `git write-tree` of a **temporary index** built with
`git add -A` (`GIT_INDEX_FILE` pointed at a temp file; the real index is never
touched). This is exactly what `scripts/verify.mjs` does today. So the hash:

| Changes the hash | Does not change the hash |
|---|---|
| any edit to a tracked file, staged or not | committing, amending a message, switching to a branch with identical content |
| a new untracked file that isn't ignored | gitignored paths: `node_modules/`, `.env*`, `.next/`, `.auth/`, `test-results/`, `playwright-report/`, the receipts, `.e2e-logs/` |
| deleting a tracked file | the HEAD commit id (recorded, never compared) |

**Match** = `receipt.tree === treeHash()` *and* the receipt is valid (below).
**Mismatch, missing or unreadable receipt** = the full suite must run again on
this tree (`npm run e2e:full`). There is no partial credit and no override flag.

Not covered by the hash: `.env.local`, `node_modules` and the Convex dev
deployment's pushed functions and data. Same checkout and same dev deployment
make this acceptable (see Risks).

### 2. Receipt format and location

`.e2e-receipt.json` at the repo root, next to `.verify-receipt.json`, and
gitignored, because a tracked receipt would change the tree it describes.
It is written **only** when the run passes, and an old receipt is deleted at the
start of every `e2e:full`, so a failed or aborted run can't leave a valid
one behind.

```json
{
  "version": 1,
  "tree": "<40-hex git write-tree>",
  "head": "<HEAD sha at run time; informational>",
  "finishedAt": "2026-10-22T03:14:00.000Z",
  "playwright": "1.61.1",
  "counts": { "passed": 98, "failed": 0, "flaky": 1, "skipped": 13 },
  "flaky": [
    { "file": "e2e/size-chips.0004.spec.ts", "line": 121, "project": "desktop", "title": "375px: no row says 'Added by', …" }
  ],
  "logs": {
    "full": "/home/jdcc/sidestep-web-hermes/.e2e-logs/20261022T025801Z-1a2b3c4d5e6f-full.log",
    "rerun": "/home/jdcc/sidestep-web-hermes/.e2e-logs/20261022T025801Z-1a2b3c4d5e6f-rerun.log"
  }
}
```

A receipt is **valid** only if it parses as JSON and has `version === 1`, a
40-hex `tree`, a string `logs.full` and `counts.failed === 0`. Anything else
counts as "unreadable".

Logs go to `.e2e-logs/` in the repo (gitignored), not `test-results/`.
Playwright empties `test-results/` at the start of every run, so SDET's
targeted run would wipe the dev's log. Each run writes `<stamp>-<tree12>-full.log` +
`-full.json` (Playwright JSON report), plus `-rerun.log` / `-rerun.json` if a
rerun happened. The script does not prune old logs. They are small, and
JCC can delete the folder.

### 3. `scripts/e2e.mjs`: behaviour

`npm run e2e:full` → `node scripts/e2e.mjs full`

1. Refuse any extra argument (exit 2, with "e2e:full runs the whole suite; use
   `npx playwright test <files>` for a subset"). A filtered run must never be
   able to produce a receipt.
2. Delete `.e2e-receipt.json`. Record `tree0 = treeHash()`.
3. Run `npx playwright test --reporter=list,json` with
   `PLAYWRIGHT_JSON_OUTPUT_FILE=.e2e-logs/<stamp>-<tree12>-full.json`. Tee
   stdout+stderr to the console and to `-full.log`.
4. If the JSON report is missing or has top-level `errors` (global setup
   failed, dev server didn't start, Clerk/Convex unreachable), print "no
   usable report: environment failure, see <log>" and exit 1. Don't rerun.
5. If any test failed, run `npx playwright test --last-failed
   --reporter=list,json` **once** into the `-rerun.*` files. Never a second
   rerun, and never a full rerun.
6. `tree1 = treeHash()`. If `tree1 !== tree0`, print "files changed during
   the run; no receipt" and exit 1.
7. `summarizeRun(fullReport, rerunReport | null)` decides:
   - **pass**: no failures, or every failure passed on rerun. Write the
     receipt. Print one `flake: <file>:<line> [<project>] <title>` line per
     flaky test and a summary line with the tree, the counts and the log path.
     Exit 0.
   - **fail**: at least one test failed in both runs. Print those tests and
     the log paths. Exit 1, with no receipt.

`npm run e2e:check` → `node scripts/e2e.mjs check`

- Match: print `match: full run <finishedAt>, <passed> passed, <flaky> flaky,
  log <logs.full>` and exit 0.
- Otherwise print one of `no receipt` / `unreadable receipt` /
  `tree changed: receipt <tree12> ≠ current <tree12>`, then
  `run npm run e2e:full`, and exit 1.

`npm run e2e:smoke` → `playwright test --grep @smoke` (both projects, no
receipt; see §5).

`npm run e2e` stays as it is (`playwright test`), so nothing that calls it
breaks. The skills move to `e2e:full`.

**Code layout.** The pure logic goes in `lib/` so vitest can test it, following
`lib/e2eEgress.ts`:

- `lib/treeHash.ts`: `treeHash(cwd: string): string`. The function moves
  out of `verify.mjs`, and `verify.mjs` imports it, so "same tree" has exactly
  one definition.
- `lib/e2eReceipt.ts`: `checkReceipt(raw: string | null, tree: string)` →
  `{ ok: true, receipt } | { ok: false, reason: "missing" | "unreadable" | "tree-changed" }`,
  `summarizeRun(full, rerun)` → `{ pass, counts, flaky[], failed[] }`, and the
  `E2eReceipt` type. A test's identity across the two reports is
  `file + line + column + projectName`, read from the JSON reporter's
  `suites[].specs[].tests[]`. A test with status `unexpected` in `full` and
  `expected` in `rerun` is flaky.
- `scripts/*.mjs` import these as `../lib/treeHash.ts` and
  `../lib/e2eReceipt.ts`. Node 26 strips the types natively (checked:
  `node` v26.9.0 runs an `.mjs` that imports a typed `.ts`). That puts two
  constraints on the two lib files: erasable TS only (no `enum`, no
  `namespace`, no parameter properties), and **no imports between them or
  from `@/`**, because Node can't resolve `@/` and tsc rejects `.ts`
  extensions in TS imports.

### 4. P3: mobile project skips the 375-pinned tests

Tag: **`@pinned-375`**. The config change in `playwright.config.ts` touches
the mobile project only:

```ts
{ name: "mobile", grepInvert: /@pinned-375/, use: { …unchanged } },
```

The desktop project is unchanged and still runs every tagged test, at 375,
because of each file's `test.use`.

**The rule for "strictly pinned"**: the file sets
`test.use({ viewport: { width: 375, … } })`, and every context the test opens
itself is also 375. If a single step runs at the project's size (a captain
setup on `page`, or a `setViewportSize` back to 1280), the test is **not**
strictly pinned. Both projects use `devices["Desktop Chrome"]` and differ
only in viewport, so a strictly pinned test runs identically in both.

**Count confirmed: 20, not 21.** The audit counted
`roster-entries-legacy.r201.spec.ts:14` as strict, but it isn't: it asserts
the list at the project's size, checks 375 with `setViewportSize`, then
goes back to 1280 (lines 25–42). So its mobile run is the only place where
the list's visibility assertions run at 375. It stays untagged (it is a
near duplicate and out of scope). `public-form.0004-lightbox.spec.ts:334` is
also near, not strict, because its captain setup runs on `page` at the
project's size. Measured saving for the 20: **3.9 min per full run** (mean of
the 4 full runs on 10-20, `strict20.py`), against the audit's 4.1.

Tag exactly these 20 tests (title as listed by
`npx playwright test --list` on main `1ee8524`):

| # | File:line | Test title |
|---|---|---|
| 1 | `e2e/size-chips.0004.spec.ts:98` | 375px: a player with S×1 and M×3 shows chips S×1 and M×3 and the row has no 'Added by' |
| 2 | `e2e/size-chips.0004.spec.ts:121` | 375px: no row says 'Added by', whether the captain or a player through the order form added the player |
| 3 | `e2e/size-chips.0004.spec.ts:152` | 375px: the design's blank entry reads 'Blank jerseys' with no 'Nothing printed' and no 'Added by' |
| 4 | `e2e/size-chips.0004.spec.ts:174` | 375px: ⋯ on a player with the captain's S×1 and Quinn's M×1 still lists both people and their sizes under 'Sizes added by' |
| 5 | `e2e/size-chips.0004.spec.ts:235` | 375px: the order total reads '47 jerseys' then one list item per size in 'Sizes on this order', with no '·' between sizes |
| 6 | `e2e/size-chips.0004.spec.ts:257` | 375px: with 7 sizes in the total line the page has no horizontal scroll and no size×count is split across two lines |
| 7 | `e2e/size-chips.0004.spec.ts:287` | 375px: pasting 'Sidestep 72 S' and 'Sidestep 72 M 3' previews one player with chips S×1 and M×3 |
| 8 | `e2e/paste-blank-cells.0004.spec.ts:57` | 375px: the Light block previews 11 new players and 19 jerseys, COACH R has no number and S×1, and Add keeps it that way |
| 9 | `e2e/paste-blank-cells.0004.spec.ts:98` | 375px: a tab row with an empty number cell (Name⇥⇥S⇥1) is added with no number and size S |
| 10 | `e2e/paste-grouped.r204.spec.ts:39` | 375px: pasting three rows for Sidestep #72 previews one player with S, M×3, XL and adds one row with 5 jerseys |
| 11 | `e2e/paste-grouped.r204.spec.ts:72` | 375px: pasting 'Avery Quinn 7 L' where Avery Quinn #7 has M shows the 'already on' note and leaves one row with M and L |
| 12 | `e2e/paste-not-columns.0004.spec.ts:78` | 375px: pasting the raw customer message shows the not-columns notice and Add stays enabled |
| 13 | `e2e/paste-not-columns.0004.spec.ts:94` | 375px: pasting the converted Light block shows no not-columns notice, and Add is enabled |
| 14 | `e2e/paste-ordered-by.0004.spec.ts:66` | 375px: the Light block with an Ordered by column previews every player's owner, and Sizes added by lists the owner 'from a pasted list' |
| 15 | `e2e/paste-ordered-by.0004.spec.ts:113` | 375px: a paste mixing 4- and 5-column rows is accepted in full; owners only where given |
| 16 | `e2e/paste-ordered-by.0004.spec.ts:182` | the admin order export's submitter name column holds the pasted owner, and is empty for a 4-column row |
| 17 | `e2e/order-list-players.r202.spec.ts:53` | 375px: a captain adds Sidestep #72 with 1 S, 3 M and 1 XL in one sheet and sees one player row |
| 18 | `e2e/order-list-players.r202.spec.ts:74` | adding ' sidestep ' #72 again with an L joins the player; lowering M to 2 updates row, design line and footer live |
| 19 | `e2e/order-list-players.r202.spec.ts:112` | removing Sidestep #72 and pressing Undo brings the row back with the same sizes |
| 20 | `e2e/home-carousel-image.u01.spec.ts:21` | a phone visitor sees the first carousel jersey, resized by /_next/image as WebP |

Pinning evidence: `test.use({ viewport: { width: 375, height: 812 } })` at
size-chips:22, paste-blank-cells:21, paste-grouped:25, paste-not-columns:23,
paste-ordered-by:22, order-list-players:28 and home-carousel:16–19. The only
extra context in these files is size-chips:66, and it is also 375.

Syntax, matching img05: `test("title", { tag: "@pinned-375" }, async (…) => …)`.
A test that also carries `@smoke` gets `{ tag: ["@pinned-375", "@smoke"] }`.

### 5. Smoke (post-merge only)

Post-merge runs after the land card has run the full suite on the same merged
tree, so smoke exists to catch the merge or push going wrong
(wrong tip pushed, env drift). It doesn't re-prove features. Smoke measures
itself against JCC's goal: pages load without a Next.js error, and the key operations work.
Every test already fails on any console error or page error (the
`browserErrors` auto fixture), which is what catches a Next.js runtime error.

Tag **`@smoke`** on these existing tests (no new tests):

| Spec:line | Covers (JCC's words) | Pages loaded | s/run desktop · mobile |
|---|---|---|---|
| `home-carousel-image.u01:21` | site loads | `/` | 1.9 · (pinned) |
| `portal.smoke:6` | viewing orders | `/portal`, `/portal/orders/[id]` | 7.7 · 8.4 |
| `captain-image-presets.img01:59` | opening and viewing designs | `/portal`, `/portal/designs/[id]` | 14.6 · 19.5 |
| `order-list-players.r202:53` | adding roster entries (captain) | `/portal/orders/[id]` | 7.4 · (pinned) |
| `order-form:15` | jersey run: make the form, open its link, Form settings | `/portal/orders/[id]`, `/run/[id]`, `/portal/orders/[id]/run/setup` | 10.2 · 10.4 |
| `order-form-player:15` | jersey run + adding roster entries (player submits, captain sees it) | `/run/[id]`, `/portal/orders/[id]` | 12.9 · 14.1 |
| `order-lock:110` | viewing and editing orders (admin) | `/admin/orders/[id]` | 11.0 · 10.5 |
| `roster-entries-legacy.r201:14` | viewing older orders (flat items) and CSV | `/portal/orders/[id]` | 11.7 · 9.2 |
| `proxy-gate.u02:24` | signed-out visitor: sign-in gate, public form | `/sign-in`, `/run/[id]` | 14.2 · 11.9 |

Measured: about 92 s desktop + 84 s mobile ≈ **3 min**, against about 26 min for
the full suite (medians of the 10-20 full runs).

**What smoke does NOT cover against JCC's goal (gaps, listed and not fixed here):**

1. **14 of 24 routes are loaded by no spec at all**, in smoke or in the
   full suite: `/portal/designs`, `/portal/designs/new`,
   `/portal/orders/new`, `/portal/orders/[id]/edit`, `/admin`,
   `/admin/orders`, `/admin/designs`, `/admin/designs/[id]`,
   `/admin/customers`, `/admin/customers/[id]`, `/admin/leads`,
   `/admin/jersey-runs`, `/admin/jersey-runs/[id]`, `/intake`
   (`/dev/components` is dev-only and excluded). A Next.js error on any of these
   pages reaches `main` unseen. This is the largest gap against "browsing
   each page".
2. **Creating a design and creating an order through the UI**: every spec
   seeds them with `seedOrder` and `attachBigPng`. Uploading a picture is
   covered in the full suite (`stored-preview.img03:64`, `preview-only.img04:47`),
   but not in smoke.
3. **Jersey run, admin side**: `/admin/jersey-runs` (responses across runs)
   is not loaded anywhere.
4. **Download of the original (print file)**: in the full suite
   (`original-download.img05:35`, `:84`), not in smoke.
5. **Paste a roster**: in the full suite (`paste-grouped.r204:39`, desktop),
   not in smoke.

Gaps 1 and 3 could be closed by one "page sweep" spec (admin visits each
route with seeded ids and checks the console guard plus no `nextjs-portal`
overlay), tagged `@smoke`. That is a new test, so it is a decision for JCC,
not part of this issue.

## Done when
1. After a green `npm run e2e:full`, `.e2e-receipt.json` holds the current tree hash, the absolute log path and the pass/fail/flaky/skipped counts, and `npm run e2e:check` exits 0. A run where a test fails in both the full run and its single `--last-failed` rerun exits 1 and leaves no receipt. (Evidence: the build card's own full run, plus one run with a deliberately failing throwaway spec that is not committed.)
2. `npm run e2e:check` exits 0 on the tree the receipt was written for, and still exits 0 after committing that tree unchanged. It exits 1 and names the reason (`tree changed` / `no receipt` / `unreadable receipt`) after a tracked edit, after a new untracked file, or when the receipt is deleted or corrupted. (Evidence: the dev runs each case on the branch and pastes the output in the handoff; the `.ts` tests below cover the same rules in isolation.)
3. `npx playwright test --list --project=mobile` lists exactly 20 fewer tests than on `main` (59 → 39), none of them carrying `@pinned-375`. `--project=desktop` lists the same count as on `main`, and `npx playwright test --list --grep @smoke` lists the 9 smoke tests (×2 projects, minus the 2 pinned ones on mobile = 16).

## Logic
- `treeHash(cwd)` (`lib/treeHash.ts`, scratch git repo in a temp dir): same content gives the same hash before and after a commit; a tracked edit or a new untracked file changes it; a gitignored file doesn't.
- `checkReceipt(raw, tree)` (`lib/e2eReceipt.ts`): a valid receipt with the same tree → `ok`; a different tree → `tree-changed`; `null`, non-JSON, wrong `version` or `counts.failed > 0` → `missing` / `unreadable`.
- `summarizeRun(full, rerun)` (`lib/e2eReceipt.ts`, small hand-built JSON-report fixtures): no failures → pass with no rerun needed; a failure that passes on rerun → pass with that test in `flaky`; a failure that fails again → fail with that test in `failed`, matched by file+line+column+project.

## Dependencies
- Blocked by: none. Same branch as the Q2 lightbox card (t_00065e01), which
  runs after this build. Gate 2 reviews one branch.

## Notes

**Branch:** `chore/PROC-01-e2e-dev-loop`, cut from `main` by SDET. The dev
builds on it and the lightbox card continues on it.

**Who does what on the branch**
- SDET (tests card): `lib/treeHash.test.ts`, `lib/e2eReceipt.test.ts`, the
  `@pinned-375` tags (§4 table), the `@smoke` tags (§5 table). The config
  change is the dev's. Before it lands, confirm the tags with
  `npx playwright test --list --project=mobile --grep-invert @pinned-375`
  (expect 39).
- Dev (build card): everything else below.

**Files likely touched**
- new: `lib/treeHash.ts`, `lib/e2eReceipt.ts`, `scripts/e2e.mjs`
- changed: `scripts/verify.mjs` (imports `treeHash`; no behaviour change),
  `playwright.config.ts` (mobile `grepInvert` only), `package.json`
  (`e2e:full`, `e2e:check`, `e2e:smoke`), `.gitignore` (`.e2e-receipt.json`,
  `.e2e-logs/`), `README.md` (commands block: the three new scripts)
- tests (SDET): `lib/treeHash.test.ts`, `lib/e2eReceipt.test.ts`; tag-only
  edits in `e2e/` size-chips.0004, paste-blank-cells.0004, paste-grouped.r204,
  paste-not-columns.0004, paste-ordered-by.0004, order-list-players.r202,
  home-carousel-image.u01, portal.smoke, captain-image-presets.img01,
  order-form, order-form-player, order-lock, roster-entries-legacy.r201,
  proxy-gate.u02

**Breaks on purpose:** none. Grepped `retries`, `verify-receipt`,
`treeHash`, `project.name`, `--list` and `grepInvert` across `e2e/`,
`scripts/`, `lib/` and `convex/`. The only project-dependent code is the
lightbox `beforeEach` skip (`public-form.0004-lightbox.spec.ts:209`). It
keys on titles starting `375px`, which the tags don't change.

**Review checks (read the diff, no tests)**
- `git diff main -- e2e/` shows only `{ tag: … }` additions: no assertion,
  locator, timeout or `test.skip` changed. Exactly 20 `@pinned-375` and 9
  `@smoke`.
- `playwright.config.ts`: only `grepInvert` on the mobile project. `retries`
  is still `0`. The desktop project is untouched.
- `verify.mjs` writes the same `.verify-receipt.json` as before (run it once
  on main and once on the branch, and compare the `tree` on the same content).
- `e2e.mjs full` rejects extra arguments, and no code path writes a receipt
  after a failed or filtered run.
- No new dependency in `package.json`.

**Risks**
- *The same tree against a different Convex dev deployment state.* The hash
  doesn't cover pushed Convex functions or `.env.local`. Dev and SDET share
  the checkout and the dev deployment, and the receipt is only trusted for the
  review step that follows it. If anyone pushes functions from another tree
  between the two, a match could vouch for a stale deployment. Mitigation:
  the skills keep "push functions first (`npx convex dev --once`)" before a
  full run. This is worth revisiting if a second checkout ever appears.
- *A real intermittent bug passes as a flake.* Every flake is logged to the
  one flake card with its log path, so a repeat offender is visible. P5 fixes
  the known causes.
- *Tag drift.* A new test added to a pinned file gets no tag and simply runs
  twice. That is safe, just slower. The SDET skill diff adds the tagging rule.

**Needs a board card (PM, not JCC):** one standing `[process] Flake log`
card that agents comment `flake:` lines on (the skill diffs refer to it by
that title).
