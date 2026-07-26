---
name: improve-architecture
description: Analyze the codebase for shallow modules that should be consolidated into deep modules. Identifies architecture improvements for better AI effectiveness and testability.
---

# /improve-architecture — Identify Modules Needing Deeper Structure

## Purpose
Analyze the current codebase and identify areas where the architecture could be improved — specifically finding "shallow modules" that should be consolidated into "deep modules" for better AI effectiveness and testability.

## When to Use
- During QA phase when noticing code quality issues
- When AI is struggling to implement changes in a particular area
- Before starting a new phase of development
- When the codebase feels hard to navigate or test
- Periodically as a health check (every few phases)

## Behavior

When invoked, analyze the codebase structure and produce an improvement report.

### Analysis Criteria

**Signs of Shallow Modules (Problems):**
- Many small files with extensive imports between them
- Functions/classes that do very little but delegate to many others
- Hard to test without mocking 5+ dependencies
- Changes to one file require changes in 10 others
- Test files are larger and more complex than the code they test
- Circular or deeply nested dependency chains

**Signs of Deep Modules (Goals):**
- Simple public interface (few methods, clear inputs/outputs)
- Rich internal functionality hidden behind that interface
- Testable with minimal mocking
- Changes are localized — modifying internals doesn't ripple outward
- Clear separation of concerns at the boundary level

### Output Format

```markdown
## Architecture Improvement Report

### Codebase Health Score: [1-10]
[Brief explanation of current state]

### Improvement Candidates

#### Priority 1: [Module/Area Name]
- **Current state:** [Description of the problem]
- **Files involved:** [list of files]
- **Why it matters:** [Impact on testability/AI effectiveness]
- **Proposed restructure:** [How to consolidate into a deep module]
- **New interface:** [What the simple public API would look like]
- **Migration effort:** [Low/Medium/High]

#### Priority 2: [Module/Area Name]
[Same structure]

### Testing Gaps
- [Area with no tests that needs them]
- [Area with tests that test implementation instead of behavior]

### Dependency Issues
- [Circular dependencies]
- [Overly coupled modules]

### Recommended Actions
1. [Highest-impact change to make first]
2. [Second priority]
3. [Third priority]

### Backlog Issues to Create
- [ ] [Issue title for each improvement task]
```

## Rules
- Focus on actionable improvements, not theoretical perfection
- Prioritize by impact on testability and AI effectiveness
- Each recommendation should be achievable in a single focused session
- Don't recommend restructuring that breaks existing tests without a migration path
- Consider: "Will this make it easier or harder for AI to work here?"
- Reference Ousterhout's "A Philosophy of Software Design" principles
- Keep the codebase navigable — don't over-abstract
