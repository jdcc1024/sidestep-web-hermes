# Issue: Rename jerseyRuns to orderForms in code and data

## Phase: 3

## Type: infrastructure

## Size: L (~50 files, almost all mechanical renames; ~$5)

## Description

Initiative 0004, phase 1. JCC Gate 1 **Q4 = B**: the code uses the customer's
words too. After L-05 every captain screen says **Order form**, so the code
should stop saying `jerseyRuns`. `orderItems` is already neutral, which means
this rename covers only `jerseyRuns` → `orderForms`. Design:
`docs/architecture/0004-order-items.md` ("JCC decisions", Q4).

**This changes no behaviour.** It changes no copy, no URL, no auth rule and no
function semantics. A reviewer should be able to read every hunk as "same
thing, new name". It runs **after L-06** (PM decision P5), because by then the
legacy `rosterEntries` / `orderEntries` tables and `lockSnapshot` are gone, so
there's less to rename and L-01..L-06 stay valid as written.

### Work in three commits. Each one leaves `npm run verify` green.

```
commit 1  widen + copy      schema: jerseyRuns AND orderForms; orderItems.runId AND orderFormId
                             _migrations:renameJerseyRunsToOrderForms (+ test)
          ── run it on dev, record counts ──
commit 2  switch + tighten  convex/** + every call site use orderForms / orderFormId
                             schema: jerseyRuns and orderItems.runId removed
                             migration function deleted (history comment stays)
commit 3  file/lib names    lib/jerseyRun* → lib/orderForm*, components renamed
```

If the run hits its turn cap, stop at a commit boundary. Commits 1+2 alone are
a coherent state, and commit 3 can become its own issue.

### 1. Data: copy, re-point, delete (commit 1)

Convex has no table rename and can't insert a row with a chosen `_id`, so
every form gets a **new id**. The migration rewrites the one reference to it
(`orderItems.runId`) in the same transaction.

- `convex/schema.ts` (widen): add `orderForms`, a **verbatim copy** of the
  `jerseyRuns` definition as it stands after L-06 (same fields, same
  `by_order` / `by_captain` indexes). Keep `jerseyRuns`. On `orderItems`, add
  `orderFormId: v.optional(v.id("orderForms"))` next to `runId`.
- `convex/_migrations.ts`: `renameJerseyRunsToOrderForms`, an
  `internalMutation` with no args. For each `jerseyRuns` row:
  1. insert an `orderForms` row with every field copied (`createdAt` kept),
  2. for every `orderItems` row on `run.orderId` **including removed ones**
     (query the `by_order` index directly, not `loadItems`, which drops
     removed rows; this is the one allowed exception to "only
     `_orderItems.ts` reads `by_order`", and a comment must say so) whose
     `runId` equals the old id: patch `{ orderFormId: newId, runId: undefined }`,
  3. delete the `jerseyRuns` row.
  It returns `{ forms, itemsRepointed }`. It's idempotent: a second run finds
  `jerseyRuns` empty and returns zeros. It runs in one transaction, which is
  fine for dev's fixture volume. It throws if there are more than 500 runs
  rather than paginating (dev only, there's no production).
- Run it on **dev** (`npx convex run _migrations:renameJerseyRunsToOrderForms`)
  right before pushing commit 2. Record its return value and the counts below
  in the handoff.

**Why copy-migrate (A) and not the alternatives:**

| | (A) Copy + re-point ✅ | (B) Wipe dev, reseed | (C) Keep the physical table, rename code only |
|---|---|---|---|
| JCC's hand-made dev orders | kept | lost | kept |
| Rehearses what prod would need | yes | no | n/a |
| Code residue | none | none | `Id<"jerseyRuns">` and the schema key stay, which is the first place a dev looks |
| Cost | 1 mutation + 1 test, deleted in commit 2 | 0 | 0 |

(C) fails Q4 = B's intent. (B) is cheaper, but it throws away whatever JCC has
been clicking through on dev for little saving.

**Known effect (dev only):** form ids change, so an old `/run/<oldId>` link
shows the existing "couldn't find" page. There's no production deployment, so
nothing real is shared. This is also the reason to do the rename **before
launch**: after launch the same migration would break every link captains
have posted in group chats.

Other references checked: no other table holds a `jerseyRuns` id after L-06.
Crons reference function paths, which redeploy with the code. A pending
`closeRunWithNotification` scheduled job would fail after the rename, but
`closeRunByAdmin` schedules it with `runAfter(0)`, so none is pending in
practice.

### 2. Convex + call sites (commit 2)

| Before | After |
|---|---|
| table `jerseyRuns`, `Id<"jerseyRuns">`, `Doc<"jerseyRuns">` | `orderForms`, `Id<"orderForms">`, `Doc<"orderForms">` |
| `convex/jerseyRuns.ts` (+ test) → `api.jerseyRuns.*` | `convex/orderForms.ts` (+ test) → `api.orderForms.*`, same export names |
| `convex/jerseyRunActions.ts` | `convex/orderFormActions.ts` |
| arg / prop / field `jerseyRunId`, and any `runId` typed `Id<"orderForms">` (incl. `orderItems.runId`, `listForOrder().form.runId`) | `orderFormId` |
| `closeRunByAdmin`, `_closeRun`, `_listExpiredOpenRuns`, `closeRunWithNotification`, `closeExpiredRuns` | `closeFormByAdmin`, `_closeForm`, `_listExpiredOpenForms`, `closeFormWithNotification`, `closeExpiredForms` |
| `admin.listJerseyRuns` | `admin.listOrderForms` |
| cron name `"close expired jersey runs"` | `"close expired order forms"` |

- Schema (tighten): delete `jerseyRuns` and `orderItems.runId`. The push
  succeeds because the migration emptied the table and unset the field.
- Delete `renameJerseyRunsToOrderForms` and its test. Leave a dated history
  comment in `_migrations.ts`, the same pattern as L-06's
  `backfillOrderItems`.
- Update `_devSeed.ts`, `_schemaSmokeTest.ts`, and regenerate
  `convex/_generated/*` (tracked).
- Every export of the renamed modules keeps its name unless it's in the table
  above. That includes `getByOrder`, `getPublic`, `create`, `setNamesMode`,
  `updateSettings` and `listMyResponses`. Each function keeps its auth guards
  and validators, with only the identifiers renamed.

### 3. Libs and components (commit 3)

| Before | After |
|---|---|
| `lib/jerseyRun/` (`form`, `rules`, `index`, plus `lock` if L-06 kept it) | `lib/orderForm/` |
| `lib/jerseyRunResponse/` + `lib/jerseyRunResponse.test.ts` | `lib/orderFormResponse/` + `lib/orderFormResponse.test.ts` |
| `lib/jerseyRun.test.ts`, `lib/jerseyRunDashboard.ts` (+ test), `lib/jerseyRunDeadline.ts` (+ test) | `lib/orderForm.test.ts`, `lib/orderFormDashboard.ts`, `lib/orderFormDeadline.ts` |
| `validateJerseyRun`, `toJerseyRunPayload`, `JerseyRunInput/Errors/Payload`, `EMPTY_JERSEY_RUN`, `isJerseyRunClosed`, `JerseyRunForResponse`, `isRunExpired`, `RunStatus` | `validateOrderForm`, `toOrderFormPayload`, `OrderFormInput/Errors/Payload`, `EMPTY_ORDER_FORM`, `isOrderFormClosed`, `OrderFormForResponse`, `isFormExpired`, `FormStatus` |
| `components/portal/JerseyRunSetup.tsx` (+ test) | `components/portal/OrderFormSettings.tsx` (+ test), matching L-05's "Form settings" |
| `components/run/JerseyRunPublicForm.tsx` (+ test) | `components/run/PublicOrderForm.tsx` (+ test) |
| page components `JerseyRunPublicPage`, `AdminJerseyRunsPage`, `AdminJerseyRunDetailPage`, `JerseyRunResponsesPage` (if it survived L-05) | `PublicOrderFormPage`, `AdminOrderFormsPage`, `AdminOrderFormDetailPage`, … |

**Name clash to resolve:** `components/portal/OrderForm.tsx` is the captain's
*New order / Edit order* form ("Tell us about your team"). Rename it
`OrderDetailsForm.tsx` (+ test, and its 2 page imports), so `OrderForm` never
means two things. The public form's inner `function OrderForm` in
`JerseyRunPublicForm.tsx` becomes `PublicOrderFormBody`.

### Out of scope (stays as is)

- **URLs:** `/run/[id]`, `/portal/orders/[id]/run/setup`, `/admin/jersey-runs/**`,
  and the `app/**` folders that make them. Renaming them would change URLs
  (the "no behaviour change" rule). `components/run/` keeps its name because it
  matches the route.
- **Copy:** player-facing text on the public form (rule 10), admin copy and
  the ops email. L-05 owns captain copy. This issue changes **no string a user
  sees**.
- Local variables (`run`, `runs`) and test helpers (`seedRun`,
  `validRunArgs`, `fakeRunId`, …). Rename them where you touch the line
  anyway, but it isn't required.
- `docs/`, `backlog/` and the history comments in `convex/_migrations.ts`.
  Other code comments that name `jerseyRuns` / `jerseyRunResponses` (e.g. in
  `convex/schema.ts`, `lib/jerseyRunResponse/*`) are reworded to the new
  names, because residue grep 1 counts them.
- Server `ConvexError` strings such as `"Jersey run not found."` are copy, not
  identifiers. They stay unless L-05 already changed them.

## Acceptance Criteria

- [ ] **Migration (commit 1)** unit test: fixture of 2 runs on 2 orders. Order 1 has a live item from the form, a **removed** item from the form, and a captain item with no `runId`. Order 2 has one form item. After the run: 2 `orderForms` rows whose fields equal the old runs' fields (apart from `_id` / `_creationTime`), each form item's `orderFormId` points at its own order's new form with `runId` unset (removed item included), the captain item is untouched, and `jerseyRuns` is empty. It returns `{ forms: 2, itemsRepointed: 3 }`. A second run returns `{ forms: 0, itemsRepointed: 0 }` and changes nothing.
- [ ] **Dev data:** the handoff records the migration's return value, plus before/after counts: `jerseyRuns` before = `orderForms` after; items with `runId` before = items with `orderFormId` after; `listForOrder` `itemCount` per seeded order is unchanged.
- [ ] **Residue grep 1, identifiers.** `grep -rnE "jerseyRun|JerseyRun|jersey_run|JERSEY_RUN" app components convex lib scripts --exclude-dir=_generated` returns matches **only** in comment lines of `convex/_migrations.ts` (allow-list). Spaced or hyphenated copy and URLs (`jersey run`, `jersey-runs`) don't match this pattern on purpose: they're out of scope.
- [ ] **Residue grep 2, id fields.** `grep -rnw "runId" app components convex lib --exclude-dir=_generated --exclude='*.test.ts' --exclude='*.test.tsx'` is empty (allow-list: comment lines in `convex/_migrations.ts`).
- [ ] **Residue grep 3, renamed exports.** `grep -rnwE "closeRunByAdmin|_closeRun|_listExpiredOpenRuns|closeRunWithNotification|closeExpiredRuns|listJerseyRuns|isRunExpired|RunStatus" app components convex lib --exclude-dir=_generated` is empty (allow-list: comment lines in `convex/_migrations.ts`).
- [ ] **File names.** `find app components convex lib -iname '*jerseyrun*'` is empty. `app/admin/jersey-runs/` is allowed: it's a URL, and the pattern doesn't match it.
- [ ] **Schema.** `orderForms` has the exact validator and indexes `jerseyRuns` had at L-06's head (`git diff` shows the key rename only). `jerseyRuns` is gone. `orderItems` has `orderFormId: v.optional(v.id("orderForms"))` and no `runId`.
- [ ] **No behaviour change, Convex.** `git diff -M <L-06 head>..HEAD -- convex/` on non-test, non-migration files contains only renamed identifiers from the tables above. No auth call (`requireAdmin`, `requireListWriter`, ownership checks) and no validator is added, removed or reordered. No public function gains or loses an arg other than `jerseyRunId`/`runId` → `orderFormId`.
- [ ] **No behaviour change, tests.** The test count at HEAD equals the count at L-06's head, because the migration test lives and dies inside this issue. In `*.test.*` files, `git diff -M --word-diff` changes only identifiers, import paths, file names and fake-id fixture strings (e.g. `"jersey_run_test_id"`): no expected value, user-visible string or assertion is changed.
- [ ] **No copy change.** L-05's byte-identical snapshot of the public form (fixed + open fixtures) passes **unmodified**. The captain closure email test passes unmodified.
- [ ] **URLs still work:** `/run/<id>` with a seeded form's new id loads and submits; `/portal/orders/[id]/run/setup` and `/admin/jersey-runs/[id]` render for the seeded fixtures (component tests or SDET manual check with screenshots).
- [ ] `npm run verify` passes at **each** of the three commits (record the three test counts).

## Dependencies

- Blocked by: L-06

## Notes

- Files likely touched (~50): `convex/schema.ts`, `convex/_migrations.ts` (+ test), `convex/jerseyRuns.ts` → `orderForms.ts` (+ test), `convex/jerseyRunActions.ts` → `orderFormActions.ts`, `convex/{orderItems,_orderItems,orderEntries,admin,orders,crons,_devSeed,_schemaSmokeTest}.ts` (+ tests, incl. `submitOrder.test.ts`), `convex/_generated/*`, `lib/jerseyRun*/**` and their tests, `components/portal/{JerseyRunSetup,OrderForm,NamesModeControl,StartCollecting,DesignRemoval}.tsx` (+ tests), `components/portal/order/OrderFormCard.tsx`, `components/orderList/*` (any `runId`), `components/run/JerseyRunPublicForm.tsx` (+ test), `app/run/[id]/page.tsx`, `app/admin/jersey-runs/**`, `app/admin/orders/[id]/page.tsx`, `app/portal/page.tsx`, `app/portal/orders/[id]/{page,edit/page}.tsx` (+ tests), `app/portal/orders/[id]/run/setup/page.tsx`, `app/dev/components/page.tsx`.
- Over the ~20-file guideline on purpose (PM P4). It's one mechanical change, and splitting the Convex part would leave the schema and the code disagreeing between issues. The commit-3 boundary is the fallback split.
- Use `git mv` for every file rename so `-M` review works.
- Precedent: a ~120-file mechanical refactor cost about $3.5. Budget ~$5 and `--max-turns 150` here, because the dev migration run adds a few turns.
- Security: no new function is public. The migration is `internalMutation`, CLI-only, and deleted in commit 2. The rename moves the public surface (`api.jerseyRuns.getPublic` → `api.orderForms.getPublic`, `orderEntries.submitOrder` arg `jerseyRunId` → `orderFormId`) without changing what it exposes. The client and server deploy together, so no old client keeps calling the old path (dev only).
