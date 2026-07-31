# Implementation Plan — Motion Adoption

## Source PRD: docs/prd/motion-adoption.md
## Generated: 2026-07-30
## Total Issues: 8

> Note on phases: this project is past its Foundation/Core phases — all current
> work (M-, B-, R- series) sits in **Phase 3 / Polish**, and so does this plan.
> The Foundation → Core → Enhancement shape is expressed here through the
> dependency edges below rather than through phase numbers.

---

## Foundation (1 issue)
*The tracer bullet. Nothing else starts until this lands.*

| # | Issue | Type | Depends On |
|---|-------|------|------------|
| N-01 | Adopt Motion and Convert the Pricing Spotlight | infrastructure | none |

---

## Marketing Surface (3 issues)

| # | Issue | Type | Depends On |
|---|-------|------|------------|
| N-02 | Reveal Wrapper and Landing Section Reveals | improvement | N-01 |
| N-03 | Hero Entrance on Load | improvement | N-01 |
| N-04 | Staggered Process and Pricing Card Entrances | improvement | N-02 |

---

## Portal Surface (4 issues)

| # | Issue | Type | Depends On |
|---|-------|------|------------|
| N-05 | Portal Sidebar Active Indicator | improvement | N-01 |
| N-06 | Start Collecting Panel Enter and Exit | improvement | N-01 |
| N-07 | Roster Row Add and Remove Animation | improvement | N-06 |
| N-08 | Removed Designs Section Reveal | improvement | N-06 |

---

## Parallelization Notes

- **N-01 blocks everything.** It installs the dependency, mounts `MotionConfig`,
  creates `lib/motion.ts`, and proves `layoutId` end to end. It is deliberately
  the largest issue in the plan.
- After N-01, four issues unblock at once and are independent: **N-02, N-03,
  N-05, N-06** touch entirely separate files (`app/page.tsx` + new wrapper,
  `HeroSection`, `PortalShell`, `StartCollecting`).
- **N-04** waits on N-02 because per-card stagger sits inside the section reveal.
- **N-07 and N-08** wait on N-06, which establishes the `AnimatePresence` shape
  they both copy. They are independent of each other.
- Longest chain: N-01 → N-02 → N-04 (three deep). Nothing else exceeds two.

## Two Primitives, Reused

The plan is deliberately narrow: eight issues, but only two new concepts.

- **`layoutId`** (an element moving between positions) — proven in N-01, reused in N-05.
- **`AnimatePresence`** (an element animating as it unmounts) — proven in N-06, reused in N-07 and N-08.

N-02/N-03/N-04 are ordinary enter animations built on shared tokens. If either
primitive turns out to be awkward in this codebase, it shows up in N-01 or N-06
respectively — before the issues that depend on it.

## Human-in-the-Loop

- **N-02 produces the first real screenshots of the site's animation feel.** The
  PRD's open question about reveal distance and spring character is best answered
  against those stills, not in advance. Expect a follow-up tuning pass on
  `lib/motion.ts` after N-02 — a one-file change by design.
- Two PRD open questions are resolved inside their issues as technical calls, not
  parked: whether `ProcessSection` becomes a client component (N-04) and whether
  `PortalShell` remounts between routes (N-05).
- Portal issues (N-05 through N-08) need authenticated screenshots: run
  `node scripts/snap.mjs --login` first, from PowerShell, per CLAUDE.md.
