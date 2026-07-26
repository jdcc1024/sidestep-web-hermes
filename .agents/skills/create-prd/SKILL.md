---
name: create-prd
description: Generate a structured Product Requirements Document from a grilling session, brainstorm, or brief. The PRD defines WHERE we're going, not HOW to get there.
---

# /create-prd — Generate Product Requirements Document

## Purpose
Transform a grilling session, brainstorm, or brief into a structured Product Requirements Document. The PRD is the "destination document" — it defines WHERE we're going, not HOW to get there.

## When to Use
- After completing a /grill-me session
- When starting a new project or major feature
- When a stakeholder provides a brief that needs formalization
- When converting meeting notes into actionable requirements

## Behavior

When invoked, generate a PRD following this structure. Save it to `docs/prd/[feature-name].md`.

### PRD Template

```markdown
# PRD: [Feature/Project Name]

**Author:** [Name]
**Created:** [Date]
**Status:** Draft | In Review | Approved
**Last Updated:** [Date]

---

## 1. Problem Statement

[One clear paragraph describing the problem we're solving. Who has this problem? Why does it matter? What's the cost of not solving it?]

## 2. Proposed Solution

[High-level description of what we're building. Focus on outcomes, not implementation details. What will users be able to do that they couldn't before?]

## 3. Target Users

| User Type | Description | Primary Need |
|-----------|-------------|--------------|
| [Type 1] | [Who they are] | [What they need] |
| [Type 2] | [Who they are] | [What they need] |

## 4. User Stories

### Must Have (P0)
- As a [user], I want to [action] so that [benefit]
- As a [user], I want to [action] so that [benefit]

### Should Have (P1)
- As a [user], I want to [action] so that [benefit]

### Nice to Have (P2)
- As a [user], I want to [action] so that [benefit]

## 5. Scope

### In Scope
- [Feature/capability 1]
- [Feature/capability 2]

### Out of Scope
- [Explicitly excluded item 1]
- [Explicitly excluded item 2]

### Future Considerations
- [Things we might add later but not now]

## 6. Implementation Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| [e.g., Database] | [e.g., PostgreSQL] | [Why this choice] |
| [e.g., Auth] | [e.g., NextAuth] | [Why this choice] |

## 7. Technical Constraints
- [Constraint 1 — e.g., must run on Vercel]
- [Constraint 2 — e.g., budget limit of $X/month]
- [Constraint 3 — e.g., must support mobile browsers]

## 8. Success Metrics
- [Metric 1 — e.g., User can complete signup in under 60 seconds]
- [Metric 2 — e.g., Page load time under 2 seconds]

## 9. Testing Strategy
- **Unit tests:** [What to test at unit level]
- **Integration tests:** [What to test end-to-end]
- **Manual QA:** [What requires human judgment]

## 10. Open Questions
- [ ] [Unresolved question 1]
- [ ] [Unresolved question 2]
```

## Rules
- Keep it concise — a PRD should be 1-3 pages, not a novel
- Focus on WHAT and WHY, not HOW (implementation details go in issues)
- Be specific about scope boundaries — "out of scope" is as important as "in scope"
- Include real acceptance criteria, not vague goals
- If open questions remain, flag them prominently — don't bury uncertainties
- The PRD is a living document — update it as decisions are made
- Reference this PRD in all related backlog issues
- Don't over-optimize the PRD — focus energy on QA and implementation quality instead
