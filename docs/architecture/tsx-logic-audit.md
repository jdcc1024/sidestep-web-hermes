# Audit: business logic inside `.tsx` files

Card t_f1362ecc (from ss-sdet). JCC 2026-10-02: `.tsx` render tests are frozen
(out of `npm test`), so logic that only lives in a component has lost its
coverage. This lists what isn't rendering, ranked by risk, and where it goes.

**Audited at:** `feat/L-06-lock-on-confirm-admin-list-retire-legacy` @ `659ffb8`.
`main` doesn't have the L-01..L-06 stack yet, and most of the order code below
exists only on that branch. File names are the pre-L-07 ones; L-07 renames
`JerseyRunPublicForm` → `PublicOrderForm`, `JerseyRunSetup` →
`OrderFormSettings` and `lib/jerseyRun*` → `lib/orderForm*`.

## Verdict

Two problems matter. Everything else is low risk or already right.

1. **The public order form's line logic is the money path, and it's untested.**
   It decides what a player orders: the fixed-mode size tally, the qty cap,
   the open-vs-fixed submit payload and the blank-jersey confirm. The server
   can't catch a wrong count, because `qty: 3` is valid whether the player
   meant 3 or 2. → **R-09**
2. **Six forms re-implement a lib validator in zod instead of calling it.**
   The lib copy is tested, but the running copy is in the component, so the
   tests cover code no user runs. In one place the copies already differ: the
   intake form caps phone at 40 characters, `validateIntake` doesn't cap it,
   and the **public, unauthenticated** `intakes.submitIntake` doesn't either.
   The captain's design page also shows raw `err.message`
   (`[CONVEX M(…)] [Request ID: …]`) from four components that the L-05
   `userMessage` guard doesn't scan. → **R-10**

## Findings (ranked by risk)

Coverage key: **frozen** = only a frozen `.tsx` test covered it, so there's no
coverage in `npm test` now. **lib twin** = a tested lib function does the same
job, but the component doesn't call it. **none** = no test found.

| # | Where | Logic | Move to | Coverage today | Issue |
|---|---|---|---|---|---|
| 1 | `components/run/JerseyRunPublicForm.tsx:309-336`, `:402-408`, `:760-767` | Fixed-mode tally: tap adds a (slot × size) line or bumps qty, capped at `MAX_QTY`; minus decrements and drops the line at 1; header count = Σ qty | `lib/orderEntry/lines.ts` | frozen (`JerseyRunPublicForm.test.tsx:211, 254`) | R-09 |
| 2 | `JerseyRunPublicForm.tsx:347-364` | Submit payload: fixed sends `itemId` with no name/number; open sends trimmed name/number with blanks omitted; qty parsed | `lib/orderEntry/lines.ts` | frozen (`:95, :122`) | R-09 |
| 3 | `JerseyRunPublicForm.tsx:143-259` | `buildSchema`: design in order, size in run, qty 1..`MAX_QTY`, fixed slot belongs to the line's design, name/number/answer caps, all with its own copies of the messages. `submitOrder` re-checks it all with the `lib/orderEntry` checks, so client and server can drift | `lib/orderEntry/publicForm.ts`, built from the same `check*` functions `submitOrder` uses | frozen (`:83, :344`); server side covered by `convex/submitOrder.test.ts` | R-09 |
| 4 | `JerseyRunPublicForm.tsx:381-389` | Plain-jersey confirm: open mode and any line has neither name nor number | `lib/orderEntry/lines.ts` | frozen (`:157`) | R-09 |
| 5 | `components/intake/IntakeForm.tsx:41-44, 94-158` + `convex/intakes.ts:77` | Intake schema duplicates `validateIntake`, but with extra caps (name/team 200, phone 40) that live only in the component. **Server has no phone cap** on a public mutation | `lib/intake.ts` (`validateIntake` gains the caps, using the form's wording); `submitIntake` enforces phone ≤ 40 | frozen (`IntakeForm.test.tsx:19, 104`); lib twin (`lib/intake.test.ts`) has no caps | R-10 |
| 6 | `components/InlineEditField.tsx:77-80`, `components/design/DesignSpecPicker.tsx:41-44`, `DesignBlockEditor.tsx:124-125`, `DesignAssetPool.tsx:72-73`, `IntakeForm.tsx:233-237` | Error text built from raw `err.message`. The first four render on the captain's `/portal/designs/[id]`, and the intake one on public `/intake` | `userMessage(err, fallback)`; extend `lib/userMessage.guard.test.ts` TREES | none (the guard scans only `app/portal`, `components/{portal,orderList,run}`) | R-10 |
| 7 | `components/portal/JerseyRunSetup.tsx:53-93` | Form settings schema: a line-for-line copy of `validateJerseyRun` (question count, blank label, label length, deadline) | zod adapter calling `validateJerseyRun` | frozen (`JerseyRunSetup.test.tsx:113`); lib twin (`lib/jerseyRun.test.ts:97-122`) | R-10 |
| 8 | `components/portal/StartCollecting.tsx:37-46` | Deadline check (`parseDeadline` + past check) with its own messages | `validateJerseyRun`'s deadline rule, exported as `checkDeadline(value, now)` | frozen (`StartCollecting.test.tsx:92, 109`); lib twin | R-10 |
| 9 | `components/portal/OrderForm.tsx:54-83`, `components/portal/DesignForm.tsx:73-136`, `app/portal/designs/[id]/page.tsx:166-187` | Order, new-design and design-page validation copied from `validateOrder` / `validateDesign` / `lib/design/rules` | zod adapter calling the lib validator; the design page uses `validateDesign`'s field rules | frozen (`OrderForm.test.tsx:69`, `DesignForm.test.tsx:25, 114`); design page: none; lib twins tested | R-10 |
| 10 | `JerseyRunSetup.tsx:553-555` | `toDateInput`: stored end-of-day-UTC ms → `YYYY-MM-DD`. It must round-trip through `parseDeadline`, or every save of Form settings shifts the deadline | `lib/jerseyRun/rules.ts` next to `parseDeadline` | none | R-10 |
| 11 | `components/orderList/OrderList.tsx:139` | "Nobody can order this design": fixed mode and no named item | `lib/orderItem` `isUnorderable(namesMode, items)` | frozen (`app/portal/orders/[id]/page.test.tsx:2624`) | later |
| 12 | `components/orderList/ItemSheet.tsx:179-182` | A legacy size the catalog dropped stays pickable on the item carrying it (mirrors `checkItemSize(…, currentSize)`) | `lib/orderItem` `sizeChoices(currentSize?)` | none found | later |
| 13 | `app/admin/{orders,designs,customers,jersey-runs}/page.tsx` `compareBy` (×4) | Same table comparator, copied four times | `lib/sort.ts` | none | later |
| 14 | `app/portal/page.tsx:256-259`, `app/admin/jersey-runs/[id]/page.tsx:254` | Jersey label (`name #number`) re-built by hand | existing `lib/orderItem` `itemLabel` | none | later |
| 15 | `JerseyRunPublicForm.tsx:94` | Closed gate: `isJerseyRunClosed(run) \|\| listLocked` | fine as is: uses lib, and `submitOrder` is the real gate | server tests | leave |
| 16 | `app/admin/layout.tsx:16` | Admin gate | fine as is: `isAdminFromClerk` is tested in `lib/adminFlag.test.ts`, Convex `requireAdmin` is the real gate, and E2E covers the UI | `.ts` + E2E | leave |
| 17 | `components/layout/UserSync.tsx:67-72` | Reconciler: refresh when the cached `isAdmin` ≠ what Clerk says | fine as is: it's only a trigger, and the action re-reads Clerk. If it broke, a revocation would reach Convex at the next session, not never | frozen (`UserSync.test.tsx`) | leave |
| 18 | `DesignAssetPool.tsx:65`, `PortalShell.tsx:44`, `PasteList.tsx:164-175`, every `formatDate` | Delete visibility (the server enforces it), nav match, count copy, date formatting | leave: rendering or copy, checked by eye | — | leave |

Already right, and the pattern to copy: `OrderForm.tsx:128-146` calls
`orderMilestones` / `pendingDesignRemovals`, `PasteList.tsx:100` calls
`parseRosterPaste`, `ItemSheet.tsx:129-143` calls the `check*` rules. The
component is the wiring and the rule lives in `lib`.

## `lib/useIsAdmin.test.tsx`

This one is moot: `4a156d9` on `main` deleted `lib/useIsAdmin.ts` and its test
together with Copy answer. There's nothing to convert.

The rule for the next hook: a hook test needs no JSX. Put it in a `.ts` file
with `// @vitest-environment jsdom` and `renderHook`, so it runs in `npm test`.
Only tests that render components are `.tsx`, and those stay frozen.

## Options for the zod duplication (R-10)

| | (A) Lib validator is the truth, zod calls it ✅ | (B) Move the zod schemas into `lib/*/schema.ts` |
|---|---|---|
| Copies of each rule | 1 | 2 (the zod schema and `validateX`, which Convex still needs) |
| Server shares it | yes, already | no: Convex would need zod or keep `validateX` |
| Per-field messages | via a tiny adapter (`refineWith(validate)` maps `{field: msg}` to `ctx.addIssue({path:[field]})`) | native |

B only moves the duplicate somewhere else. A deletes it.

**Wording:** wherever the component's message and the lib's message differ,
the lib takes the **component's** wording, which is what customers see today.
So R-10 changes no visible copy, and JCC has no copy decision to make.

## Seen on the way (not in scope)

- `parseDeadline` stores a deadline as **23:59:59.999 UTC**. In Vancouver that
  is 4:59 pm PDT (3:59 pm PST) on the deadline day. "Submissions close
  June 15" shuts the form at about 5 pm, not at midnight. This is a product
  call for JCC (see the card's `needs_decision`), not a `.tsx` problem.
- `convex/designs.ts:40-41` re-declares `TITLE_MAX_LENGTH` and
  `CANVA_LINK_MAX_LENGTH` instead of importing `lib/design/rules`. The values
  match today. R-10 folds in the import as a review check.
