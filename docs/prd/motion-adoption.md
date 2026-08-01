# PRD: Motion Animation Library Adoption

**Author:** Sidestep / Claude
**Created:** 2026-07-30
**Status:** Draft
**Last Updated:** 2026-07-30

---

## 1. Problem Statement

The site has no animation library. Every animation is a Tailwind CSS transition — 80 usages across 41 files — which works well for hover, focus, and color changes, and should stay exactly as it is. The problem is the class of animation CSS structurally cannot do.

Two costs are already visible:

- **Hand-rolled physics.** The pricing tier spotlight in `components/marketing/PricingSection.tsx` needed ~45 lines of `offsetLeft` measurement, a `ResizeObserver`, an equality guard, and a first-paint fallback to move a highlight between cards, because CSS has no way to express "where is that other element." Its easing is a magic `cubic-bezier(0.34, 1.4, 0.64, 1)` that nobody will confidently tune six months from now. Every future animation of this shape pays the same cost again.
- **Exit animations are impossible.** When React unmounts a node it is gone from the DOM instantly, so `{open && <Panel/>}` can never fade out. Base UI solves this for its own popups via `data-closed`, but every panel, roster row, and conditional section we write ourselves either pops out abruptly or needs a bespoke "stay mounted for 300ms" state machine.

Separately, accessibility currently depends on discipline: each animated class string needs its own `motion-reduce:` variant, and one forgotten instance is a silent regression.

The site works and customers are not blocked. The pain is developer-side maintainability plus a marketing surface — the primary sales surface — that reads as static.

---

## 2. Proposed Solution

Adopt **Motion** (`motion`, imported from `motion/react` — the library formerly published as `framer-motion`) as the project's animation library for React-state-driven motion, and ship a first wave of animation across the **marketing landing page** and the **captain portal**.

The adoption is deliberately bounded. Motion does not replace Tailwind transitions or the `tw-animate-css` + Base UI animations already running in `components/ui/*`. It is added for the three things those cannot do: moving an element between layout positions, animating an element as it unmounts, and orchestrating several elements in sequence.

Sequence of work:

1. **Install and configure** — add `motion`, wrap the root layout in `<MotionConfig reducedMotion="user">`, add a shared `lib/motion.ts` of named spring/duration tokens.
2. **Convert the pricing spotlight** — replace the hand-rolled FLIP in `PricingSection` with `layoutId`. This is the proof case: it deletes existing code rather than adding it, and its tests already assert behavior rather than animation state.
3. **Marketing first wave** — section reveals, staggered card entrances, hero entrance.
4. **Portal first wave** — sliding sidebar indicator, panel enter/exit, roster row add/remove.
5. **Codify the rules** — a short section in `CLAUDE.md` stating when to reach for Motion and when to stay in CSS, so future agent sessions don't drift toward one or the other.

---

## 3. Target Users

| User Type | Description | Primary Need |
|-----------|-------------|--------------|
| Claude (AI agent) | Implements animation on future tasks | One obvious tool per situation, and named motion tokens instead of invented bezier curves |
| Human developer | Tunes feel; reviews UX in batches | Animations expressed as legible parameters (`stiffness`, `damping`) that are safe to adjust |
| Visitor (marketing) | Prospective customer on the landing page | A site that feels considered and alive, reinforcing that we make a premium product |
| Captain (portal) | Runs a real jersey order | Feedback that makes the app feel responsive, not jumpy, during multi-step work |
| Visitor with reduced-motion enabled | Anyone with vestibular sensitivity | Motion respected globally and automatically, not per-class |

---

## 4. User Stories

### Must Have (P0)

**Developer / AI agent**
- As a developer, I want a single installed animation library so that I stop hand-rolling FLIP measurement code for each new moving element.
- As a developer, I want animation parameters named in `lib/motion.ts` (e.g. `SPRING_SNAPPY`, `REVEAL_DURATION`) so that tuning the site's feel means editing one file, not hunting magic numbers across components.
- As an AI agent, I want an explicit CLAUDE.md rule for CSS-vs-Motion so that I don't ship a JS animation for something `transition-colors` already handles.
- As a developer, I want the pricing spotlight rebuilt on `layoutId` so that ~45 lines of measurement code, the `ResizeObserver`, and the first-paint fallback are deleted.

**Accessibility**
- As a visitor with reduced-motion enabled, I want transform and layout animations disabled globally so that no individual component can forget to respect my preference.

**Visitor (marketing)**
- As a visitor, I want landing page sections to reveal as I scroll to them so that the page feels alive rather than a static wall.
- As a visitor, I want the process steps and pricing tiers to appear in sequence rather than all at once so that my eye is guided through them.
- As a visitor, I want the hero to settle in on load so that my first impression is of a polished product.

**Captain (portal)**
- As a captain, I want panels I open and close to animate in and out so that the interface feels continuous instead of flickering.
- As a captain, I want roster rows I add or remove to animate so that I can see what just changed.
- As a captain, I want the sidebar to show which section I'm in with a moving indicator so that navigation feels connected.

### Should Have (P1)
- As a developer, I want the screenshot review flow (`scripts/snap.mjs`) to still produce useful stills so that animation doesn't destroy the batch-review surface.
- As a developer, I want an automated check that reduced-motion actually suppresses movement so that the a11y guarantee is verified, not assumed.

### Nice to Have (P2)
- As a visitor, I want the "your tier" badge to animate its label change rather than snap.
- As a developer, I want the same `layoutId` indicator pattern available for admin navigation later.

---

## 5. Scope

### In Scope

**Setup & infrastructure**
- `motion` (v12.x) added as a dependency
- `<MotionConfig reducedMotion="user">` wired into the root layout, above the existing providers
- `lib/motion.ts` — named transition tokens (springs, durations, reveal offsets) used by every Motion component
- `components/motion/Reveal.tsx` — a client wrapper that fades/rises its children when scrolled into view, taking `children` as a prop so wrapped server components stay server components
- CLAUDE.md section stating the CSS-vs-Motion boundary

**Marketing first wave (`components/marketing/*`, `app/page.tsx`)**
- **MO-1** Pricing tier spotlight converted from hand-rolled measurement to `layoutId` — the proof case
- **MO-2** Section reveal on scroll into view for the six landing sections (Hero, Process, Customize, Pricing, Faq, QuoteCta) via `<Reveal>`
- **MO-3** Staggered entrance for the 3 `ProcessSection` step cards and the 4 `PricingSection` tier cards
- **MO-4** Hero entrance on page load (above the fold — no scroll trigger)

**Portal first wave (`components/portal/*`, `components/layout/PortalShell.tsx`)**
- **PO-1** `PortalShell` sidebar active-link indicator on `layoutId`, driven by the existing `aria-current` active state
- **PO-2** ~~`StartCollecting` deadline panel enter/exit via `AnimatePresence`~~ — **withdrawn (N-06).** That panel is a Base UI `<Dialog>`, not an `open`-gated div, so it already animates in *and* out via `tw-animate-css`; converting it is the exact regression Out of Scope forbids two sections below. N-06 shipped the defect this item was masking instead: nothing suppressed those CSS animations under reduced motion
- **PO-3** `RosterSheet` row add/remove via `AnimatePresence`, with `layout` on siblings so remaining rows close the gap
- **PO-4** `RemovedDesigns` section animating in when it goes from empty to non-empty

**Quality**
- Existing vitest suites stay green; behavioral assertions (`data-active`, `aria-current`, text content) remain the test surface
- Reduced-motion verified by an automated Playwright check, not by inspection
- `scripts/snap.mjs` screenshots captured for both surfaces at 375/768/1280, light and dark

### Out of Scope

- **The 80 existing Tailwind transitions.** Hover, focus, and color transitions stay in CSS. No retrofit.
- **`components/ui/*` primitives.** Dialog, dropdown, popover, select, tooltip, and sheet already animate via `tw-animate-css` and Base UI's `data-open`/`data-closed`. Converting them would be a regression.
- **Mobile menus.** Both `MarketingNav` and `PortalShell` use Base UI `<Sheet>`, already animated by the above.
- **Toasts.** `sonner` brings its own animation.
- **`JerseyCarousel`.** Its slide crossfade and dot indicator are pure CSS transitions that already work well.
- **Admin surface.** Deliberately deferred — lowest external visibility.
- **Scroll-driven storytelling.** No pinned sections, scrubbed timelines, or parallax. This is what GSAP would be for, and we are not adopting GSAP.
- **Route/page transitions.** React's `<ViewTransition>` and Next's `viewTransition` config are still experimental and `unstable_`-prefixed.
- **Bundle size optimization.** No `LazyMotion`/`m` split. See Implementation Decisions.
- Backend, Convex, Clerk, and data-contract changes of any kind.

### Future Considerations
- Admin surface animation reusing the `layoutId` indicator and `AnimatePresence` patterns proven here
- Route transitions once React's `<ViewTransition>` stabilizes — likely replacing, not competing with, part of this
- Richer choreography (drag-to-reorder rosters) if the roster UX warrants it
- Revisiting `LazyMotion` if the landing page ever acquires a performance budget

---

## 6. Implementation Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Library | `motion` (`motion/react`) | Declarative and React-native; `layoutId` and `AnimatePresence` are exactly the two primitives CSS lacks. Peer range is `react: ^18 \|\| ^19`, matching our React 19.2.4 |
| Rejected: GSAP | Not adopted | Its edge is scroll choreography, which is explicitly out of scope. Imperative ref-driven API sits awkwardly beside state-driven React |
| Rejected: AutoAnimate | Not adopted | Fixed vocabulary — cannot express the spotlight or custom springs |
| Rejected: CSS-only | Not sufficient | `@starting-style` closed the *entry* gap, but nothing in CSS animates a React-unmounted node |
| Bundle strategy | Import `motion` directly; no `LazyMotion`/`m` | **Explicit human decision:** at this project's size an extra ~30kb is not worth the API friction. Layout animations require the `domMax` feature set anyway, so the split would save little |
| Reduced motion | `<MotionConfig reducedMotion="user">` at the root, **plus a `prefers-reduced-motion` block in `app/globals.css`** | Disables transform and layout animations globally while preserving opacity/color. Makes a11y structural instead of per-class discipline. N-06 found the `MotionConfig` half only ever covered Motion — the `components/ui/*` primitives this PRD deliberately leaves in CSS were moving unsuppressed, by two mechanisms (tw-animate-css keyframes, and Base UI starting/ending-style transitions on `translate`). The CSS block is the counterpart that makes the "structural, not per-class" claim actually true |
| Motion parameters | Centralized in `lib/motion.ts` | Directly serves the maintainability goal that prompted this PRD — tuning feel means editing one file |
| Server components | `<Reveal>` wrapper takes `children` as a prop | Lets the six landing sections stay server components while gaining scroll reveal. Only `ProcessSection` and `PricingSection`, which need per-child stagger, become client components |
| Reveal replay | `viewport={{ once: true }}` | Re-animating on every scroll-past is distracting on a page users scroll up and down |
| Spotlight structure | `motion.div` in a `relative` wrapper *outside* `<Card>` | `Card` sets `overflow-hidden`, which would clip a ring drawn on an inset child |
| Test surface | Behavior, never animation state | Existing `PricingSection.test.tsx` asserts `data-active`/`aria-current`/text. Those attributes must survive the conversion; jsdom has no layout, so animations are inert there by design |
| Existing CSS transitions | Left untouched | Motion is additive. Rewriting `transition-colors` in JS would be strictly worse |
| Commit strategy | One commit per numbered animation (MO-1…PO-4) | Keeps `/review-batch` chunks small and lets any single animation be reverted without unpicking the adoption |

---

## 7. Technical Constraints

- Must work with **Next 16.2.6 + React 19.2.4**; `motion@12.x` declares `react: ^18.0.0 || ^19.0.0`
- `motion/react` is **client-only** — any component using it directly needs `"use client"`. The `<Reveal>` children-as-props pattern is the mechanism for not spreading that boundary across the landing page
- `AnimatePresence` requires direct children with **stable `key` props**; roster rows must key on entry id, not array index
- Motion corrects border-radius and box-shadow distortion during layout animations **only for values set via `style`**, not className — acceptable here because all spotlight targets are equal-sized, but must be re-checked for any differently-sized shared element
- Must keep `node scripts/verify.mjs` (typecheck + lint + tests) green on every commit; DAG `complete` is gated on its receipt
- The React Compiler is enabled and rejects some manual memoization — animation code must pass `react-hooks` lint rules (this already bit the spotlight's `useCallback`)
- No changes to Convex schema, mutations, queries, Clerk auth, or Resend/svix flows
- `scripts/snap.mjs` must still produce meaningful screenshots — reveal animations must settle to their final state, never leave content invisible in a still capture

---

## 8. Success Metrics

- **Code deleted, not added:** `PricingSection.tsx` no longer contains `ResizeObserver`, `offsetLeft` measurement, the rect equality guard, or the first-paint ring fallback. Net line count for that component goes *down*.
- **No hand-rolled FLIP anywhere:** zero occurrences of `ResizeObserver` in `components/` at the end of the wave.
- **One source of feel:** every Motion component draws its transition from `lib/motion.ts`; no inline bezier or spring literals in components.
- **Reduced motion verified:** an automated Playwright run with `reducedMotion: "reduce"` shows zero positional change for the spotlight, sidebar indicator, section reveals, and the CSS `components/ui/*` enter/exit; the same run with `no-preference` shows movement.
- **Reveals never hide content:** with JS disabled or animations suppressed, all six landing sections are visible and readable.
- **All nine animations shipped:** MO-1 through MO-4 and PO-1, PO-3, PO-4 are implemented, screenshotted, and logged in `docs/review/session-reports.md`. (PO-2 was withdrawn by N-06 — see Portal first wave.)
- **No behavioral regressions:** full suite green; the pricing spotlight still tracks tier boundaries at 9/10, 24/25, 49/50 exactly as it does today.
- **Tuning is one-file:** changing the site's animation feel (e.g. "make everything snappier") is a single edit to `lib/motion.ts`.

---

## 9. Testing Strategy

- **Unit tests (vitest + jsdom):** Assert behavior, never animation. Existing `PricingSection.test.tsx` (11 tests on `data-active`, `aria-current`, caption text, estimate sync) must pass **unmodified** after the `layoutId` conversion — that is the regression gate for MO-1. New tests for `AnimatePresence` surfaces assert that content is present/absent after the state change, not that it faded.
- **Reduced-motion check (Playwright):** A committed script launching two contexts (`reducedMotion: "reduce"` and `"no-preference"`), sampling the animated element's position over time, asserting movement in one and none in the other. This is the automated form of the manual check already used on the spotlight.
- **Visual review (`scripts/snap.mjs`):** Marketing landing and portal surfaces at 375/768/1280, light and dark, into `docs/review/<nodeId>/`. Screenshots must show fully-revealed content — a still frame that catches a mid-reveal opacity is a bug in the reveal config, not a screenshot artifact.
- **Manual QA (human, per `/review-batch`):**
  - Landing page: scroll top to bottom slowly, then fast; scroll back up (reveals must not replay); resize across breakpoints mid-animation
  - Pricing: type quantities across every tier boundary, then hammer the input to confirm interruption is handled gracefully
  - Portal: open/close the collecting panel repeatedly; add and remove roster rows; navigate between sidebar sections
  - OS-level reduced motion enabled: repeat the above and confirm the UI is still fully usable and nothing is stuck invisible
- **Build gate:** `node scripts/verify.mjs` green before each `dag-update complete`.

---

## 10. Open Questions

- [ ] Should `ProcessSection` become a client component to get per-card stagger (MO-3), or accept section-level reveal only and stay a server component? Stagger is the nicer effect; RSC is the cleaner architecture.
- [ ] Does the `layoutId` spotlight clip or distort against `Card`'s `overflow-hidden` in practice? The wrapper-div approach should avoid it — confirmed or disproved by MO-1, the first task.
- [ ] What reveal distance and spring read as "premium" versus "bouncy toy" for this brand? Needs a human taste call on the first screenshots; `lib/motion.ts` makes it a one-file adjustment.
- [ ] Should the sidebar indicator (PO-1) animate when navigation causes a full page transition, or only on client-side route changes where the component persists? Depends on whether `PortalShell` remounts between portal routes.
- [ ] Do any existing portal tests assert on DOM structure that `AnimatePresence`'s wrapper element would break? (PO-2 is withdrawn, so PO-3 is now the first place this is answered.)
