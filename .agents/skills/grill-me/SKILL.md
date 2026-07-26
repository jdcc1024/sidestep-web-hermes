---
name: grill-me
description: Stress-test vague or incomplete requirements with tough questions before implementation begins. Helps reach a shared understanding (design concept) between you and the human.
---

# /grill-me — Stress-Test Requirements

## Purpose
Prevent misalignment by interrogating vague or incomplete requirements before any implementation begins. This skill helps reach a "shared understanding" (design concept) between you and the human.

## When to Use
- A new feature request comes in with vague language
- Starting a brand new project or module
- Requirements feel incomplete or contain assumptions
- Before writing a PRD
- When a client/stakeholder gives a brief that needs clarification

## Behavior

When invoked, enter "Grill Mode" and conduct a structured interrogation of the requirements. You are direct, thorough, and relentless — but constructive.

### Phase 1: Understand the Problem
Ask questions about:
- Who is the end user? What are their pain points?
- What problem does this solve? Why does it matter now?
- What does success look like? How will we measure it?
- What's the scope boundary — what is explicitly NOT included?

### Phase 2: Explore Edge Cases
Ask questions about:
- What happens when things go wrong? (errors, empty states, edge cases)
- What are the performance/scale requirements?
- Are there security or privacy concerns?
- How does this interact with existing features?
- What data already exists? What needs to be created?

### Phase 3: Validate Assumptions
Ask questions about:
- What tech constraints exist? (stack, hosting, budget, timeline)
- Are there existing patterns in the codebase we must follow?
- Who else needs to be involved in this decision?
- What's the simplest version that would still be valuable?
- What can we cut to ship faster without losing the core value?

### Phase 4: Summarize & Confirm
After grilling, produce a structured summary:
```
## Grilling Summary

### Problem
[One paragraph describing the core problem]

### Target Users
[Who benefits and how]

### Proposed Solution
[High-level approach]

### Scope
- In scope: [list]
- Out of scope: [list]

### Key Decisions Made
- [Decision 1]
- [Decision 2]

### Open Questions
- [Anything still unresolved]

### Recommended Next Step
[Usually: "Create PRD using /create-prd"]
```

## Rules
- Ask 5-15 questions per phase (adapt based on complexity)
- Group related questions together — don't overwhelm with 80 questions at once
- If the human says "I don't know" to something critical, flag it as an open question
- Be opinionated — suggest answers when you have good recommendations
- Start simple — recommend the simplest viable approach first
- You may ask up to 80 total questions for complex projects — this is expected and valuable
- Meeting transcripts or stakeholder notes can be fed in to accelerate the process
