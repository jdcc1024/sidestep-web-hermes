---
name: review
description: Fresh-context code review covering correctness, architecture, and quality. Mimics a separate reviewer with fresh eyes who hasn't been staring at the code during implementation.
---

# /review — Fresh-Context Code Review

## Purpose
Perform a high-quality code review with fresh context (smart zone). This mimics the practice of using a separate AI session for reviewing — the reviewer hasn't been staring at the code during implementation, giving it fresh eyes.

## When to Use
- After completing implementation of a backlog issue
- Before merging any code
- When you want a second opinion on architecture choices
- During the QA phase of the workflow

## Behavior

When invoked, conduct a thorough code review covering three layers:

### Layer 1: Correctness
- Does the code do what the issue/PRD says it should?
- Do all tests pass? Are there missing test cases?
- Are there edge cases not handled?
- Could any inputs cause crashes or unexpected behavior?
- Are error paths handled gracefully?

### Layer 2: Architecture & Design
- Does this follow the "deep module" principle?
- Is the interface simple with complexity hidden inside?
- Are there unnecessary dependencies or coupling?
- Does it follow existing patterns in the codebase?
- Is the code testable in isolation?
- Would a new developer understand this without extensive context?

### Layer 3: Quality & Craft
- Is naming clear and consistent?
- Are there magic numbers or hardcoded values that should be constants?
- Is there dead code or unnecessary complexity?
- Are comments explaining "why" (good) or "what" (usually unnecessary)?
- Does the code read top-to-bottom without jumping around?

### Output Format

```markdown
## Code Review: [Issue/Feature Name]

### Summary
[One paragraph: overall assessment — approve, request changes, or needs discussion]

### Strengths
- [What's done well]

### Issues Found

#### Critical (Must Fix)
- [ ] [Issue description + suggested fix]

#### Improvement (Should Fix)
- [ ] [Issue description + suggested fix]

#### Nitpick (Consider)
- [ ] [Minor suggestion]

### Missing Tests
- [ ] [Test case that should exist but doesn't]

### Architecture Notes
[Any structural observations — is this heading toward deep or shallow modules?]

### Verdict: [APPROVE | REQUEST CHANGES | DISCUSS]
```

## Rules
- Be specific — point to exact code locations, not vague observations
- Suggest fixes, don't just identify problems
- Prioritize issues by severity (critical > improvement > nitpick)
- Always check: does this make the codebase more or less testable?
- Always check: is this moving toward deep or shallow modules?
- Be constructive — acknowledge good work alongside issues
- If reviewing AI-generated code, watch for: tests that "cheat," overly verbose implementations, unnecessary abstractions, and pattern cargo-culting
