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
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
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
├── public/                 Static assets
├── convex/                 Convex schema + functions (created in issue 1-02)
├── backlog/                Vertical-slice issue files
├── docs/prd/               Product Requirements Documents
├── scripts/                DAG dashboard CLI tools
├── dag.json                Live DAG state (agents write here)
└── dag-viewer.html         Open in browser to watch progress
```

---

## AI Workflow

This repo uses a structured AI-assisted development workflow. See `CLAUDE.md` for the full system prompt and `dag-viewer.html` (served via `node scripts/serve-dag.js`) for the live task DAG.

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
Pick the first unblocked issue and implement using test-driven development:
- Write a failing test
- Implement until it passes
- Refactor
- Commit and move to next issue

### 6. Review
After implementation, invoke:
```
/review
```
Fresh-context code review before merging.

---

## DAG Viewer (Real-Time Pipeline Dashboard)

This template includes a **live DAG visualization system** so you can watch agents work in real-time. As agents pick up tasks, complete them, or discover new work, the DAG updates live on a local webpage.

### Start the Dashboard
```bash
node scripts/serve-dag.js
# → Opens at http://localhost:3100
```

### What You'll See
- **Task nodes** colored by status (green = done, amber = in-progress, grey = pending, red = blocked)
- **SVG arrows** between dependent nodes showing the full dependency graph (color-coded: green = satisfied, amber = in-progress upstream, red = blocking)
- **Click any node** to open a detail panel with: description, acceptance criteria, dependency links, PRD reference, and timeline
- **Active agents** panel showing who's working on what
- **Activity log** with timestamped events
- **Auto-refresh** every 2 seconds — no manual reload needed

### How It Works
```
┌──────────────┐       writes to        ┌──────────┐       serves        ┌─────────────┐
│  AI Agents   │  ───────────────────→  │ dag.json │  ←─────────────── │ dag-viewer  │
│  (Claude)    │   via dag-update.js    │  (state) │    polls every 2s  │  (browser)  │
└──────────────┘                        └──────────┘                    └─────────────┘
```

1. **`dag.json`** — Single source of truth. JSON file in project root tracking all nodes, edges, agents, and history.
2. **`scripts/dag-update.js`** — CLI tool agents call to update state (start task, complete task, add nodes, etc.)
3. **`dag-viewer.html`** — Browser dashboard that polls `dag.json` and renders the graph.
4. **`scripts/serve-dag.js`** — Tiny local server so the browser can read the JSON file.

### Manual DAG Commands
You can also manually update the DAG from terminal:
```bash
# Check current status
node scripts/dag-update.js status

# Add a new task (basic)
node scripts/dag-update.js add-node 2-04 "Email Notifications" phase-2 feature

# Add a task with full metadata (shown in detail panel)
node scripts/dag-update.js add-node 2-04 "Email Notifications" phase-2 feature \
  --desc "Send transactional emails for order confirmations and password resets" \
  --prd "docs/prd/mvp.md#notifications" \
  --criteria "Order confirmation sent on purchase|Password reset email delivered|Unsubscribe link works"

# Add a dependency (arrow drawn from 1-01 → 2-04)
node scripts/dag-update.js add-edge 1-01 2-04

# Manually mark something complete
node scripts/dag-update.js complete 1-02 agent-1
```

### Node Detail Panel
Click any node in the viewer to see:
- **Description** — what this task does end-to-end
- **Acceptance criteria** — checklist of testable requirements
- **Dependencies** — clickable upstream/downstream nodes (navigate between them)
- **Links** — direct links to the issue file (`backlog/*.md`) and PRD section
- **Timeline** — when started, completed, and duration

---

## Template Structure

```
ai-project-template/
├── README.md                    ← You are here
├── CLAUDE.md                    ← AI system prompt (instructions for your AI agent)
├── dag.json                     ← DAG state file (agents write here)
├── dag-viewer.html              ← Open this in browser to watch progress
├── scripts/
│   ├── serve-dag.js             ← Local server for the viewer
│   ├── dag-update.js            ← CLI tool for updating DAG state
│   └── dag-reset.js             ← Initialize fresh DAG for new project
├── claude-skills/               ← Custom AI skills/commands
│   ├── grill-me.md             ← Stress-test requirements
│   ├── create-prd.md           ← Generate PRD from grilling output
│   ├── create-issues.md        ← Break PRD into vertical-slice issues
│   ├── review.md               ← Fresh-context code review
│   └── improve-architecture.md ← Find modules needing restructure
├── docs/
│   ├── workflow-modules.md      ← Full methodology reference (5 modules)
│   ├── prd/                     ← Your PRDs live here
│   └── architecture/            ← Architecture Decision Records
├── backlog/                     ← Issue files for AI agent backlog
└── src/                         ← Your source code (add as needed)
```

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

### Parallelization via DAG
Tasks within a phase are independent. Multiple AI sessions can work simultaneously on different issues without conflicts.

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

To use the skills with Claude Code, copy the skill files to your Claude configuration:

```bash
# Copy skills to Claude Code's expected location
mkdir -p .claude/skills
cp claude-skills/*.md .claude/skills/
```

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
