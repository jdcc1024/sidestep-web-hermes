---
name: review-batch
description: Catch human review up to master, chunk by chunk. Turns a wall of ralph-loop commits into issue-sized review sessions where the human judges taste, UX, and business fit — not syntax.
---

# /review-batch — Human Review Catch-Up

## Purpose
Catch the human's review position (the `last-human-review` branch) up to `master` in digestible chunks. The autonomous loop can outpace human review; this skill turns a wall of commits into issue-sized review sessions where the human judges taste, UX, and business fit — not syntax.

## When to Use
- Whenever `last-human-review` is behind `master` (check: `git log --oneline last-human-review..master | wc -l`)
- After a ralph-loop run finishes
- Before pushing or deploying

## Behavior

### 1. Build the chunk list
- `git log --reverse --oneline last-human-review..master`
- Group commits by issue id found in the message (pattern like `(R-04)`, `(O-09)`, `1-05`). Ungrouped commits (chores, docs) form their own chunk.
- Present the chunk list with one-line summaries. Default batch: the **3 oldest chunks** (oldest first — later work builds on it).

### 2. For each chunk, produce a review digest (not a diff dump)
- **What was asked:** acceptance criteria from the `backlog/` issue file.
- **What shipped:** summary of the diff — files touched, new/changed public interfaces, schema changes.
- **UX surfaces to eyeball:** exact routes (e.g. `/portal/orders/new` at mobile + desktop widths) and what to look for. Pull hints from `docs/review/session-reports.md` if present, and point to screenshots in `docs/review/<issueId>/` (375/768/1280, light+dark) so the human can judge without running the app.
- **Decisions the agent made** that the human may want to veto (from session reports or inferred from the diff).
- **Reviewer's own findings:** apply the three layers from `/review` (correctness, architecture, taste) with fresh eyes; flag anything suspicious with file:line.
- **Trust checks:** flag loudly if the chunk modifies `scripts/verify.mjs`, `scripts/dag-update.js`, `scripts/snap.mjs`, or `scripts/ralph-prompt.md`; if any test was weakened, skipped, or deleted; or if the DAG log shows `verify_skipped` for this node.

### 3. Collect the human's verdict per chunk
- **Accept** — no action.
- **Accept with follow-ups** — for each finding, create a backlog issue file and DAG node (`add-node` with `--desc/--prd/--criteria`, plus `add-edge` if ordered), type `improvement` or `bug`. The loop will pick these up.
- **Reject/rework** — create a bug/rework issue at critical priority; do NOT advance the review pointer past this chunk.

### 4. Advance the pointer
After the human confirms the batch is reviewed:
```bash
git branch -f last-human-review <sha-of-last-reviewed-commit>
```
Only advance through contiguously reviewed history. Never advance past a rejected chunk.

### 5. Report
End with: commits remaining unreviewed, follow-up nodes created, and open items in `backlog/QUESTIONS.md` (the human can answer those in the same sitting).

## Rules
- Never advance `last-human-review` without explicit human confirmation.
- Never push.
- Keep each digest short enough to review in ~5 minutes; depth on request.
