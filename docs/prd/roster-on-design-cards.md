# PRD: Roster on Design Cards

**Author:** Sidestep / Claude
**Created:** 2026-07-28
**Status:** Approved
**Last Updated:** 2026-07-28

> A UX consolidation slice over the model that [`roster-manager-and-lock.md`](./roster-manager-and-lock.md) built. That PRD delivered `rosterEntries` / `orderEntries` and put the captain's seeding UI (`RosterManager`, R-03) inside Run Setup, where the run config lived. This PRD moves roster management to where the captain actually reads their order — the design cards on `/portal/orders/[id]` — and strips Run Setup back to the run config that genuinely belongs to a collection campaign.
>
> It also **narrows** a piece of the collect flow deliberately: per-run size scoping (`jerseyRuns.sizeOptions`, chosen by the captain in the setup form) becomes a fixed catalog the captain never sees. That's a scope removal, called out in §5.

---

## 1. Problem Statement

Seeding a roster is the captain's first real job on an order, and it's buried behind a page they have no reason to visit yet. The order page lists designs but offers no way to touch the players under them. The only editor lives inside `/portal/orders/[id]/run/setup`, reached through a "Manage run" button in a *Collect* card further down the page — a surface framed around sharing a link, not around building a team list.

Worse, the two pages disagree about what the roster *is*. The order page derives its per-design lines from **order entries** (`lib/jerseyBreakdown.ts`), so a captain-seeded player nobody has ordered for is **invisible** there. Run Setup reads **roster entries** and shows that same player as "not yet filled". A captain who seeds fifteen names, returns to the order page, and sees nothing has no way to tell whether their work saved.

The cost: the one workflow that has to be right *before* the share link goes out — especially in `fixed` names mode, where the seeded roster **is** the fan-facing picker list — is the workflow most likely to be abandoned halfway. And with a typical order carrying the same ~15 people across a home and an away design, the captain does that work twice by hand.

---

## 2. Proposed Solution

Bring the roster to the design.

Each design card on the order page gains a **roster preview** — the design's player slots, filled and unfilled together — and a **Manage roster** button that opens a **Sheet** holding the full editor for that design. Inside the sheet the captain can add, edit, and remove slots inline; **paste a roster straight out of Excel or Google Sheets** with a parse preview; and **copy another design's roster across** in one action, so a home/away kit is seeded once, not twice.

The names-mode choice (open vs fixed) moves up beside the designs, where its consequence is visible — a fixed-mode design with no players warns inline that nobody can order it.

Run Setup sheds what was never run config: sizes, names mode, and the roster. Sizes stop being a captain decision entirely and become a fixed catalog. What's left — the share link, deadline, custom questions, and lock — is genuinely about the collection campaign, and the captain reaches it *after* starting one, not before.

**What a captain can do that they couldn't before:** see and edit the whole roster from the page they already live on, seed fifteen players with one paste, and mirror them onto a second design with one click.

---

## 3. Target Users

| User Type | Description | Primary Need |
|-----------|-------------|--------------|
| Team captain / manager | Buyer running a custom-jersey order, seeding ~15 players across 1–3 designs, mostly before sharing the link | Set up every design's roster in one place, without hunting for the page that owns it |
| Fan / team member | Person ordering via the public form | Unaffected by this slice — except that a fixed-mode design is now far less likely to reach them empty |
| Sidestep admin | Internal staff assisting an order | Same roster, same shape, from the admin surfaces |

---

## 4. User Stories

### Must Have (P0)
- As a **captain**, I want each design card on my order page to show that design's roster — including players nobody has ordered for yet — so that seeded work is visible where I read my order.
- As a **captain**, I want to add, rename, and remove player slots without leaving the order page so that setup isn't a page hunt.
- As a **captain**, I want to **paste a roster from a spreadsheet** so that seeding fifteen players is one action, not fifteen.
- As a **captain**, I want to see what a paste *will* create — including which rows are already on the roster and which didn't parse — before it commits, so that I'm never undoing a bad import.
- As a **captain** with a home and an away design, I want to **copy one design's roster onto another** so that I enter the same fifteen people once.
- As a **captain**, I want the names-mode choice next to my designs so that I can see which designs it affects.
- As a **captain** in fixed mode with an empty design, I want to be told **nobody can order this design** so that I don't share a link that collects nothing.
- As a **captain**, I want to stop being asked which jersey sizes to offer so that I have one fewer decision that isn't mine to make.

### Should Have (P1)
- As a **captain**, I want a slot two different people both claimed to be **flagged as a collision** so that I can fix it before locking.
- As a **captain**, I want to start collecting from the order page with just a deadline so that the run exists the moment I need it.

### Nice to Have (P2)
- As a **captain**, I want to copy a roster onto several designs at once.
- As a **captain**, I want to reorder a design's roster (e.g. by number) rather than take creation order.

---

## 5. Scope

### In Scope
- **Design-card roster preview** on `/portal/orders/[id]`: a capped list of the design's slots — seeded-unfilled shown muted, filled showing their ordered sizes — with an overflow count. Replaces the current order-entry-only `RosterLines` on this page.
- **A unified per-design roster read** joining `rosterEntries` with `orderEntries`, so preview and sheet share one source and unfilled slots stop vanishing.
- **Roster sheet** per design (Sheet, not Dialog): inline add / edit / remove, the existing `filled` / `not yet filled` treatment, and the **collision** flag `rosterEntries.listForRun` already computes but the UI currently drops.
- **Bulk paste**: accepts tab- or comma-separated rows and a single trailing-number column (`Gretzky 99`); detects `Name⇄Number` column order per row. **Preview-and-confirm** — parsed rows listed, duplicates and unparseable rows flagged and excluded from the commit count.
- **Mirror**: pull-direction ("Copy roster from ▾ [design]") from inside the target's sheet, **one source design at a time**. Copies **slots only**. Skips existing `(design, name, number)` matches silently and reports the outcome ("18 copied, 2 already there"). Purely additive — never touches existing slots or their jerseys.
- **Names mode** control relocated to the order page's roster section, **switchable in both directions at any time** (currently write-once at create).
- **Fixed-mode empty-design warning**, inline on the card. Warns, does not block.
- **Sizes stop being captain-configurable.** `jerseyRuns.sizeOptions` stays in the schema and is populated with the full 8-size catalog (`XS, S, M, L, XL, 2XL, 3XL, 4XL`) at create; the setup form's size picker is removed.
- **Run creation moves to the order page** as a "Start collecting" affordance taking only a deadline. `/portal/orders/[id]/run/setup` survives as a **management-only** surface: share link, deadline, custom questions, run summary.
- **Locked runs** open the sheet **read-only**. The state is still reachable without any lock control: a run auto-locks lazily once its deadline passes (`lib/jerseyRun/lock.ts`), so this handling is required, not speculative.

### Out of Scope
- **Captains entering jerseys (size + qty).** The production total stays entirely fan-driven. `orderEntries.create` is already captain-gated server-side; this slice leaves it unused by the portal UI, and deliberately does **not** build `orderEntries.update` / `remove`.
- Mirroring **jerseys** (sizes/quantities) rather than slots.
- Any change to how **fan-created slots** behave: renameable, and not removable while filled (`convex/rosterEntries.ts`). Unchanged.
- Roster editing on **removed designs** — `RemovedDesigns` stays a read-only receipt.
- **Multi-select** mirror targets; roster **sort/reorder**.
- A **third names mode** for no-names orders. Already supported: open mode + empty roster, where the public form treats name and number as optional and confirms before writing a blank line.
- **Lock controls.** No captain-facing lock/unlock affordance is exposed anywhere in this slice, and `R-08 Run Surface Lock Controls` stays parked. Locking is a workflow decision that deserves its own pass once the order page and roster flow settle — building it into a surface this PRD is actively rewriting means building it twice. The `locked` **state** is still honoured everywhere (see In Scope).
- **Data migration** for runs created with a narrow `sizeOptions`. Pre-launch; they keep the sizes they were created with.
- The admin jersey-run and order surfaces, beyond whatever falls out of the above.

### Future Considerations
- **Captain-entered jerseys.** Deferred by explicit decision, not oversight. Revisiting it means answering three things first: what submitter identity a captain-created jersey carries (the fields are required and surface in the by-fan view), building `orderEntries.update` / `remove` so a captain typo is fixable, and deciding what a fan sees in fixed mode on a slot the captain already ordered for.
- Per-design **target counts** ("12 of 15 filled") — the unified read makes this nearly free once it exists.
- Mirroring **onto several designs** at once, if 3+ design orders become common.
- Retiring `jerseyRuns.sizeOptions` entirely if per-run size scoping is never wanted back.
- **Lock controls (R-08)**, taken up after this slice lands. It inherits a settled `/run/setup` and a roster surface that already renders its locked state, so it becomes a controls-and-copy problem rather than a layout one.

---

## 6. Implementation Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Editing surface | **Sheet**, not Dialog | A 15-row roster is tall and narrow; a Sheet becomes a bottom sheet at 375px for free and doesn't fight the card's own content. A Dialog with a multi-column input grid is unusable on mobile. |
| Card vs sheet split | **Preview on the card, editing in the sheet** | The order page's value is reading the whole order at a glance; a full editor inline would drown it. |
| Roster read | **One derivation joining `rosterEntries` + `orderEntries`**, feeding both preview and sheet | The current split (order page reads order entries, Run Setup reads roster entries) is the actual bug. One read means the two views cannot disagree again. |
| Unfilled slots | Shown, **muted**, in both preview and sheet | "I seeded this and it saved" is the feedback that's missing today. |
| Captain jerseys | **Out** — total stays fan-driven | Keeps the slice small and the production total honest: every jersey traces to someone who asked for it. |
| Mirror semantics | **Slots only**, additive, skip on `(design, name, number)` match | Copying sizes would fabricate jerseys nobody ordered. The skip rule matches the existing fan-attach rule, so a copy can't split a future fan order across duplicate slots. |
| Mirror direction | **Pull**, from the target design's sheet | You're already in the sheet for the design that's missing players; it reads as "fill this one in". |
| Paste safety | **Preview-and-confirm**, no undo | Cheaper to build than undo and clearer to the captain: they approve a count, not a mystery. |
| Paste parsing | Per-row `Name⇄Number` detection on which column is numeric; TSV, CSV, and single-column trailing-number all accepted | Sheets and Excel paste as TSV, but captains keep the two columns in either order. At ~15 rows a wrong global guess costs more than per-row detection does to build. |
| Names mode | Moves to the order page; **freely switchable both directions**, no warning | Fan names are already `rosterEntries`, so open→fixed just promotes them to the picker list and fixed→open loosens a constraint. Neither loses data. Requires a new `jerseyRuns` mutation — `namesMode` is write-once today. |
| Fixed + empty design | **Inline warning, not a block** | The captain is usually mid-seeding; blocking would fight the workflow this PRD exists to smooth. |
| Sizes | **Keep the `sizeOptions` field, populate it with all 8**; remove the picker | A ~3-file change instead of ~12. Existing runs, the public form, `checkSize` validation, and `lockSnapshot` all keep working untouched; per-run scoping stays available if it's ever wanted back. The field becomes an implementation detail nobody edits. |
| Run creation | **"Start collecting" on the order page**, deadline only | With sizes and names mode gone, the setup form is one field. Sending a captain to a separate page to fill in one field is the disjointedness this PRD is fixing. |
| `/run/setup` | **Survives, management-only** | Share link, deadline, and custom questions are real run config with nowhere better to live. Only the roster and the two relocated fields leave. |
| Lock controls | **Not exposed**; R-08 stays parked until after this work | Lock is a workflow decision of its own, and the surface it would land on is the one this PRD rewrites. Sequencing it after avoids building it twice. |
| Locked runs | Sheet opens **read-only** | Deadline auto-lock makes the state reachable with no control exposed, so this is required either way. The roster is still what a captain wants to look at after locking; every mutation already rejects server-side via `isLocked`. |

### New backend surface

| Function | Purpose |
|----------|---------|
| `rosterEntries.createMany` | Bulk paste commit |
| `rosterEntries.copyToDesign` | Mirror, with `(design, name, number)` dedupe and an outcome report |
| `jerseyRuns.setNamesMode` | **Does not exist today** — `namesMode` is set once in `jerseyRuns.create` |
| Extended `rosterEntries.listForRun` (or a sibling query) | Carry each slot's ordered sizes so preview and sheet share one read |
| `jerseyRuns.create` | Drop the `sizeOptions` argument; populate from the constant |

---

## 7. Technical Constraints
- **Stack:** Next.js (App Router) + React 19 + Convex + Clerk + shadcn/Base UI. Follow the existing grain.
- **Convex pattern:** pure rules in `lib/`, mutations thin over them, shared auth helpers (`requireOrderOwnership`), mutation smoke tests — as in `rosterEntries` / `orderEntries` today. Paste parsing must be a **pure, DOM-free function in `lib/`** so the preview and the commit can't disagree.
- **Roster editing requires a run.** `rosterEntries` carry `runId` and every mutation resolves the run first. Before a run exists the card shows a hint pointing at "Start collecting" — the sheet is not reachable, and nothing creates a run implicitly.
- **Blast radius of the sizes change:** `jerseyRuns.create`, `JerseyRunSetup`, `lib/jerseyRun/form.ts`, plus their tests. The public form, `checkSize`, and the admin views read `run.sizeOptions` and stay as they are.
- **Mobile first at 375px** — the sheet is the primary editing surface on a phone.
- **CTA/links:** `buttonVariants` on `<Link>` for navigation CTAs (not `<Button render={<Link/>}>`) per CLAUDE.md.
- **Workflow:** TDD-first; screenshots via `scripts/snap.mjs` for every UI slice; update `dag.json` per task.

---

## 8. Success Metrics
- A captain can seed a 15-player roster on a design **without leaving `/portal/orders/[id]`**.
- A seeded, unordered player is **visible on the design card** immediately after saving.
- Pasting 15 rows out of Google Sheets produces 15 correct slots in **one confirm**, with `Name<TAB>Number` and `Number<TAB>Name` both landing right.
- Mirroring a 15-player roster onto a second design creates 15 slots, and re-running it creates **zero** and says so.
- The design card's roster and the sheet's roster show **the same players** — the current preview/editor disagreement is gone.
- A captain is **never asked** to choose jersey sizes, and the public form still offers all 8.
- A fixed-mode design with no players **warns** on the order page before the link is shared.
- A locked run renders the sheet read-only, with no edit affordances to reject.

---

## 9. Testing Strategy
- **Unit tests:** paste parsing — TSV/CSV/single-column, both column orders, numeric-column detection, blank and malformed rows, whitespace, over-length names/numbers against `ROSTER_NAME_MAX_LENGTH` / `ROSTER_NUMBER_MAX_LENGTH`; mirror dedupe on `(design, name, number)` including case/whitespace normalization; the unified roster derivation — unfilled slots present, filled slots carrying summed sizes, totals reconciling with `orderEntries.countsByRun`.
- **Integration tests:** `createMany` and `copyToDesign` reject when the run is locked, when the design isn't on the order, and when the caller doesn't own the order; `setNamesMode` round-trips both directions and the public form respects the new mode; a run created after this change carries all 8 sizes; mirroring onto a design with filled slots leaves those jerseys untouched.
- **Component tests:** sheet opens read-only for a locked run; paste preview flags duplicates and parse failures and excludes them from the commit count; fixed-mode empty-design warning appears and disappears with the first slot.
- **Manual QA:** the sheet at 375px with 15 rows and the paste textarea open; whether the card preview cap reads as "there's more" rather than "that's all"; whether the mirror's outcome message is reassuring or alarming when everything was skipped.

---

## 10. Open Questions

Resolved 2026-07-28 during grilling (now in §6): captain-entered jerseys **out**; mirror copies **slots only**, pull-direction, one target at a time, silent skip; `/run/setup` **survives** management-only; sizes **fixed catalog, field retained**; names mode **relocated and freely switchable**; bulk paste **in**, with preview; Sheet over Dialog; preview on card, editing in sheet; locked runs **read-only**; collisions **surfaced**; no-names orders need **no third mode**.

Still open (neither blocks the schema or the slice breakdown):
- [ ] **Preview cap on the design card** — 5 slots and an overflow count, or scale to available height? Decide against a real 15-player card during implementation.
- [ ] **Admin size display** — `app/admin/jersey-runs/[id]/page.tsx` will now always render the same 8 sizes for every run. Leave it, or drop the field from the admin view as noise?

---

## 11. Recommended Slices

Sketch for `/create-issues`, not a commitment:

1. **Unified roster read + design-card preview** — the derivation and the query behind it, replacing `rosterLinesByDesign` on the order page. Fixes the disagreement before anything is built on top of it.
2. **Roster sheet** — open from the card, inline CRUD, collision flag, read-only when locked. `RosterManager` retires here.
3. **Bulk paste** — pure parser in `lib/`, `createMany`, preview-and-confirm UI.
4. **Mirror** — `copyToDesign` with dedupe, pull-direction control in the sheet.
5. **Run-setup slimming** — fixed size catalog, `setNamesMode` + relocated control, fixed-mode empty warning, "Start collecting" on the order page, `/run/setup` reduced to management. Touches the public form, so it goes last.

`R-08 Run Surface Lock Controls` follows this sequence rather than joining it — see §5.
