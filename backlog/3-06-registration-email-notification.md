# Issue: Registration Email Notification

## Status: done

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] API: Clerk webhook handler (`/api/webhooks/clerk`) — extend `user.created` to detect self-registration vs invite-link and conditionally send email
- [ ] Email: Resend call from webhook sends "New customer registered" email to `info@sidestep.design`
- [ ] Tests: Webhook fires Resend for self-registration; webhook does NOT fire Resend for invite-link registration

## Description
Extend the Clerk webhook handler (built in 1-03) to send a Resend notification email to `info@sidestep.design` whenever a new captain self-registers without an invite link. Invite-link registrations (where the user arrives via `/invite?token=<intakeId>`) should NOT trigger this email — the admin will already see that lead in the intake leads list (2-13).

## Acceptance Criteria
- [ ] Resend email sent to `info@sidestep.design` on self-registration with captain's name and email
- [ ] Email is NOT sent when the registration is triggered from an invite link (detectable via `publicMetadata.inviteToken` set during invite flow)
- [ ] Email sent from `noreply@sidestep.design`
- [ ] If Resend is not configured (env var missing), the webhook continues without error — email is skipped gracefully
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 1-03 (webhook handler must exist), 2-03 (invite-link flow complete so self-registration is distinguishable)
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 6 (Implementation Decisions — Email)

## Implementation Notes
- Detect self-registration: the sign-up page passes `unsafeMetadata.registeredViaInvite = true`
  to `<SignUp>` when the `sidestep_invite_token` cookie is present, so the flag is part of the
  sign-up request and already on the user when `user.created` fires — no post-hoc metadata
  write to race the webhook. `publicMetadata.registeredViaInvite` is honoured too, so a future
  server-side promotion of the flag keeps working.
- Resend SDK already installed from 1-01; use `resend.emails.send()`
- Send from `noreply@sidestep.design` — domain must be verified in Resend dashboard first
- Wrap Resend call in try/catch so a Resend failure never breaks the webhook response

## TDD Approach
1. Write test: Mock Clerk `user.created` event without invite flag → assert Resend `send` was called with correct to/subject/body
2. Write test: Mock `user.created` event with `publicMetadata.registeredViaInvite = true` → assert Resend `send` was NOT called
3. Implement: Add conditional Resend call in webhook handler
4. Verify: Register a real self-registration account → confirm email arrives at `info@sidestep.design`
