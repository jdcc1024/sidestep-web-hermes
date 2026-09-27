# Issue: Run Setup Slimming — Fixed Sizes, Names Mode Relocation, Start Collecting

## Phase: 3

## Type: improvement

## Vertical Slice
This issue touches:
- [ ] Database: none — `jerseyRuns.sizeOptions` stays in the schema, populated from the constant
- [x] API: `jerseyRuns.create` drops its `sizeOptions` argument; new `jerseyRuns.setNamesMode` mutation (`namesMode` is write-once today)
- [x] Frontend: sizes picker removed; names mode moves to the order page's roster section; fixed-mode empty-design warning; "Start collecting" on the order page; `/run/setup` reduced to management-only
- [x] Tests: create-populates-all-sizes; `setNamesMode` round-trip both directions; public form respects a switched mode; warning appears/disappears

## Description
With the roster moved onto the design cards (M-01…M-04), what's left in Run Setup is a size picker the captain shouldn't be asked about and a names-mode radio whose consequences are only visible next to the designs. This slice removes size choice entirely (a fixed 8-size catalog), relocates names mode to the order page where it can warn about a fixed-mode design with no players, and moves run creation to a "Start collecting" affordance taking only a deadline. `/run/setup` survives as a management-only surface. **Goes last: it is the only M slice that touches the public form.**

## Acceptance Criteria
- [x] `jerseyRuns.create` no longer accepts `sizeOptions` and populates the field with the full `SIZE_OPTIONS` catalog (`XS, S, M, L, XL, 2XL, 3XL, 4XL`)
- [x] The size picker is gone from `JerseyRunSetup`; a captain is never asked to choose sizes anywhere
- [x] The public form still offers all 8 sizes for a newly created run, and `checkSize` validation is unchanged
- [x] Runs created **before** this change keep their narrower `sizeOptions` and still work — no migration (PRD §5)
- [x] New `jerseyRuns.setNamesMode` mutation, gated on order ownership and rejecting a locked run
- [x] The names-mode control lives in the order page's roster section and switches **freely in both directions**, at any time, with no warning or confirmation
- [x] After switching open → fixed, the public form presents the design's slots as the picker list; after fixed → open, fans can type freely — verified end-to-end, not just at the mutation
- [x] A design in **fixed** mode with **zero slots** shows an inline warning on its card ("nobody can order this design") — a warning, **not** a block
- [x] Run creation is reachable from the order page as **"Start collecting"**, taking only a deadline; it is still gated on at least one design being attached
- [x] `/portal/orders/[id]/run/setup` remains reachable and holds share link, deadline, custom questions, and the run summary — **no lock control** (R-08 stays parked, PRD §5)
- [x] No path creates a run implicitly — a captain always chooses a deadline
- [x] All tests pass
- [x] No regressions in existing tests

## Outcome
Creation moved to a **"Start collecting"** dialog on the order page (deadline
only). Because `create` no longer takes custom questions, `/run/setup` needed a
way to set them or the capability would have been deleted with the form — hence
a new `jerseyRuns.updateSettings` (deadline + custom questions, ownership-gated,
locked-run-rejecting), which is what makes "management-only" mean *manageable*
rather than *read-only*. `lib/jerseyRun/form.ts` is down to two fields
(`customQuestions`, `deadline`) and now backs that edit form.

## Dependencies
- Blocked by: M-02
- Blocks: none

## PRD Reference
See: docs/prd/roster-on-design-cards.md — §5 In Scope (sizes, run creation, names mode), §6 (Sizes, Names mode, Run creation, `/run/setup`, Lock controls)

## Implementation Notes
- **Sizes — keep the field, drop the control.** `jerseyRuns.sizeOptions` stays in `convex/schema.ts` and is set from `SIZE_OPTIONS` (`lib/jerseyRun/rules.ts:6`) at create. This keeps the public form, `checkSize`, `lockSnapshot`, and the admin views working untouched — a ~3-file change instead of ~12 (PRD §6). Blast radius: `convex/jerseyRuns.ts` (`create`, ~line 111/130/166), `components/portal/JerseyRunSetup.tsx`, `lib/jerseyRun/form.ts` (`validateJerseyRun`, `toJerseyRunPayload`), plus their tests.
- **`namesMode` is write-once today** — `convex/jerseyRuns.ts` exports `create`, `getByOrder`, `getPublic`, `lock`, `unlock`, `closeRunByAdmin` and nothing that patches it. `setNamesMode` is genuinely new.
- **Why switching is safe in both directions:** fan-typed names are already `rosterEntries` rows, so open → fixed just promotes them into the picker list, and fixed → open only loosens a constraint. Neither loses data — hence no warning (PRD §6).
- **The fixed + empty trap is real:** `JerseyRunPublicForm.tsx:216` requires a chosen `rosterEntryId` in fixed mode, so a fixed design with no slots collects nothing. Hence the warning.
- **A no-names order needs no new mode:** open mode already treats name and number as optional and confirms before writing a blank line (`JerseyRunPublicForm.tsx:375-388`). Don't add a third mode.
- **Lock stays unexposed.** Do not add lock/unlock buttons; `lock`/`unlock` mutations remain callable but unwired in the portal. The locked *state* is still honoured (M-02's read-only sheet) because runs auto-lock lazily on deadline.
- `/run/setup`'s creation form is currently the only place a deadline is chosen. Moving creation to the order page means the setup page must handle "run exists" as its **only** state — the `run === null` branch of `JerseyRunSetup` either moves or goes away.
- Per CLAUDE.md, use `buttonVariants` on `<Link>` for the navigation CTA, not `<Button render={<Link/>}>`.

## TDD Approach
1. Write test: `create` writes all 8 sizes and rejects an unexpected `sizeOptions` argument; a pre-existing run with `["S","M","L"]` still validates submissions against its own list; `setNamesMode` round-trips open↔fixed and rejects a locked run and a non-owner; the public form renders a picker after a switch to fixed and free inputs after a switch to open; a fixed design with no slots renders the warning, which disappears once a slot is added.
2. Implement: strip `sizeOptions` from create + form + validation; add `setNamesMode`; relocate the control; add the warning; move creation to "Start collecting"; reduce `/run/setup` to the management view.
3. Verify: `node scripts/verify.mjs` green; end-to-end pass — create an order, start collecting, seed a roster, switch to fixed, open the public run link and confirm the picker lists the seeded players; `node scripts/snap.mjs M-05 /portal/orders/<id> /portal/orders/<id>/run/setup /run/<runId>`.
