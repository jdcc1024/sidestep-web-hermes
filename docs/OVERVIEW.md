# Sidestep Website — Developer Overview

A ramp-up doc for a software engineer joining this codebase. Pairs with
`README.md` (setup + workflow) and `docs/prd/sidestep-website-phase1.md`
(what we're building and why). This file explains **how the code is laid
out** and the conventions you'll keep hitting as you read it.

---

## 1. What the product is

Sidestep is a Greater Vancouver custom sublimated jersey business. This
repo replaces the existing brochure site with three things in one app:

1. **Public marketing site** — hero, pricing calculator, intake form.
2. **Customer portal** — team captains create designs, place orders,
   track order status, and run "jersey runs" (a shareable form their
   teammates fill out with name/number/size).
3. **Admin dashboard** — Sidestep staff see all orders, advance internal
   stages, oversee jersey runs, and export data for the supplier.

The product flow at a glance:

```
visitor → intake form → invite link → captain signs up → creates design
       → creates order → captain shares jersey-run link with teammates
       → teammates fill in name/number/size → captain reviews responses
       → admin advances internal stages → customer watches public timeline
```

---

## 2. Tech stack

| Layer        | Tech                                      | Notes                                   |
|--------------|-------------------------------------------|-----------------------------------------|
| Framework    | **Next.js 16** (App Router) + React 19    | Dev server on port **8080**, not 3000.  |
| Language     | TypeScript (strict)                       | `npm run typecheck` = `tsc --noEmit`.   |
| Styling      | Tailwind v4 (PostCSS plugin)              | No `tailwind.config.js`; v4 is CSS-first. |
| Auth         | **Clerk** (`@clerk/nextjs`)               | JWT verified by Convex via `auth.config.ts`. |
| Backend / DB | **Convex** (`convex/`)                    | Reactive queries, server functions, file storage, cron. |
| Email        | **Resend** (`resend`)                     | Used from Convex actions only.          |
| Webhooks     | **Svix** (`svix`)                         | Verifies Clerk webhook signatures.      |
| Tests        | **Vitest**                                | `npm test` (run), `npm run test:watch`. |

Dev loop is **two terminals**: `npx convex dev` (schema watcher + function
deploys) and `npm run dev` (Next.js).

---

## 3. Top-level layout

```
sidestep-website/
├── app/                Next.js App Router (routes + layouts)
├── components/         React components grouped by surface
├── convex/             Backend: schema, queries, mutations, actions, cron
├── lib/                Framework-free domain logic + Vitest tests
├── middleware.ts       Clerk auth middleware + invite-link handler
├── docs/               PRD, this overview, architecture notes
├── backlog/            Vertical-slice issue specs (the AI workflow)
└── scripts/            verify.mjs (quality gate), snap.mjs (screenshots)
```

The split that matters most: **`convex/` is the backend, `app/` and
`components/` are the frontend, and `lib/` is pure logic shared by both
(or testable in isolation).**

---

## 4. Data model (`convex/schema.ts`)

Nine tables. Read `schema.ts` directly — it's short and authoritative.
Field-level mental model:

- **`users`** — One row per Clerk user. `clerkId` is the join key.
  `isAdmin` is mirrored from Clerk `privateMetadata` by the webhook,
  never written from the browser.
- **`designs`** — Owned by a user. Files live in `designAssets`, not on
  the design doc.
- **`designAssets`** — One row per uploaded file, `by_design`. Carries
  `filename` + `contentType` (so a page can tell a PNG from a print
  template), uploader provenance, and an `isMain` flag. URLs are signed
  per query; `lib/designAsset.ts` owns the web-safe predicate, the
  main-image resolver, and the upload/delete permission rules.
- **`orders`** — Owned by a captain (`captainId`). `designIds` links
  one or more designs. `internalStages` is an array of `{name,
  completedAt?}` — see §6 for how the customer-facing stage is derived.
- **`jerseyRuns`** — Belongs to an order. `namesMode` is `"open"` (any
  fan fills name/number) or `"fixed"` (captain pre-defines a roster
  and fans pick from it). `customQuestions` is up to 5 extra fields.
  `deadline` is a Unix-ms timestamp; `status` flips to `"closed"` by
  cron or by an admin.
- **`jerseyRunResponses`** — One per fan submission. Indexed
  `by_respondentEmail` so a logged-in user's "participated in" view
  can be matched without auth on the public form.
- **`intakes`** — Lead capture from the public marketing form. No
  account needed; the intake ID becomes an invite-link token.

Indexes are named `by_*`. Stick to that.

---

## 5. Routing map (`app/`)

The App Router uses three top-level surfaces. Each has its own layout:

| Path                 | Audience       | Layout                | Purpose                          |
|----------------------|----------------|-----------------------|----------------------------------|
| `/`                  | Public         | `MarketingShell`      | Hero, pricing, process, FAQ.     |
| `/intake`            | Public         | `MarketingShell`      | Lead-capture form.               |
| `/sign-in`, `/sign-up` | Public       | `(auth)` route group  | Clerk-hosted UI.                 |
| `/invite?token=…`    | Public         | (middleware-only)     | Sets invite cookie → `/sign-up`. |
| `/run/[id]`          | Public         | (none)                | Jersey-run submission form.      |
| `/portal/*`          | Authenticated  | `PortalShell`         | Customer area.                   |
| `/admin/*`           | Admin only     | `AdminShell`          | Staff area.                      |
| `/api/webhooks/clerk`| Server-to-server | (no layout)          | Clerk user sync + admin flag.    |

Portal subroutes worth knowing:

- `/portal` — dashboard (orders + designs).
- `/portal/designs/new`, `/portal/designs/[id]`.
- `/portal/orders/new`, `/portal/orders/[id]`.
- `/portal/orders/[id]/run` — set up a jersey run for that order.
- `/portal/orders/[id]/run/responses` — captain dashboard for it.

Admin subroutes mirror portal: `/admin/orders`, `/admin/orders/[id]`,
`/admin/designs`, `/admin/jersey-runs`, `/admin/jersey-runs/[id]`.

### `middleware.ts`

Two responsibilities:

1. **Auth gate** — every route is protected by Clerk **except** the
   `isPublicRoute` matcher (marketing, intake, sign-in/up, webhooks,
   `/run/*`).
2. **Invite-link handler** — if someone hits `/invite?token=<intakeId>`,
   the token is stashed in an `sidestep_invite_token` HTTP-only cookie
   and they're redirected to `/sign-up`. The order-creation form later
   reads that cookie to pre-fill from the intake record.

---

## 6. Backend organization (`convex/`)

One file per domain, plus shared infrastructure:

| File                    | What lives there                                              |
|-------------------------|---------------------------------------------------------------|
| `schema.ts`             | All tables and indexes.                                       |
| `auth.config.ts`        | Tells Convex how to verify Clerk JWTs (`CLERK_FRONTEND_API_URL`). |
| `users.ts`              | `syncCurrentUser` (browser), `syncUser` (webhook), `getCurrentUser`. |
| `designs.ts`            | Design CRUD + file upload URL generation.                     |
| `orders.ts`             | Order CRUD, link designs, derive customer-facing stage.       |
| `jerseyRuns.ts`         | Run create/get, response submission, captain dashboard query. |
| `jerseyRunActions.ts`   | Convex *actions* (Node runtime): closure logic + Resend email. |
| `intakes.ts`            | Public intake submission, admin lead listing.                 |
| `admin.ts`              | Admin-only queries that span all customers. `requireAdmin()` gate. |
| `crons.ts`              | Daily 08:00 UTC sweep that calls `closeExpiredRuns`.          |
| `_generated/`           | Convex codegen — do not edit, do not commit conflicts away.   |
| `_schemaSmokeTest.ts`   | Sanity queries that exercise each table on schema change.     |

### Patterns to internalize

- **Queries are reactive.** Anything wrapped in `useQuery` on the client
  re-runs whenever its data changes. There's no "refresh" — that's why
  the dashboards just work in real time.
- **Auth is identity-based.** Inside a query/mutation you call
  `ctx.auth.getUserIdentity()` to get the Clerk subject, then look up
  the user row by `by_clerkId`. There's a `requireCurrentUser` helper
  pattern in several files; copy that, don't reinvent.
- **Admin gating is defense in depth.** `admin.ts` has a `requireAdmin`
  helper that checks `user.isAdmin === true`. Use it on *every* admin
  function. The Next.js route gate is not enough — a hand-rolled client
  with a valid JWT could call mutations directly otherwise.
- **Actions vs mutations.** Mutations are transactional and run in
  Convex's V8 isolate; they can't make HTTP calls. Anything that sends
  email or hits an external API lives in an action
  (`jerseyRunActions.ts` is the only one so far). Actions call mutations
  via `ctx.runMutation(internal.x.y, …)`.
- **`internal*` vs `public`.** `internalMutation`/`internalQuery` can
  only be called server-to-server (e.g. from an action or cron). Public
  `mutation`/`query` are callable from the client. When in doubt,
  prefer internal.

---

## 7. Domain logic (`lib/`)

Everything in `lib/` is **framework-free TypeScript** with a sibling
`*.test.ts` file. The reasoning:

- Vitest can run them in milliseconds, no Convex/Next harness needed.
- They're the unit of TDD for new features — write the test in `lib/`
  first, then wire it into a Convex function or a React component.
- Keeps Convex files thin: validators and DB calls there, logic here.

Current modules (each with tests):

| Module                  | Responsibility                                              |
|-------------------------|-------------------------------------------------------------|
| `pricing.ts`            | Tier table + `calculateEstimate(quantity, hasDesignFee)`.   |
| `orderStages.ts`        | 14 internal → 8 customer-facing stage derivation, timeline builder. |
| `order.ts`              | Order-form validation and shaping.                          |
| `design.ts`             | Design-form validation, file metadata helpers.              |
| `intake.ts`             | Intake-form validation.                                     |
| `jerseyRun.ts`          | Jersey-run setup validation (sizes, custom questions, roster). |
| `jerseyRunResponse.ts`  | Fan-submission validation (open vs fixed mode).             |
| `jerseyRunDashboard.ts` | Aggregation for the captain dashboard (counts, estimate).   |
| `jerseyRunDeadline.ts`  | Deadline-countdown formatting + expired check.              |

The one to read first is `orderStages.ts` — it's the most opinionated
piece of domain logic and explains why the customer never sees an
internal stage name.

---

## 8. Components (`components/`)

Grouped by surface, not by widget type:

- **`layout/`** — `MarketingShell`, `PortalShell`, `AdminShell`,
  `SidebarShell` (the shared sidebar primitive), nav/footer/logo.
- **`marketing/`** — Sections that compose the `/` page.
  `PricingCalculator` is the one stateful client component.
- **`intake/`** — `IntakeForm`.
- **`portal/`** — `OrderForm`, `OrderTimeline`, `DesignForm`,
  `JerseyRunSetup`.
- **`run/`** — `JerseyRunPublicForm` (public, unauthenticated).

Convention: a route file in `app/.../page.tsx` is usually a thin
server component that reads params and renders one component from
`components/<surface>/`. Heavy lifting lives in the component.

---

## 9. Cross-cutting flows worth understanding upfront

These are the four places where multiple files cooperate and reading a
single file in isolation will confuse you:

### a. Clerk → Convex user sync

1. User signs up via Clerk.
2. Clerk POSTs `user.created` to `/api/webhooks/clerk/route.ts`,
   verified with Svix.
3. The route calls `internal.users.syncUser` with `isAdmin` derived
   from Clerk `privateMetadata.isAdmin`.
4. *Also*, on every authenticated page load, `Providers > UserSync` in
   `app/providers.tsx` runs `getCurrentUser`; if it returns `null`, it
   fires `syncCurrentUser` as a fallback (covers the case where the
   webhook hasn't landed yet). This per-page query is the known
   wart that issue **3-07** revisits.

### b. Invite link → pre-filled order

1. Admin sends the lead a URL like
   `https://…/invite?token=<intakeId>`.
2. Middleware sets the `sidestep_invite_token` cookie and redirects to
   `/sign-up`.
3. After sign-up, the captain hits `/portal/orders/new`, which reads
   the cookie and pre-fills team name, sport, quantity from the
   matching intake record.

### c. Internal stages → customer timeline

`lib/orderStages.ts` is the single source of truth.

- Admins check off any of **14 internal stages** (`Inquiry`, `Planned`,
  `Started`, …, `Delivered`) in the admin order detail.
- The portal shows an **8-step customer timeline** derived from those
  via `deriveCustomerStage()`. The mapping is
  `CUSTOMER_STAGE_REQUIREMENTS` and is deliberately many-to-one — e.g.
  the customer never sees "Invoice Paid" or "Sent to supplier".
- `currentInternalStage()` is the admin-only column on the orders list
  — it uses checklist order, not timestamp order, so back-filling an
  earlier stage doesn't pull the column backwards.

### d. Jersey run lifecycle

1. Captain creates a run from `/portal/orders/[id]` —
   `JerseyRunSetup` writes via `convex/jerseyRuns.ts`.
2. Captain copies the public `/run/[id]` link and shares it.
3. Fans submit via `JerseyRunPublicForm` — unauthenticated mutation
   in `convex/jerseyRuns.ts` (the only public-write surface besides
   intakes; both have server-side input caps).
4. Captain watches responses live at `/portal/orders/[id]/run/responses`.
5. Closure happens by one of two paths, both calling the same
   `closeRun` logic in `convex/jerseyRunActions.ts`:
   - **Cron** (`crons.ts`, daily 08:00 UTC) finds expired runs.
   - **Admin button** on `/admin/jersey-runs/[id]`.
   Closing the run sends a Resend email to the captain and
   `info@sidestep.design`.

---

## 10. Local development

```powershell
copy .env.local.example .env.local   # fill in keys
npx convex dev                       # terminal 1
npm run dev                          # terminal 2 → http://localhost:8080
```

Quality gates:

```powershell
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run
npm run build        # production build (also typechecks)
```

Secrets handling: `.env.local` is gitignored. `.env.local.example` is
the single source of truth for required keys. Never paste real keys
into the codebase or into chat.

---

## 11. The AI workflow (CLAUDE.md, backlog/)

This repo is built using a structured AI-assisted workflow — read
`CLAUDE.md` for the full system prompt. The short version:

- **Hermes**, an orchestrating agent, owns planning and task state.
  Status, dependencies and open questions for the human live on its
  kanban board, outside this repo.
- **`backlog/`** has one markdown issue spec per vertical slice.
  Each one is end-to-end (DB → API → UI), small enough to ship in a
  single focused session, and has acceptance criteria. The files carry
  no status — check the board for that.
- **Claude Code** implements one task at a time from its spec, and
  `npm run verify` (typecheck + lint + tests) gates every commit.
- **`docs/prd/sidestep-website-phase1.md`** is the source-of-truth
  spec the backlog was derived from.

You don't have to use the AI workflow to contribute — but if you see
references to "stages", "DAG nodes", or `/grill-me` in commits or
issues, this is where they come from. (The DAG was the repo's earlier
in-tree task tracker; it has been retired in favour of the board.)

---

## 12. Where to start reading

In this order:

1. `docs/prd/sidestep-website-phase1.md` — the spec.
2. `convex/schema.ts` — the data model.
3. `lib/orderStages.ts` — the most opinionated bit of domain logic.
4. `app/providers.tsx` + `middleware.ts` — how auth threads through.
5. A vertical slice end-to-end, e.g. jersey runs:
   `lib/jerseyRun.ts` → `convex/jerseyRuns.ts` →
   `components/portal/JerseyRunSetup.tsx` →
   `app/portal/orders/[id]/run/page.tsx`.

That single slice exercises every layer and convention the codebase
uses elsewhere.
