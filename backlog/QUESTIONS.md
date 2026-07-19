# Needs-Human Queue

Agents park product/UX questions here instead of guessing. Nodes flagged this way show purple in the DAG viewer and are skipped by the loop until answered.

**To answer:** write your answer under the question, move the entry to Answered, then run
`node scripts/dag-update.js answer <nodeId>` — the task becomes eligible again and the next loop iteration picks it up with your answer in hand.

Agents: when you restart a previously-parked task, read its Answered entry FIRST.

---

## Open

<!-- template — copy this block
### [nodeId] Task Title — YYYY-MM-DD, agent-id
**Question:** One clear, answerable question.
**Context:** Why this can't be decided autonomously; what's already built.
**Options considered:**
1. Option A — tradeoffs
2. Option B — tradeoffs
**Recommendation:** which option and why (human may veto).
**Answer:** _(human fills in)_
-->

### [2-14] Optional Intake Image Uploads — 2026-07-19, ralph-loop
**Question:** What abuse-control mechanism should gate anonymous file uploads on the public, unauthenticated intake form, before we build the upload feature?
**Context:** The intake form (`/`-adjacent public route, no Clerk session) is the only place in the app where an unauthenticated visitor would write to Convex storage. Every other upload surface (design creation, 2-05) sits behind login. An open `generateUploadUrl` endpoint would let a script fill the storage bucket or upload abusive content with no rate limit and no record of who did it. This also picked up a repo-hygiene issue: the DAG node's `issueFile` pointed at `backlog/2-14-optional-intake-image-uploads.md`, which didn't exist — a different, already-shipped task ("Jersey Run Submit and Add Another") had claimed the `2-14` backlog filename prefix instead. I've created the correct backlog file for this task; the numbering collision itself needs no action since the two files have different full names, but flagging it in case it's confusing in the DAG viewer.
**Options considered:**
1. Cloudflare Turnstile (invisible CAPTCHA) gating the upload-URL mutation — strong bot resistance, no added cost at this scale, but adds a third-party vendor dependency + site/secret keys to manage, and any CAPTCHA (even invisible) is one more thing that can misfire on a conversion-sensitive public lead form.
2. Per-IP rate limit on the upload-URL-issuing mutation (e.g. N uploads per IP per hour, tracked in a Convex table) — no new vendor, no user-facing friction, but weaker against a distributed/rotating-IP abuser; also Convex mutations don't see the client IP directly, so this requires routing the request through a Convex HTTP action to read `x-forwarded-for`.
3. Signed, tightly-scoped upload URLs (short expiry, single-use, small size) alone, with no rate limiting — simplest to build, but does nothing to stop repeated legitimate-looking requests from slowly filling storage; only mitigates URL-sharing/replay, not scripted abuse.
4. Server-side proxy that receives the file directly (not a client-side storage URL) and validates size/MIME before ever writing to Convex — most control, but is the most implementation work and duplicates what Convex's upload URL flow already does reasonably well.
**Recommendation:** Option 2 (per-IP rate limit via a Convex HTTP action) combined with the server-side size cap + MIME allowlist that's already an acceptance criterion regardless of which option is picked. It needs no new vendor account, adds no friction to a form whose whole job is converting leads, and is proportionate to a small Greater-Vancouver-only business's actual abuse exposure. Turnstile (option 1) is the fallback if rate limiting alone proves insufficient in practice.
**Answer:** _(human fills in)_

## Answered

_(none yet)_
