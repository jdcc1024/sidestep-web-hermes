# Role-skill diffs: E2E dev loop (P1, P2, P8)

Card t_59903f29, 2026-10-21. A proposal for JCC to approve at Gate 2 (t_ef5cac86).
Agents can't edit role skills, so nothing here has been applied. Tooling is in
`backlog/PROC-01-e2e-dev-loop.md`; these diffs are the matching rules.

Approved at gate t_75e92ddc ("Q1. A, all four"). JCC's goal for E2E, which every
rule below is checked against: *"catch error messages from next JS that show up
while browsing each page, as well as the functionality of KEY operations"*.

## What changes, in one table

| Rule | Before | After | Skill |
|---|---|---|---|
| P1 full suite once per tree | dev full (often 2–3×), SDET full, land full, post-merge full | dev `e2e:full` once → receipt; SDET `e2e:check` + acceptance and touched specs, full only on a tree mismatch; land `e2e:full` once; post-merge `e2e:smoke` | dev, sdet |
| P1 acceptance-tests card | `npm run e2e` (full) to confirm red | new specs only | sdet |
| P2 on red | rerun the whole suite | `--last-failed` once (built into `e2e:full`); a pass on rerun is a flake, logged to the `[process] Flake log` card; `retries` stays 0 | dev, sdet |
| P3 tagging rule | none | a test pinned to 375px gets `@pinned-375` | sdet |
| P8 breaks on purpose | none | the architect greps for the old rule and lists specs/fixtures in `## Notes`; SDET updates them on the test branch; the dev flags misses | architect, sdet, dev |
| Land card | not in ss-dev's skill (the PM skill creates it) | written down: merge, verify, `e2e:full`, push | dev |

Not changed: `sidestep-team`, `sidestep-pm`, `sidestep-website-dev`. The PM
skill already creates `Land on main + push` → ss-dev and `Post-merge check` →
ss-sdet, so the new dev and SDET sections slot into those cards.

## How to apply (JCC)

Each diff is against the live file (md5 prefix shown). It was generated with
`diff -u`, so it applies with `patch`:

```bash
cd ~/sidestep/agents/skills
patch -p1 --dry-run < dev.diff   # then without --dry-run
```

(Copy each block below into `<role>.diff`. The `a/` and `b/` prefixes are the
skill folder names.)

## sidestep-dev

P1 (full once, receipt, land card), P2 (rerun rule, no retries), P8 (flag a missed break). Live file md5 `2e060f39969b`.

```diff
--- a/sidestep-dev/SKILL.md
+++ b/sidestep-dev/SKILL.md
@@ -44,17 +44,46 @@
    - `npm run verify` passes
 5. **Fix small gaps**, or re-brief Claude once for big ones. If it still fails
    after 2 Claude runs, block with the evidence. Don't burn a third run.
-6. **Hand off.** `kanban_request_review(summary, metadata, reviewer="ss-sdet")`, with `branch`,
-   `commits`, `verify`, `cost_usd`, `decisions` and `needs_decision` (copied
-   from Claude's `## NEEDS DECISION` section) in the metadata.
-7. **Changes requested.** You'll be re-spawned on the same card with SDET's
-   reason. Fix it the same way, on the same branch.
+6. **E2E: the full suite once per tree.** While you work, run only the specs
+   you need (`npx playwright test <files>`). On red, rerun only what failed
+   (`npx playwright test --last-failed`), never the whole suite. When the
+   branch is final (verify green, nothing left to change), run
+   `npm run e2e:full` once. It reruns any failures once by itself, then
+   writes `.e2e-receipt.json`, pinned to this exact tree:
+   - **Pass** (exit 0): receipt written. Each `flake:` line it prints is a
+     test that failed once and passed on rerun. Comment those lines on the
+     `[process] Flake log` card and list them in the handoff.
+   - **Fail** (exit 1): a test failed twice. That's real. Fix it, then
+     `npm run e2e:full` again; the fix is a new tree.
+   - Any file change after the receipt, even a comment, invalidates it.
+     `npm run e2e:check` says whether it still holds. Committing doesn't
+     change the tree, so commit after the run if you like.
+7. **Hand off.** `kanban_request_review(summary, metadata, reviewer="ss-sdet")`, with `branch`,
+   `commits`, `verify`, `e2e_receipt` (tree, log path, counts, flaky),
+   `cost_usd`, `decisions` and `needs_decision` (copied from Claude's
+   `## NEEDS DECISION` section) in the metadata.
+8. **Changes requested.** You'll be re-spawned on the same card with SDET's
+   reason. Fix it the same way, on the same branch. The fix is a new tree, so
+   it needs a new `npm run e2e:full`.
+
+## Land card: `[NNNN] Land on main + push`
+
+1. `git switch main && git merge --ff-only <branch>`, then `npm run verify`.
+2. `npm run e2e:full` once on the merged tree, with the same pass/fail rules.
+   Don't push a red tree.
+3. Push, and put the receipt (tree, log path, counts, flaky) in the handoff.
+   The post-merge check after you runs smoke only.
 
 ## Rules
 
-- **Never merge or push.** The Gate 2 card does that after JCC approves.
+- **Never merge or push** outside a `Land on main + push` card, which the PM
+  creates only after JCC approves at Gate 2.
 - **Never weaken, skip or edit SDET's tests** to make them pass. If a test is
-  wrong, say so in `needs_decision` and let SDET fix it.
+  wrong, say so in `needs_decision` and let SDET fix it. If it broke because
+  of the issue's intended change but isn't in the issue's `Breaks on purpose`
+  list, name it in `needs_decision` too, so the architect's list improves.
+- **Never add `retries`** to the Playwright config or a spec. A pass on rerun
+  is logged as a flake, not hidden.
 - One Claude run at a time on the checkout.
 - **Security invariants** in `sidestep-website-dev` are non-negotiable. Check
   every diff touching auth, `convex/users.ts`, `convex/_auth.ts` or
```

## sidestep-sdet

P1 (trust a matching receipt, smoke post-merge, no full run on the tests card), P2 (rerun rule, flake card), P3 (tag rule), P8 (update listed specs on the test branch). Live file md5 `6e239e02735a`.

```diff
--- a/sidestep-sdet/SKILL.md
+++ b/sidestep-sdet/SKILL.md
@@ -26,7 +26,7 @@
 
 | Layer | Where | Run | Holds |
 |---|---|---|---|
-| E2E | `e2e/*.spec.ts` (Playwright) | `npm run e2e` | 1–3 customer workflows per issue; every test auto-fails on browser console/page errors; call `expectNoHorizontalScroll(page)` at 375px |
+| E2E | `e2e/*.spec.ts` (Playwright) | `npm run e2e:full` once per tree (receipt); targeted `npx playwright test <files>` otherwise | 1–3 customer workflows per issue; every test auto-fails on browser console/page errors; call `expectNoHorizontalScroll(page)` at 375px |
 | `.ts` | `convex/*.test.ts`, `lib/*.test.ts` | `npm test` | logic, auth/ownership, data invariants: happy path, unauthorised, one key unhappy path |
 | `.tsx` render | anywhere `*.test.tsx` | `npm run test:frozen` | **Frozen.** Excluded from `npm test`. Don't write, update or fix them; rot is accepted |
 
@@ -72,17 +72,36 @@
    They should fail for the right reason (feature missing). Name the accessible
    names (button/link/radio labels) the build must use in the handoff.
 3. Test behaviour, not implementation.
-4. Run `npm test` and `npm run e2e` and confirm the failures are the expected
-   ones. Commit (`test: acceptance tests for F-xx`).
-5. Complete, with `branch`, `commits`, the test file list, a criterion → test
+4. **Breaks on purpose.** If the issue's `## Notes` lists specs or fixtures
+   under `Breaks on purpose`, update them on this branch now, to the new
+   rule, so the dev's first full run doesn't find them one by one. Updating a
+   test to a rule JCC approved is not weakening it; say which ones you
+   changed in the handoff.
+5. Run `npm test` and the new and updated specs only
+   (`npx playwright test <files>`), and confirm the failures are the expected
+   ones. Don't run the full suite here: the build changes the tree, so its
+   full run would be thrown away. Commit (`test: acceptance tests for F-xx`).
+6. Complete, with `branch`, `commits`, the test file list, a criterion → test
    mapping and `cost_usd` in the metadata.
 
 ## Card 2: review (the card lands in the review column after `ss-dev` requests it)
 
 Follow the `sdlc-review` skill's lifecycle, plus these checks:
 
-1. On the build branch, run `npm run verify` and `npm run e2e` yourself. Don't
-   trust the handoff.
+1. On the build branch, run `npm run verify` yourself. Don't trust the
+   handoff. For E2E, the full suite runs once per tree:
+   - `npm run e2e:check`. **Exit 0 (match):** the dev's full run was on this
+     exact tree, including uncommitted and untracked files. Read its log
+     (path in the receipt) instead of rerunning it. Then run the acceptance
+     specs and every spec the diff touches yourself:
+     `npx playwright test $(git diff --name-only main...HEAD -- e2e/ | grep spec.ts)`.
+   - **Exit 1 (different tree, or receipt missing or unreadable):** run
+     `npm run e2e:full` yourself. It writes a new receipt for this tree.
+   - **Red:** never rerun the whole suite. `e2e:full` already reran its
+     failures once; after a targeted run, use `npx playwright test --last-failed`
+     once. A test that passes on rerun is a flake: comment it on the
+     `[process] Flake log` card and name it in the verdict. A flake alone
+     doesn't fail the build. A test that fails twice is a real failure.
 2. Check your acceptance tests are unchanged:
    `git diff <your-test-commit>..HEAD -- <test files>` must be empty.
 3. Read the diff against the issue. Anything missing? Anything beyond scope? Any
@@ -96,9 +115,24 @@
    - **Fail:** `kanban_request_changes(reason=…)`. Give numbered, concrete
      items, each one "where / what's wrong / expected".
 
+## Card 3: `[NNNN] Post-merge check`
+
+The land card already ran the full suite on the merged tree; its receipt is in
+the land handoff. Run **smoke only**: `npm run e2e:smoke` (tests tagged
+`@smoke`, defined in `backlog/PROC-01-e2e-dev-loop.md`). On red,
+`npx playwright test --last-failed` once, with the same flake rule as review.
+
 ## Rules
 
 - **Don't write feature code**, not even a one-line fix. Send it back.
-- **A flaky test is a bug.** Fix it or file an issue. Never skip it.
+- **A flaky test is a bug.** Fix it or file an issue. Never skip it, and never
+  add `retries`. Every pass-on-rerun goes on the one `[process] Flake log`
+  card (spec:line, project, log path), so the flake rate stays visible.
+- **A test whose every page runs at 375px whatever the project** (the file
+  has `test.use({ viewport: { width: 375, … } })`, and any context the test
+  opens itself is also 375) gets `{ tag: "@pinned-375" }`. The mobile project
+  skips that tag, because the desktop project already runs it at 375. If any
+  step runs at the project's size (a captain setup page, a
+  `setViewportSize` back to 1280), it is not pinned: leave it untagged.
 - **Evidence over opinion.** Every failure item points at a file:line, a test
   name or a screenshot.
```

## sidestep-architect

P8 (list what the issue breaks on purpose). Live file md5 `fe8bd078d161`.

```diff
--- a/sidestep-architect/SKILL.md
+++ b/sidestep-architect/SKILL.md
@@ -48,9 +48,38 @@
    - say when it's done in the two-layer format below (no long criteria list)
    - name the files it will likely touch
    - say `Blocked by:` other issue ids when order matters
+   - list what it **breaks on purpose** (below)
    Use a prefix per initiative (e.g. `F-` for 0001 FAQ). Check that the ids
    aren't already taken: `ls backlog | cut -d- -f1-2 | sort -u`.
 
+### Breaks on purpose (P8, JCC 2026-10-21)
+
+When an issue changes a rule older tests rely on (IMG-04: "pictures only
+from the preview"; IMG-05: "no original URL before Download"), find every
+spec and fixture that encodes the old rule **before** the build, so SDET
+updates them on the acceptance-test branch instead of the dev's full run
+finding them one failure at a time (IMG-04: 33 failures, 23 min of reruns,
+one changes-requested round).
+
+1. Name the old behaviour as something you can grep: a function, a field, a
+   URL shape, a locator, a seed option (e.g. `attachBigPng(…, false)`,
+   `href` of the original, `/add item/i`).
+2. `grep -rn <it> e2e/ convex/_e2e.ts lib/*.test.ts convex/*.test.ts`.
+3. Add to the issue's `## Notes`:
+
+   ```markdown
+   ### Breaks on purpose
+   | File:line | Encodes the old rule | Update to |
+   |---|---|---|
+   | e2e/support/convex.ts:250 `attachBigPng` | attaches a main with no preview | seed a preview by default |
+   ```
+
+   Write `Breaks on purpose: none (grepped <terms>)` when the list is empty,
+   so the reviewer can tell "checked" from "forgot".
+4. The list is for updating tests to the new rule, never for deleting or
+   loosening them. If a test can't be updated without losing what it checks,
+   say so in `needs_decision`.
+
 ### Issue "done" format (JCC, 2026-10-02): light while UX is moving
 
 Replace `## Acceptance Criteria` with these two sections. SDET writes exactly
```
