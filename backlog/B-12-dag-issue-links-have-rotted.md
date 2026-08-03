# Issue: DAG Issue Links Have Rotted

## Status: pending

## Phase: 3

## Type: improvement

## Description

The DAG viewer's detail panel is the human's review surface: it shows a node's
description, criteria, and a link to its `backlog/` file. **25 of those links
point at files that do not exist**, and 11 completed nodes have issue files
still marked `## Status: pending`.

Two distinct causes:

- **12 renamed.** The node was created with one slug and the file written with
  another — `A-08 → backlog/A-08-extract-qty-by-design-rollup-helper.md` while
  the file on disk is `A-08-extract-qty-by-design-helper.md`. `M-08`, `R-05`,
  `R-06`, `R-07`, `B-02`, `N-10` and others are the same shape. Cheap to repair:
  the file is right there under a different name.
- **13 never written.** `A-01`, `A-02`, `A-03`, `A-04`, `A-05`, `A-07`, `2-15`,
  `B-05`, `B-06`, `M-07`, `N-11`, `P-01`, and `D-09` (now deleted) have a node
  and an `issueFile` path but no file was ever committed. Several of these are
  *completed* work, so the acceptance criteria a reviewer would check against
  exist only in the node's `acceptanceCriteria` array.

Separately, 11 completed nodes left their issue file on `## Status: pending`:
`1-03`, `1-04`, `2-03`, `2-04`, `2-05`, `2-07`, `2-11`, `S-09`, `S-10`, `S-12`,
`S-13`. CLAUDE.md's Context Management Rules say "after completing a task,
update the issue status before moving on", so this is drift from a rule that
already exists rather than a missing rule.

Found in the `/review-batch` pass over `fb7f064`, where A-08's dead link was the
instance that surfaced it.

## Acceptance Criteria

- [ ] Every node's `issueFile` in `dag.json` and `dag-archive.json` resolves to a
      file that exists
- [ ] Nodes whose file was merely renamed point at the real filename
- [ ] Nodes with no file either get one written from the node's own description
      and `acceptanceCriteria`, or have `issueFile` removed rather than left
      pointing at nothing
- [ ] The 11 completed-but-`pending` issue files read `done`
- [ ] A check script (`node scripts/check-dag-links.mjs` or similar) fails when a
      node's `issueFile` is missing, or when a completed node's file is not
      marked done
- [ ] That check runs in `scripts/verify.mjs`, so the rot cannot silently return

## Dependencies

- Blocked by: none

## Notes

- Ordinary repo files — no loop restrictions apply. Adding the check to
  `verify.mjs` **does** mean editing a forbidden file, so either a human wires
  that last step up or the check ships standalone and the wiring is a follow-up.
- Prefer writing the missing files over dropping the links: for completed work
  the node's `acceptanceCriteria` array already holds most of what the file
  would say, and a reviewer reading history a year from now wants prose.
- Do not invent history. A file reconstructed from a node should say so at the
  top — reconstructed from the DAG node on <date>, not written at implementation
  time — so nobody mistakes it for a contemporaneous record.
