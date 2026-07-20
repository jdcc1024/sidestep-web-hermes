# Issue: Intake form — inspiration links (no anonymous uploads)

## Status: pending

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `intakeSubmissions` record gains an optional list of inspiration URLs (plain strings — no file storage)
- [x] API: the intake mutation accepts and validates a small list of share-folder URLs
- [x] Frontend: `components/intake/IntakeForm.tsx` (public, unauthenticated) — optional "paste a link to your inspiration" field(s)
- [x] Tests: submitting without links works unchanged; valid share-folder links attach to the intake record and show in the admin lead view (2-13); malformed or disallowed URLs are rejected server-side

## Decision (2026-07-19, human)
**No anonymous file uploads on the public intake form.** The original scope —
letting unauthenticated visitors upload photos/mood-board images — is dropped
because an open-write storage endpoint on a public form is an abuse surface we
don't want to own. Instead:

1. **Intake form takes _links_, not files.** Visitors paste URLs to a shared
   folder they already keep their inspiration in (OneDrive, Dropbox, Google
   Drive). We store the URLs as text; we never receive or host their files, so
   there is no bucket to fill and no MIME/size/rate-limit abuse-control problem
   to solve first.
2. **Actual image upload lives in the customer portal only** — when a
   signed-in customer starts a Design (2-05, already shipped, behind Clerk
   auth). That is the one place binary uploads happen, and it is authenticated.

This supersedes the earlier "abuse-control mechanism" open question, which is
now moot — see `backlog/QUESTIONS.md` (Answered).

## Acceptance Criteria
- [ ] The link field is fully optional — submitting without any link works exactly as today
- [ ] Visitors can add one or more inspiration URLs (a small cap, e.g. up to 5)
- [ ] URLs are validated server-side: well-formed `https://` URLs, and (soft) recognised as a known share host (OneDrive / Dropbox / Google Drive / iCloud) — reject obviously malformed input, don't hard-block an unrecognised-but-valid `https` URL
- [ ] Total link count and per-URL length capped server-side (defence against a script pasting megabytes of text)
- [ ] Stored links attach to the intake record and render as clickable links in the admin lead view (2-13)
- [ ] Mobile responsive — the field works on iOS Safari and Android Chrome
- [ ] All tests pass
- [ ] No regressions in existing tests

## Out of Scope
- File/binary upload of any kind on the public intake form.
- Fetching, previewing, or thumbnailing the linked content — we store and
  display the raw URL only. (Many share links require auth to open; that's the
  customer's call, not ours.)

## Dependencies
- Blocked by: 2-03 (done — the intake form and its mutation)
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md#5-scope — "Public intake form" (In
Scope). The PRD's original field list (name, team name, sport, estimated
quantity, rough idea/brief) predates this optional-links addition.

## Implementation Notes
- Add the URLs to the existing intake mutation args as an optional
  `string[]`; validate shape + host + caps in the mutation, not just in the
  browser. No Convex storage, no `generateUploadUrl` — this is plain text.
- Render in the 2-13 admin lead view as `<a target="_blank" rel="noreferrer">`
  chips/links, not embedded previews.
- Anonymous submission still writes to `intakeSubmissions`; a per-IP rate
  limit on the intake mutation is a reasonable general hardening but is no
  longer a blocker for this feature (no storage at risk).

## TDD Approach
1. Write test: submit intake without links → record created with an empty/absent link list, unchanged from current behaviour.
2. Write test: submit with valid share-folder links → links attached to the record.
3. Write test: submit with a malformed URL or over the count/length cap → rejected server-side with a clear error, no record mutation.
4. Implement: add the optional link field to `IntakeForm`, server-side validation in the intake mutation, and the admin lead-view rendering.
5. Verify: submit from an incognito window with a couple of Drive links; confirm they render as clickable links in the 2-13 admin lead view.
