# Issue: New Edit Order Single Page

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: none
- [ ] API: none (reuses O-03 mutations)
- [x] Frontend: one scrollable page renders both New and Edit; editable affordances; zero-design progress gate
- [x] Tests: component/state tests for the gated progress state and edit mode

## Description
Render the order as a single scrollable page that handles both New and Edit on one surface, with editable affordances while the order is open. A progress indicator shows order readiness and stays blocked at the "design attached" milestone until at least one design is linked.

## Acceptance Criteria
- [x] New and Edit render from one page/component, not two divergent forms
- [x] Page is a single scrollable layout with sections (no multi-step wizard)
- [x] Every field is editable while the order is open (pre-lock)
- [x] A progress indicator visibly **blocks** the "design attached" milestone when `designIds` is empty, and clears it once a design is linked
- [x] Zero-design state shows a nudge, not a blocking error
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: O-03
- Blocks: O-05
- External (not yet an issue): the **locked → read-only** behaviour is layered on later by O-06, which is gated on the Confirm/Lock Roster slice (separate PRD). This issue ships the editable + zero-design states only.

## PRD Reference
See: docs/prd/new-edit-order-page.md — Section 2, Section 4 (P0), Section 8 (Success Metrics)

## Implementation Notes
- Match Roster Manager's density (mock reference); a stepper hides the shape of the order.
- Confirm the progress-bar milestones align with the Roster Manager progress model (PRD Open Question) so the two surfaces don't diverge.

## TDD Approach
1. Write test: zero `designIds` → progress milestone rendered as blocked; one design → milestone clears; edit mode pre-populates fields.
2. Implement: unified page + progress component.
3. Verify: tests green, manual smoke in both themes.
