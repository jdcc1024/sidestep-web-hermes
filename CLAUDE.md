# CLAUDE.md — AI Coding Workflow System Prompt

## Identity & Approach

You are an AI coding agent following a structured development workflow inspired by Matt Pocock's AI-assisted development methodology. You operate with awareness of your own constraints (smart zone vs dumb zone, lack of persistent memory) and use that awareness to produce better work.

You follow a disciplined process: plan thoroughly with humans, execute autonomously with TDD, and maintain high code quality through layered QA.

---

## Core Principles

### 1. Stay in the Smart Zone

- Keep tasks small and focused — one clear objective per session
- If context is getting heavy, suggest clearing and starting fresh
- Never try to implement an entire feature in one pass — break it down
- Prefer multiple small commits over one large one

### 2. Shared Understanding Before Code

- Never start implementing until you and the human have reached a shared "design concept"
- Ask clarifying questions early — it's cheaper than rebuilding
- Use the /grill-me skill when requirements are vague or ambiguous
- Reference the PRD as the source of truth for what we're building

### 3. Vertical Slices Over Horizontal Layers

- Build end-to-end features (DB → API → UI) rather than layer-by-layer
- Each task should produce something testable and demonstrable

- Think "tracer bullets" — thin paths through the full stack that give immediate feedback

### 4. Test-Driven Development

- Write failing tests FIRST, then implement until they pass
- Tests are your feedback loop — without them you're flying blind
- Run tests after every meaningful change
- If tests don't exist for the area you're modifying, write them first

### 5. Deep Modules, Not Shallow Ones

- Create services with simple public interfaces hiding rich internals
- Prefer fewer files with more functionality over many tiny files with complex dependencies
- Design for testability — every module should be testable in isolation
- Keep module boundaries clean and well-defined

---

## Workflow Phases

### Phase: Planning (Human-in-the-Loop — ALWAYS)

1. Understand the problem (use /grill-me for vague requirements)
2. Create or reference the PRD (use /create-prd)
3. Break PRD into vertical slices (use /create-issues)
4. Human reviews and adjusts the plan
5. Prioritize: critical bugs → infrastructure → features

### Phase: Implementation (AFK — Autonomous)

1. Pick the highest-priority unblocked task
2. Read the task requirements and relevant PRD section
3. Write failing tests that define "done"
4. Implement until tests pass
5. Refactor for clarity
6. Commit with clear message referencing the issue
7. Move to next task

### Phase: Review & QA (Human-in-the-Loop)

1. AI self-review with fresh context
2. Automated test suite passes
3. Human reviews for taste, UX, and business fit
4. Create follow-up issues from review findings

---

## Project Structure Conventions

```
project-root/
├── CLAUDE.md              ← You are here (AI instructions)
├── README.md              ← Human-facing project docs
├── dag.json               ← DAG state file (you MUST update this)
├── dag-viewer.html        ← Human watches this in browser
├── scripts/
│   ├── serve-dag.js       ← Local server for DAG viewer
│   └── dag-update.js      ← CLI tool you call to update DAG state
├── docs/
│   ├── prd/               ← Product Requirements Documents
│   └── architecture/      ← Architecture Decision Records
├── backlog/               ← Markdown issue files for AI agent
├── src/                   ← Source code
├── tests/                 ← Test files
└── claude-skills/         ← Custom AI skills/commands
```

---

## Working with the Backlog

Issues live in `/backlog/` as markdown files. Each file represents one task:

```markdown
# Issue: [Title]

## Status: pending | in-progress | done

## Phase: 1 | 2 | 3

## Type: feature | bug | infrastructure | improvement

## Description
[What needs to be done]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Dependencies
- Blocked by: [issue filename or "none"]

## Notes
[Implementation hints, relevant PRD sections, etc.]
```

### Task Prioritization Order

1. Critical bug fixes
2. Infrastructure / tooling
3. Feature implementation (by phase, then by dependency order)
4. Improvements and refactoring

---

## Coding Standards

### General

- Write clear, readable code over clever code
- Use descriptive names — code is read more than it's written
- Keep functions small and focused (single responsibility)
- Add comments for "why" not "what"

### Architecture

- Services should have simple interfaces hiding complex internals (deep modules)
- Use dependency injection for testability
- Separate business logic from framework/IO concerns
- Each module should be independently testable

### shadcn primitives with `render` prop

`render` is Base UI's composition prop. The primitive (e.g. `<Button>`) outputs the element you pass in `render` instead of its default tag, while still applying its own classes, variants, slots, and event handlers. It's the modern replacement for Radix's `asChild` / Slot pattern.

#### For navigation CTAs ("link styled as a button"), don't use `<Button render={<Link/>}>` — use `buttonVariants` on the Link directly.

`@base-ui/react/button` defaults `nativeButton={true}` and warns in dev when the rendered element isn't a real `<button>` ("A component that acts as a button expected a native `<button>`…"). For a Next.js `<Link>` CTA the right semantics are link-anyway — screen readers should announce "link", not "button". So skip the wrapper entirely:

Do:

```tsx
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

<Link
  href="/portal/orders/new"
  className={cn(buttonVariants({ size: "lg" }), "bg-teal-600 text-white hover:bg-teal-700")}
>
  New order
</Link>
```

Don't (triggers the `nativeButton` warning, and lies about semantics if you silence it):

```tsx
<Button render={<Link href="/portal/orders/new" />}>New order</Button>
```

Don't (invalid HTML: `<button><a/></button>`, hydration error):

```tsx
<Button>
  <Link href="/portal/orders/new">New order</Link>
</Button>
```

#### When you do use `render` (non-anchor targets — e.g. `<SheetTrigger render={<Button>...}/>`, `<Badge render={<span/>}>`)

Label content goes between the **outer primitive's** tags as children. `render` takes a **self-closing wrapper**. The primitive composes its children into the rendered element.

Do:

```tsx
<Badge variant="secondary" render={<a href={url} target="_blank" rel="noreferrer" />}>
  <FileDown aria-hidden />
  File 1
</Badge>
```

Don't:

```tsx
<Badge variant="secondary" render={<a href={url}>File 1</a>} />
```

Why: keeping content as the primitive's children means the primitive's classes, icon slots, and variants apply to that content. Moving it into the `render` element bypasses that composition — visually similar but breaks the slot/variant story.

### Animation: CSS vs Motion

Two tools, one boundary. Getting this wrong costs either a JS animation where a
class would do, or 45 lines of hand-rolled measurement where `layoutId` would do.

**Stay in CSS (Tailwind `transition-*`) for:** hover, focus, active, and color
changes; anything whose start and end states are both expressible as classes on
one element that stays mounted. This is the large majority — ~80 usages across
the codebase, and none of them should be converted.

**Also stay in CSS for `components/ui/*`:** dialog, dropdown, popover, select,
tooltip, and sheet already animate via `tw-animate-css` and Base UI's
`data-open`/`data-closed`. Converting them to Motion is a regression.

**Reach for Motion (`motion/react`) only for the three things CSS structurally
cannot do:**

1. **Moving an element between layout positions** — `layoutId`. CSS has no way
   to express "where is that other element". See `PricingSection`'s tier
   spotlight for the reference implementation.
2. **Animating an element as it unmounts** — `AnimatePresence`. React removes
   the node instantly, so `{open && <Panel/>}` can never fade out in CSS.
3. **Orchestrating several elements in sequence** — stagger.

**Rules when you do use Motion:**

- Every transition comes from `lib/motion.ts`. No inline spring or bezier
  literals in components — tuning the site's feel is a one-file edit.
- `motion/react` is client-only. To animate around a server component, take
  `children` as a prop (the `<Reveal>` pattern) rather than spreading
  `"use client"` up the tree.
- Don't add `motion-reduce:` variants for Motion animations.
  `<MotionConfig reducedMotion="user">` in `app/providers.tsx` already handles
  them globally. Nor for `components/ui/*` enter/exit — the
  `prefers-reduced-motion` block in `app/globals.css` covers those (N-06), both
  the tw-animate-css keyframes and the sheet's transitioned `translate`. Any
  *other* CSS transition that moves something still needs its own
  `motion-reduce:`; hover and color transitions do not.
- `AnimatePresence` children need stable `key`s — entity ids, never array index.
- Test behavior, never animation state. jsdom has no layout, so Motion is inert
  under vitest by design; assert `data-*`, `aria-*`, and text.
- A reveal must never leave content invisible in a still `snap.mjs` capture. If
  a screenshot catches mid-reveal opacity, the reveal config is wrong.
- `node scripts/check-reduced-motion.mjs` is the automated proof that
  reduced-motion suppression works; run it after touching motion config.

### Testing

- Tests live alongside or mirror the source structure
- Name tests descriptively: "should [behavior] when [condition]"
- Test behavior, not implementation details
- Aim for confidence, not coverage percentage

### Git Commits

- One logical change per commit
- Format: `[type]: description` (e.g., `feat: add user registration flow`)
- Types: feat, fix, refactor, test, docs, chore
- Reference issue filename in commit body when applicable

---

## DAG State Management (REQUIRED)

The project uses a `dag.json` file as a real-time state tracker. A human may be watching the DAG viewer dashboard. **You MUST update the DAG whenever you change task state.**

### When starting a task:

```bash
node scripts/dag-update.js start <nodeId> <agentId> "<agentName>"
```

### When completing a task:

```bash
node scripts/dag-update.js complete <nodeId> <agentId>
```

### When a task fails or gets blocked:

```bash
node scripts/dag-update.js fail <nodeId> <agentId> "reason for failure"
```

### When creating new tasks during implementation:

```bash
node scripts/dag-update.js add-node <id> "<title>" <phase> <type> \
  --desc "<short description>" \
  --prd "<docs/prd/filename.md#section>" \
  --criteria "<criterion 1|criterion 2|criterion 3>"
node scripts/dag-update.js add-edge <fromId> <toId>
```

Always include `--desc`, `--prd`, and `--criteria` when adding nodes — the human uses these in the detail panel to understand each task at a glance.

### When a task needs a HUMAN decision (product/UX taste, scope, pricing, copy):

```bash
node scripts/dag-update.js needs-human <nodeId> "<one-line question>"
```

Also append the full question (context, options, your recommendation) to `backlog/QUESTIONS.md` using the template there. The node turns purple in the viewer and is skipped by agents until the human answers and runs `node scripts/dag-update.js answer <nodeId>`. When you pick up a previously-parked task, read its Answered entry in QUESTIONS.md first.

Only park questions a human must answer. Technical choices (library, refactor shape, test strategy) are yours — decide, note it in the session report, move on.

**Rules:**

- Always call `start` BEFORE beginning implementation of a task
- Always call `complete` AFTER all tests pass and code is committed. `complete` is gated: it requires a `.verify-receipt.json` from `node scripts/verify.mjs` (typecheck + lint + tests) that matches the current file state. Any file change after verify invalidates the receipt — re-run verify. `SKIP_VERIFY=1` is a human-only escape hatch; its use is logged and flagged in review.
- If you discover new tasks during implementation, `add-node` them to the DAG
- The human watches this in real-time — keep it accurate

---

## Commands & Skills

Use these skills by invoking them in conversation:


| Skill                   | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `/grill-me`             | Stress-test vague requirements with tough questions    |
| `/create-prd`           | Generate a structured PRD from grilling session output |
| `/create-issues`        | Break a PRD into vertical-slice backlog issues         |
| `/review`               | Fresh-context code review of recent changes            |
| `/review-batch`         | Catch human review up to master, chunk by chunk        |
| `/improve-architecture` | Identify modules that need deeper structure            |


---

## Autonomous Loop (Ralph)

The project can build itself via `node scripts/ralph-loop.mjs`: each iteration spawns a fresh `claude -p` session (fresh context = smart zone) that completes exactly ONE eligible DAG task per `scripts/ralph-prompt.md`, then exits. The loop stops when no eligible tasks remain, on 2 stalled iterations, at `--max-iterations`, or when a `STOP` file exists in the repo root.

Division of labor:

- **The loop builds.** TDD, screenshots for UI work (`node scripts/snap.mjs <nodeId> <routes...>` → `docs/review/<nodeId>/` at 375/768/1280, light+dark), verify (`node scripts/verify.mjs` — mandatory, gates `complete`), commit, update DAG, append to `docs/review/session-reports.md`.
- **The human decides and critiques.** Product/UX questions land in `backlog/QUESTIONS.md` (see needs-human above); code review happens in batches via `/review-batch` against the `last-human-review` branch, using the screenshots and session reports as the UX review surface. Never push or advance `last-human-review` autonomously.

### Screenshotting authenticated routes (`/portal`, `/admin`)

**Refresh the session first, every time:** `node scripts/snap.mjs --login`. The
Clerk `__session` JWT saved in `.auth/state.json` expires within a minute, and
`snap.mjs` only auto-logs-in when that file is **absent** — so a stale-but-
present file gets used as-is and every authed route lands on the Clerk Account
Portal sign-in, or aborts in a redirect loop (`net::ERR_ABORTED`). That was the
whole of B-07's "/portal won't load" symptom; there is no routing bug. With
`SNAP_UID` / `SNAP_PWD` in `.env.local` the login is fully automatic and
headless — it is **not** a human step any more.

**On Windows, invoke `snap.mjs` from PowerShell, not Git Bash.** MSYS path
conversion rewrites a leading-slash route argument (`/portal` →
`C:/Program Files/Git/portal`) and every capture fails with "Cannot navigate to
invalid URL".

**Fixture data for the snap account** (B-07) — `SNAP_UID` owns no real orders,
so captain surfaces have nothing to render. Seed them once per deployment:

```
npx convex run _devSeed:seedPortalFixtures '{"email":"jcc@sidestep.design"}'
```

Idempotent. Gives the account two designs, an order **with** a live run
(roster + entries, so breakdown views have content) and an order **with no
run**, for empty-state captures. Returns the ids to put in snap routes.

**Known screenshot artifact, not a bug:** `PortalShell`'s sidebar is
`position: fixed`, and Playwright's `fullPage` capture paints fixed elements at
viewport height. So on tall pages the sidebar looks cut off, and a stray Clerk
avatar can appear mid-page on mobile. Both have zero-sized boxes in a real
viewport — don't "fix" them.

If you are running as a loop iteration, `scripts/ralph-prompt.md` is your contract — one task, then exit.

---

## Context Management Rules

- If you notice your responses degrading in quality, suggest clearing context
- Always reference written documents (PRD, issues) rather than relying on conversation memory
- When starting a new task, re-read the relevant issue file and PRD section
- After completing a task, update the issue status before moving on
- Keep the CLAUDE.md up to date as the project evolves

---

## Anti-Patterns to Avoid

- **Don't** implement without tests — you lose your feedback loop
- **Don't** build horizontally (all DB, then all API, then all UI)
- **Don't** try to hold the entire project in one context
- **Don't** skip the planning phase — misalignment costs more than questions
- **Don't** blindly convert specs to code without understanding the codebase
- **Don't** leave stale documentation — update or remove it
- **Don't** over-automate QA — manual taste-checking is essential
- **Don't** create shallow modules with many tiny files and complex dependencies

