# Ralph Loop — Single Iteration Instructions

You are one iteration of an autonomous build loop. Your job: complete exactly ONE task from the DAG, end-to-end, then exit. A fresh session handles the next task. Do not attempt more than one task.

Read CLAUDE.md first and follow it — TDD, vertical slices, commit conventions, DAG updates. These instructions add loop-specific rules on top.

## Procedure

1. **Pick a task.**
   - `node scripts/dag-update.js status` — pick the highest-priority eligible task: `pending`, all dependencies `completed`, and NOT flagged `needsHuman`. Priority order per CLAUDE.md: critical bugs → infrastructure → features by phase → improvements.
   - Read the task's file in `backlog/` and its referenced PRD section before writing any code.
   - `node scripts/dag-update.js start <nodeId>`

2. **Implement with TDD.** Failing tests first, then code, then refactor. Small focused changes.

3. **Screenshots (any task that touches UI).** `node scripts/snap.mjs <nodeId> <route> [route...]` for every route you touched — it captures 375/768/1280 in light and dark into `docs/review/<nodeId>/`. Look at the screenshots yourself: obvious breakage (overlap, cut-off content, unreadable contrast, missing nav) is YOUR bug to fix now, not the human's to find. Taste questions remain the human's — park those (below).

4. **Session report.** Append to `docs/review/session-reports.md`:
   ```
   ## <date> — <nodeId>: <title>
   - What shipped: 1-3 bullets
   - UX surfaces to eyeball: routes + what to look for (screenshots in docs/review/<nodeId>/)
   - Decisions I made that a human may want to veto: ...
   - Follow-ups filed: node ids or "none"
   ```
   Also update the backlog file's `## Status:` to `done`. Make ALL file edits (code, docs, backlog) BEFORE the next step — any file change after verify invalidates the receipt.

5. **Verify — earns the completion receipt:**
   - `node scripts/verify.mjs` (add `--build` if you touched config, dependencies, routing, or server components)
   - This runs typecheck + lint + tests and writes `.verify-receipt.json` on success. `dag-update.js complete` REFUSES without a receipt matching the current file state. If verify fails: fix and re-run. Never work around it.

6. **Commit and complete.**
   - Commit per CLAUDE.md format, referencing the issue file.
   - `node scripts/dag-update.js complete <nodeId>`
   - Exit. Do NOT pick up another task.

## When you hit product/UX ambiguity — park it, don't guess

If completing the task requires a judgment call the human reserved for themselves (visual design taste, copy/tone, pricing, product scope, "which of these two UX flows"), do NOT guess:

1. Append the question to `backlog/QUESTIONS.md` under **Open** using the template there. Include the options you considered and your recommendation. Attach screenshots of the alternatives via `snap.mjs` if visual.
2. `node scripts/dag-update.js needs-human <nodeId> "<one-line question>"`
3. Leave the tree clean: commit completed self-contained work if verify passes, otherwise `git checkout -- . && git clean -fd`.
4. Exit. Do not start another task.

Technical ambiguity (library choice, refactor shape, test strategy) is YOURS to decide — decide, note it in the session report, move on. Only park questions a human must answer.

## Hard rules

- ONE task per session. Never batch.
- Never edit `dag.json` by hand — only via `scripts/dag-update.js`.
- Never `git push`. Never force-move branches. Never touch `last-human-review`.
- Never use `SKIP_VERIFY` — it is a human-only escape hatch and its use is logged.
- Never modify `scripts/verify.mjs`, `scripts/dag-update.js`, or `scripts/snap.mjs`. Never weaken, skip, or delete a failing test to get a receipt — fix the code, or `fail` the node with the reason.
- If you cannot finish (env broken, dependency missing, task underspecified technically):
  `node scripts/dag-update.js fail <nodeId> "<reason>"`, leave the tree clean, and exit.
- If you discover new work, `add-node`/`add-edge` it per CLAUDE.md instead of expanding scope.
