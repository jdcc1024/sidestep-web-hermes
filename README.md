# Sidestep Website

Full-stack web app for [Sidestep](https://sidestep.design) — a Greater Vancouver custom sublimated jersey business. Replaces the existing brochure site with a marketing site, customer portal (designs, orders, jersey runs), and admin dashboard.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Convex · Clerk · Resend

See `docs/prd/sidestep-website-phase1.md` for the full Phase 1 PRD.

---

## Local Development

### Prerequisites
- Node.js 20+ (tested on 22)
- npm 10+
- Accounts on [Convex](https://dashboard.convex.dev), [Clerk](https://dashboard.clerk.com), and [Resend](https://resend.com) (free tiers are fine for Phase 1)

### First-time setup

```powershell
# 1. Install dependencies
npm install

# 2. Create your local env file from the template
copy .env.local.example .env.local
# (then fill in real values — see comments inside .env.local.example)

# 3. Initialize Convex (one-time, interactive — logs you in via browser)
npx convex dev
# This writes CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL into .env.local automatically.
# Leave it running in this terminal — it watches convex/ for changes.

# 4. In a second terminal, start the Next.js dev server
npm run dev
# → http://localhost:3000
```

### Daily development
```powershell
npx convex dev   # terminal 1 — Convex watcher
npm run dev      # terminal 2 — Next.js
```

### Quality checks
```powershell
npm run verify      # typecheck + lint + tests; writes .verify-receipt.json on pass
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run build       # production build (also typechecks)
```

### Environment variables
All required keys are documented in `.env.local.example`. Never commit `.env.local`. Clerk's `CLERK_SECRET_KEY` and `RESEND_API_KEY` are server-side only; only the `NEXT_PUBLIC_*` keys are exposed to the browser.

`CLERK_SECRET_KEY` must **also** be set on the Convex deployment itself — Convex functions don't read `.env.local`. `users.hydrateProfileFromClerk` uses it to fetch a signed-in user's real name and email, which the Convex session token doesn't carry (see `lib/clerkProfile.ts`). Without it, every `users` row stays blank and admin lists show "Unnamed captain":

```bash
npx convex env set CLERK_SECRET_KEY sk_test_...          # dev
npx convex env set --prod CLERK_SECRET_KEY sk_live_...   # production

# One-off repair of rows that were already saved blank:
npx convex run users:backfillProfilesFromClerk '{}'      # add --prod for production
```

### Project structure
```
sidestep-website/
├── app/                    Next.js App Router routes
├── components/             React components (ui/ = shadcn primitives)
├── convex/                 Convex schema + functions
├── lib/                    Shared business logic
├── public/                 Static assets
├── backlog/                Vertical-slice issue specs
├── docs/                   PRDs, architecture records, review artifacts
├── scripts/                verify.mjs (quality gate), snap.mjs (screenshots)
└── .claude/skills/         AI skills (/grill-me, /create-issues, /review, ...)
```

---

## Workflow

- **Hermes**, an orchestrating agent, owns planning and task state. Tasks, status,
  dependencies and open questions for the human live on its kanban board, outside
  this repo.
- **Claude Code** implements one task at a time from a spec (usually a
  `backlog/*.md` file), test-first. See `CLAUDE.md` for its instructions.
- **`npm run verify`** gates every commit: typecheck, lint and tests must pass.

The steps below are the planning and review skills used along the way.

### 1. Start with the Grill
Open your AI coding tool (Claude Code, Cursor, etc.) and invoke:
```
/grill-me
```
Describe your project idea. Answer the AI's questions honestly. This prevents the #1 failure mode: building the wrong thing.

### 3. Create your PRD
After grilling, invoke:
```
/create-prd
```
This generates a structured Product Requirements Document in `docs/prd/`.

### 4. Break into issues
With your PRD finalized, invoke:
```
/create-issues
```
This creates vertical-slice backlog items in `backlog/` — each one a small, testable, end-to-end feature.

### 5. Implement with TDD
Each issue handed to Claude Code is implemented test-first:
- Write a failing test
- Implement until it passes
- Refactor
- `npm run verify`, then commit

### 6. Review
After implementation, invoke:
```
/review
```
Fresh-context code review before merging.

---

## The Workflow (Overview)

This template implements a 4-phase development cycle:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   PLAN (Human)  →  STRUCTURE (Human+AI)  →  BUILD (AI) │
│        ↑                                        │       │
│        └────────────  REVIEW (Human)  ←─────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| Phase | Mode | What Happens |
|-------|------|--------------|
| **Plan** | Human-in-the-loop | Grill requirements, write PRD, make decisions |
| **Structure** | Human + AI | Break PRD into vertical slices, create backlog |
| **Build** | AI autonomous (AFK) | TDD implementation of each issue |
| **Review** | Human-in-the-loop | Code review, QA, taste-check, create follow-up issues |

---

## Skills Reference

### /grill-me
**When:** Starting a new project or feature with vague requirements.
**What it does:** Asks 20-80 tough questions to surface gaps, edge cases, and assumptions. Produces a structured summary you can feed into `/create-prd`.
**Output:** Grilling summary with problem statement, scope, decisions, and open questions.

### /create-prd
**When:** After grilling, or when formalizing any set of requirements.
**What it does:** Generates a structured PRD covering: problem, solution, users, stories, scope, tech decisions, constraints, and testing strategy.
**Output:** Markdown PRD file saved to `docs/prd/`.

### /create-issues
**When:** After PRD is finalized and approved.
**What it does:** Decomposes the PRD into vertical-slice backlog issues organized by phase. Each issue is small (smart zone), independent (parallelizable), and end-to-end (touches all layers).
**Output:** Individual issue files in `backlog/` plus a `PLAN.md` overview.

### /review
**When:** After implementing an issue, before merging.
**What it does:** Fresh-context code review covering correctness, architecture, and craft quality. Categorizes findings as critical/improvement/nitpick.
**Output:** Review report with verdict (approve/request changes/discuss).

### /improve-architecture
**When:** Periodically, or when AI is struggling with a particular area.
**What it does:** Analyzes codebase structure to find "shallow modules" that should be consolidated into "deep modules" for better testability and AI effectiveness.
**Output:** Improvement report with prioritized candidates and recommended restructures.

---

## Core Concepts (Cheat Sheet)

### Smart Zone vs. Dumb Zone
Keep tasks small. Fresh context = high quality. Bloated context = errors. Clear context between tasks rather than letting it accumulate.

### Vertical Slices (Tracer Bullets)
Build features end-to-end (DB → API → UI) rather than layer-by-layer. Each slice gives immediate feedback and is independently shippable.

### TDD Is the Feedback Loop
Write the test first. It defines "done" for the AI. Without tests, AI flies blind. Red → Green → Refactor.

### Deep Modules > Shallow Modules
Simple public interfaces hiding rich internals. Easy to test, easy for AI to work with. Avoid many tiny files with complex dependencies.

### Human-in-the-Loop vs. AFK
Planning and review = always human. Implementation of well-defined tasks = delegate to AI. Know when you're needed.

### Parallelization
Tasks within a phase are independent. The orchestrator can run several AI sessions on different issues at once without conflicts.

---

## How to Adapt This Template

### For a web app
Add your framework setup (Next.js, SvelteKit, etc.) to `src/`. The workflow stays the same — just fill in the tech stack during the PRD phase.

### For a CLI tool
Same workflow. Your "UI layer" in vertical slices becomes the CLI interface layer instead of browser UI.

### For a library/package
Vertical slices become "one public API method working end-to-end" rather than "one user-facing feature."

### For a team
Each team member can work on different backlog issues in parallel. The PRD and PLAN.md serve as the shared coordination document. Use PRs for code review instead of the /review skill.

---

## Setup for Claude Code

The skills live in `.claude/skills/`, where Claude Code picks them up automatically.

The `CLAUDE.md` file in the project root is automatically picked up by Claude Code as context.

---

## Setup for Cursor / Other AI Editors

For Cursor, add the CLAUDE.md content to your `.cursorrules` file. For other editors, add it to whatever system prompt or context file your AI tool reads from.

The skills can be referenced by pasting their content when you want to invoke them, or configuring them as custom commands in your editor's AI integration.

---

## Methodology Source

This template is built on learnings from:
- **Matt Pocock** — "Full Walkthrough: Workflow for AI Coding" (2025)
- **Frederick P. Brooks** — "The Mythical Man-Month" (design concepts)
- **John Ousterhout** — "A Philosophy of Software Design" (deep modules)
- **Andrew Hunt & David Thomas** — "The Pragmatic Programmer" (tracer bullets)
- **Martin Fowler** — Refactoring principles (small tasks)

For the full methodology breakdown with detailed explanations of each concept, see `docs/workflow-modules.md`.

---

## License

This template is free to use for any project. The methodology is adapted from publicly taught workshop content.
