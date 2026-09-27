---
name: review-batch
description: Catch human review up to main, chunk by chunk. Turns a batch of commits on main since the last-human-review branch into issue-sized review sessions where the human judges taste, UX, and business fit — not syntax.
---

# /review-batch — Human Review Catch-Up

## Purpose
Catch the human's review position (the `last-human-review` branch) up to `main` in digestible chunks. Implementation can outpace human review; this skill turns a batch of commits on `main` since `last-human-review` into issue-sized review sessions where the human judges taste, UX, and business fit — not syntax.

## When to Use
- Whenever `last-human-review` is behind `main` (check: `git log --oneline last-human-review..main | wc -l`)
- Before pushing or deploying

## Behavior

### 1. Build the chunk list
- `git log --reverse --oneline last-human-review..main`
- Group commits by issue id found in the message (pattern like `(R-04)`, `(O-09)`, `1-05`). Ungrouped commits (chores, docs) form their own chunk.
- Present the chunk list with one-line summaries. Default batch: the **3 oldest chunks** (oldest first — later work builds on it).

### 2. For each chunk, produce a review digest (not a diff dump)
- **What was asked:** acceptance criteria from the `backlog/` issue file.
- **What shipped:** summary of the diff — files touched, new/changed public interfaces, schema changes.
- **UX surfaces to eyeball:** exact routes (e.g. `/portal/orders/new` at mobile + desktop widths) and what to look for. Point to screenshots in `docs/review/<issueId>/` (375/768/1280, light+dark) so the human can judge without running the app.
- **Decisions the agent made** that the human may want to veto (from commit messages or inferred from the diff).
- **Reviewer's own findings:** apply the three layers from `/review` (correctness, architecture, taste) with fresh eyes; flag anything suspicious with file:line.
- **Trust checks:** flag loudly if the chunk modifies `scripts/verify.mjs` or `scripts/snap.mjs`, or if any test was weakened, skipped, or deleted.

### 3. Collect the human's verdict per chunk
- **Accept** — no action.
- **Accept with follow-ups** — for each finding, write a backlog issue file (type `improvement` or `bug`, same template as `/create-issues`, no status line).
- **Reject/rework** — write a bug/rework backlog issue and mark it critical in its description; do NOT advance the review pointer past this chunk.

### 4. Advance the pointer
After the human confirms the batch is reviewed:
```bash
git branch -f last-human-review <sha-of-last-reviewed-commit>
```
Only advance through contiguously reviewed history. Never advance past a rejected chunk.

### 5. Report
End with: commits remaining unreviewed, and a table of the follow-up issue files written (id, title, file, blocked-by) so the orchestrator can create board tasks for them.

## Rules
- Never advance `last-human-review` without explicit human confirmation.
- Never push.
- Keep each digest short enough to review in ~5 minutes; depth on request.
