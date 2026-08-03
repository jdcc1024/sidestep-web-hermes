# Issue: CLAUDE.md Documents The Removed agentId Argument

## Status: pending

## Phase: 3

## Type: improvement

## Description

`5f04377` removed the agent concept from `scripts/dag-update.js` — `start`,
`complete`, `fail` and `needs-human` no longer take an agent id — and updated
`scripts/ralph-prompt.md` and the `needs-human` example in `CLAUDE.md` to match.
Three examples in `CLAUDE.md` were missed (lines ~290, ~296, ~302):

```bash
node scripts/dag-update.js start <nodeId> <agentId> "<agentName>"
node scripts/dag-update.js complete <nodeId> <agentId>
node scripts/dag-update.js fail <nodeId> <agentId> "reason for failure"
```

`start` and `complete` ignore the surplus argument, so following the stale docs
looks like it works. **`fail` does not**: it joins everything after the node id
into the reason, so `fail R-08 agent-1 "env broken"` records the reason as
`agent-1 env broken`. The one command whose whole purpose is to leave a legible
explanation is the one that gets corrupted.

Found in the `/review-batch` pass over `5f04377`. An agent session on
2026-08-03 followed these examples verbatim, which is how it surfaced.

## Acceptance Criteria

- [ ] The three `CLAUDE.md` examples match the current CLI signatures
- [ ] `CLAUDE.md`, `scripts/ralph-prompt.md` and `dag-update.js --help` agree on
      every command's arguments
- [ ] No remaining reference anywhere to `agent-join`, `agent-leave`, or an
      `agentId` argument

## Dependencies

- Blocked by: none

## Notes

- Docs only — no behavior change. Deliberately kept separate from [B-09], which
  fixes the pruning/blocked interaction in the same script and needs a human to
  apply.
- Worth a skim of the rest of the DAG section while in there: `--desc/--prd/
  --criteria` on `add-node` and the `answer` command should be checked against
  the CLI the same way.
