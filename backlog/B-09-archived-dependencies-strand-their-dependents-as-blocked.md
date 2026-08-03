# Issue: Archived Dependencies Strand Their Dependents As Blocked

## Status: pending

## Phase: 3

## Type: bug

## Description

`scripts/dag-prune.js` moves completed nodes into `dag-archive.json` but keeps
any edge whose **target** is still active — including edges whose **source** was
just archived. `updateBlockedStatus` in `scripts/dag-update.js` then resolves
each dependency with `data.nodes.find(...)` and treats "not found" as *not
completed*:

```js
const allDepsComplete = incomingEdges.every(edge => {
  const depNode = data.nodes.find(n => n.id === edge.from);
  return depNode && depNode.status === 'completed';   // dag-update.js:108
});
```

So a node whose dependencies were all completed and then pruned is forced to
`blocked` and stays there. The loop only picks `pending` nodes, so that work is
never picked up again — and nothing in the viewer explains why.

Found in the `/review-batch` pass over `5f04377`. Pruning itself is working as
intended and is staying; this is the one interaction to fix.

**Live impact:** `R-08` (Run Surface Lock Controls) is `blocked` even though both
its dependencies (`R-06`, `O-06`) are completed — they are just archived. It
should be `pending`. Every future node inherits this the moment its dependencies
are pruned.

Not affected, and must stay blocked: nodes flagged `needsHuman` (`3-05`, `3-07`,
`A-05`, `D-09`, `B-05`, `B-06`, `P-01`, `N-11`) and nodes whose live
dependencies genuinely are not done (`A-07` waits on `A-05`, `D-08` on `D-09`).
A fix that unblocks those has gone too far.

## Acceptance Criteria

- [ ] A node whose dependencies are all completed-and-archived reads `pending`
- [ ] `R-08` specifically comes back to `pending`
- [ ] A node with a live, unfinished dependency still reads `blocked`
- [ ] A `needsHuman` node still reads `blocked` regardless of its dependencies
- [ ] Running `dag-prune.js` twice in a row changes nothing the second time
- [ ] The DAG viewer shows no edge pointing at a node that isn't in `dag.json`

## Dependencies

- Blocked by: none

## Notes

- **This touches `scripts/dag-update.js`, which `scripts/ralph-prompt.md`
  forbids the loop from modifying.** It is a human task, or one a human
  explicitly authorizes in-session. Do not let a loop iteration pick it up
  silently.
- Two candidate fixes, and the second is the safer one alone:
  1. `dag-prune.js` drops edges whose `from` was archived — the dependency is
     satisfied, so the edge carries no information. Fixes new prunes only; the
     nine dangling edges already in `dag.json` would still need clearing.
  2. `updateBlockedStatus` treats a missing dependency as **satisfied**. A node
     can only be missing because it was archived, and only completed/obsolete
     nodes are ever archived. This heals the existing state on the next
     `dag-update.js` call without touching the file by hand.
  Doing both is fine; doing only (1) leaves today's stranded R-08 stranded.
- Nine dangling edges exist right now: `2-13→3-05`, `1-03→3-07`, `3-06→3-07`,
  `A-03→A-05`, `A-04→A-07`, `D-06→D-08`, `D-07→D-08`, `R-06→R-08`, `O-06→R-08`.
- There is no test harness for `scripts/`. A small fixture-driven node script
  asserting the four status cases above is worth more here than a manual check,
  since the failure mode is silent.
