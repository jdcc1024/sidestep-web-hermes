# Issue: Forms validate through their lib validator; no raw error text on design and intake pages

## Phase: 3

## Type: improvement

## Size: L (~16 files, ~$4)

## Description

From the `.tsx` logic audit (`docs/architecture/tsx-logic-audit.md`, findings
5–10). Six forms re-implement a tested `lib` validator inline in zod. The
tests cover the lib copy, and users run the component copy. The two copies
have already drifted once: the intake form caps phone at 40 characters, and
neither `validateIntake` nor the **public, unauthenticated**
`intakes.submitIntake` caps it. This issue also takes out the last raw
`err.message` toasts, which are on the captain's design page and the public
intake page.

**Behaviour and visible copy do not change**, apart from the server now
rejecting an over-long phone, name or team name on intake.

### Decision: the lib validator is the truth, and zod calls it

Add `lib/formAdapter.ts`, about 15 lines:
`refineWith(validate) => (values, ctx) => { for each [field, msg] of validate(values) ctx.addIssue({ code: "custom", path: [field], message: msg }) }`.
Each form's schema becomes the shape (`z.object({...strings})`) plus
`.superRefine(refineWith(validateX))`. (Rejected: moving the zod schemas into
`lib/`. Convex still needs `validateX`, so that keeps two copies. See the
design note.)

**Wording rule:** where the component's message differs from the lib's, the
**lib changes to the component's wording**, because that's what customers see
today. Update the lib test expectations to match. This is the only expected
edit to existing tests.

### Forms (post-L-07 names; before L-07, `OrderFormSettings` = `JerseyRunSetup`)

| Form | Validator | Notes |
|---|---|---|
| `components/intake/IntakeForm.tsx` | `validateIntake` | Move `NAME_MAX`/`TEAM_MAX` (200) and `PHONE_MAX` (40) into `lib/intake.ts`. `validateIntake` checks name, team and phone length. `convex/intakes.ts` `submitIntake` rejects phone > 40 (name/team are already capped at 200 by `requireShort`). The `todayIso` and `startOfTodayUtcMs` copies go: use lib's. |
| `components/portal/OrderFormSettings.tsx` | `validateOrderForm` | deadline + questions |
| `components/portal/StartCollecting.tsx` | new `checkDeadline(value, now)` exported from `lib/orderForm/rules.ts` | `validateOrderForm` uses it too |
| `components/portal/OrderForm.tsx` (post-L-07 `OrderDetailsForm.tsx`) | `validateOrder` | |
| `components/portal/DesignForm.tsx` | `validateDesign` | |
| `app/portal/designs/[id]/page.tsx` | per-field rules from `lib/design` | delete `validateTitle/JerseyStyle/CanvaLink` |

Also:
- `toDateInput` (`OrderFormSettings.tsx:553`) moves to `lib/orderForm/rules.ts`
  next to `parseDeadline`.
- `convex/designs.ts:40-41` imports `TITLE_MAX_LENGTH` and
  `CANVA_LINK_MAX_LENGTH` from `lib/design/rules` instead of re-declaring them.
- Raw error text → `userMessage(err, <current fallback>)` in
  `components/InlineEditField.tsx:77`, `components/design/DesignSpecPicker.tsx:41`,
  `DesignBlockEditor.tsx:124`, `DesignAssetPool.tsx:72` and `IntakeForm.tsx:233`.
  Admin pages share these components, and `userMessage` still shows a
  server-written `ConvexError` string, so admins lose nothing they could act on.
- SDET widens `lib/userMessage.guard.test.ts` `TREES` with `app/portal/designs`
  (already inside `app/portal`), `components/design`, `components/intake` and
  `components/InlineEditField.tsx`.

## Done when

1. A visitor on `/intake` types a 41-character phone number, sees the length message under the phone field, shortens it, and the inquiry sends.
2. A captain opens Form settings, saves without touching the deadline, and the order page still shows the same "Closes" date.

## Logic

- `validateIntake` + `intakes.submitIntake`: a 40-char phone passes; a 41-char phone fails in both, and a direct mutation call is rejected with a `ConvexError`; name or team over 200 fails in `validateIntake`.
- `toDateInput` ↔ `parseDeadline`: round-trips for any stored deadline (`parseDeadline(toDateInput(ms)) === ms`), including a date at a month/year boundary.
- `checkDeadline`: today passes (end-of-day cutoff); yesterday fails; empty fails; a non-date string fails.
- `refineWith`: maps each `{field: message}` to a zod issue on that path; an empty result adds no issue.
- `userMessage` guard: `components/design`, `components/intake` and `InlineEditField.tsx` are scanned, and the tree is clean.

## Dependencies

- Blocked by: L-07 (renames `JerseyRunSetup`, `OrderForm` and `lib/jerseyRun`)
- Independent of R-09.

## Notes

- Files likely touched: `lib/formAdapter.ts` (+ test), `lib/intake.ts`, `lib/orderForm/{rules,form}.ts`, `lib/design/form.ts`, `lib/order.ts` (wording only, if any), `convex/intakes.ts`, `convex/designs.ts`, the six form files above, `components/InlineEditField.tsx`, `components/design/{DesignSpecPicker,DesignBlockEditor,DesignAssetPool}.tsx`, plus lib test expectations for any re-worded message.
- Review check: in each form file the diff deletes rule bodies and adds a `refineWith(...)` call. No JSX changes. `grep -nE "\.min\(1|\.max\(|parseInt|refine\(\(" components/intake/IntakeForm.tsx components/portal/*.tsx app/portal/designs/\[id\]/page.tsx` returns only shape declarations, no rules.
- Review check: `grep -rnE "\b(err|error|e)\.message\b" components app --include=*.tsx` (excluding tests) finds only `app/admin/**` and `components/admin/ExportOrderButton.tsx`. Admin-only screens are out of scope; their audience is JCC.
- If this runs past ~20 files, split off the error-text bullet (5 files plus the guard) as R-11.
- Security: `submitIntake` gets **stricter** (phone cap) and nothing gets looser. No new public function.
