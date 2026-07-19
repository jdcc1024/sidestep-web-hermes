# Issue: Optional Intake Image Uploads

## Status: blocked (needs human decision)

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `intakeSubmissions` (or equivalent) record gains a list of file/storage IDs
- [ ] API: Convex storage `generateUploadUrl` + a mutation to attach uploaded file IDs to the intake record; an abuse-control check gating anonymous upload URL issuance (mechanism TBD — see Open Question below)
- [ ] Frontend: `components/intake/IntakeForm.tsx` (public, unauthenticated) — optional file picker for photos/mood-board images
- [ ] Tests: Submitting without files works unchanged; submitting with files attaches them to the intake record and they're visible in the admin lead view (2-13); oversized/disallowed-MIME files are rejected server-side; abuse-control mechanism is exercised by a test

## Description
Let intake-form visitors optionally attach photos or mood-board images (jerseys they like, team colors, inspiration) when submitting the public intake form. Files attach to the intake record so design conversations can start with visual context. This form is public and unauthenticated (no Clerk session), so anonymous uploads create a real abuse risk — an open-write storage endpoint would let anyone script-fill the Convex storage bucket. **The abuse-control approach needs a decision before implementation** (see Open Question below) — this is why this task is parked rather than picked up directly by the loop.

## Acceptance Criteria
- [ ] Upload UI is fully optional — submitting without files works exactly as today
- [ ] Abuse-control approach decided and documented (e.g. Cloudflare Turnstile, per-IP rate limit, signed upload URLs, or a server-side proxy) before any code lands
- [ ] Per-file size cap and MIME allowlist (jpeg/png/webp/heic) enforced server-side, not just in the browser
- [ ] Total per-intake file count and aggregate size capped
- [ ] Uploaded files linked to the intake record so 2-13 admin view can preview them
- [ ] Files visible alongside the intake in the admin lead view (2-13)
- [ ] Mobile responsive — picker works on iOS Safari and Android Chrome
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-03 (done)
- Blocks: none
- Parked pending human decision (see Open Question)

## PRD Reference
See: docs/prd/sidestep-website-phase1.md#5-scope — "Public intake form" (In Scope) and "File storage: Convex built-in storage" (In Scope). Note the PRD's intake form field list (name, team name, sport type, estimated quantity, rough idea/brief) predates this optional-image addition.

## Open Question (parked — see backlog/QUESTIONS.md)
**How should anonymous uploads on the public intake form be rate-limited/abuse-controlled?** Unlike the portal's design-creation uploads (2-05), which sit behind Clerk auth, the intake form has no account and no login — anyone with the URL can hit it. Options and a recommendation are recorded in `backlog/QUESTIONS.md` under node `2-14`.

## Implementation Notes (once unparked)
- Convex file upload flow mirrors 2-05: `generateUploadUrl` → browser `PUT` → mutation with returned storage IDs, but the mutation/URL-issuing step needs the chosen abuse-control check in front of it
- Enforce MIME allowlist and size cap server-side in the attach mutation, not just via the `<input accept>` attribute (that's client-only and trivially bypassed)
- Reuse the admin lead view from 2-13 to render thumbnails/download links for attached files

## TDD Approach (once unparked)
1. Write test: submit intake form without files → record created with no file IDs, unchanged from current behavior
2. Write test: submit with an allowed-MIME file under the size cap → file ID attached to intake record
3. Write test: submit with a disallowed MIME type or oversized file → rejected server-side with a clear error, no record mutation
4. Write test: exercise the chosen abuse-control mechanism (e.g. rate-limit trips after N requests from the same source, or Turnstile token is verified) per whatever gets decided
5. Implement: wire the upload UI, server-side validation, and abuse-control check
6. Verify: submit from an incognito window with a photo attached; confirm it renders in the 2-13 admin lead view
