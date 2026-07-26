---
name: create-issues
description: Break a PRD into vertical-slice backlog issues. Each issue is small enough to stay in the smart zone and touches all relevant layers of the stack.
---

# /create-issues — Break PRD into Vertical-Slice Backlog Issues

## Purpose
Transform a PRD into a set of independent, parallelizable backlog issues organized as vertical slices. Each issue should be small enough to stay in the "smart zone" and touch all relevant layers of the stack.

## When to Use
- After a PRD is approved/finalized
- When planning a new phase of development
- When a large feature needs decomposition into shippable increments

## Behavior

When invoked, read the referenced PRD and generate backlog issues following the vertical slice methodology.

### Step 1: Identify Layers
Determine which layers this project touches:
- Database / Schema
- Backend / API / Services
- Frontend / UI
- Infrastructure / DevOps
- Testing

### Step 2: Slice Vertically
For each user story in the PRD, create a thin end-to-end slice that passes through ALL relevant layers. Each slice should be independently deployable and testable.

**Good slice:** "User can register an account" (touches: DB schema for users, API endpoint for registration, UI registration form, validation tests)

**Bad slice:** "Create all database tables" (horizontal — no feedback until other layers are built)

### Step 3: Organize into Phases
Group slices into phases based on dependencies:

- **Phase 1:** Foundation slices (auth, basic layout, core data models)
- **Phase 2:** Core feature slices (the main value proposition)
- **Phase 3:** Enhancement slices (polish, secondary features, optimization)

### Step 4: Generate Issue Files
Create one markdown file per issue in `/backlog/`:

Filename format: `[phase]-[number]-[short-name].md`
Example: `1-01-user-registration.md`, `2-03-order-checkout.md`

```markdown
# Issue: [Descriptive Title]

## Status: pending

## Phase: [1|2|3]

## Type: [feature|infrastructure|bug|improvement]

## Vertical Slice
This issue touches:
- [ ] Database: [what changes]
- [ ] API: [what endpoints/services]
- [ ] Frontend: [what UI]
- [ ] Tests: [what test coverage]

## Description
[2-3 sentences describing what this slice delivers end-to-end]

## Acceptance Criteria
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: [other issue filename, or "none"]
- Blocks: [other issue filename, or "none"]

## PRD Reference
See: docs/prd/[prd-filename].md — Section [X]

## Implementation Notes
[Any helpful context: existing patterns to follow, relevant files, gotchas]

## TDD Approach
1. Write test: [describe what the failing test should verify]
2. Implement: [brief implementation direction]
3. Verify: [what "done" looks like]
```

### Step 5: Create Summary
Generate a `backlog/PLAN.md` overview:

```markdown
# Implementation Plan

## Source PRD: [filename]
## Generated: [date]
## Total Issues: [count]

## Phase 1: Foundation ([count] issues)
| # | Issue | Type | Depends On |
|---|-------|------|------------|
| 1-01 | [title] | [type] | none |
| 1-02 | [title] | [type] | 1-01 |

## Phase 2: Core Features ([count] issues)
| # | Issue | Type | Depends On |
|---|-------|------|------------|

## Phase 3: Enhancements ([count] issues)
| # | Issue | Type | Depends On |
|---|-------|------|------------|

## Parallelization Notes
- Phase 1 issues [X, Y, Z] can run in parallel
- Phase 2 issues [A, B] can run in parallel after Phase 1 completes
```

## Step 6: Populate the DAG

After creating all issue files, you MUST update `dag.json` so the DAG viewer reflects the new plan. For each issue created, run:

```bash
node scripts/dag-update.js add-node "<id>" "<title>" "<phase-id>" "<type>" \
  --desc "<2-3 sentence description from the issue>" \
  --prd "<docs/prd/filename.md#relevant-section>" \
  --criteria "<criterion 1|criterion 2|criterion 3>"
```

Then for each dependency between issues:
```bash
node scripts/dag-update.js add-edge "<fromId>" "<toId>"
```

**Important:** Always include `--desc`, `--prd`, and `--criteria` flags. These populate the detail panel that the human sees when clicking a node in the DAG viewer. Without them, the detail panel shows empty fields and the human loses visibility into what each task involves.

This ensures the human can immediately see the full plan in the DAG viewer dashboard, click any node for details, and navigate dependencies.

## Rules
- Each issue must be completable in a single focused AI session (smart zone)
- Prefer more smaller issues over fewer large ones
- Every issue MUST have testable acceptance criteria
- Every issue MUST specify its TDD approach
- Issues within the same phase should be independent when possible (parallelizable)
- Always reference the source PRD section
- Flag any issues that require human-in-the-loop decisions
- Start with the simplest possible first slice — get feedback early
- ALWAYS populate the DAG after creating issues — the human watches this in real-time
