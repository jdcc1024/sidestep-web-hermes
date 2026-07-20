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

_(none open)_

## Answered

### [2-14] Optional Intake Image Uploads — 2026-07-19, ralph-loop
**Question:** What abuse-control mechanism should gate anonymous file uploads on the public, unauthenticated intake form, before we build the upload feature?
**Context:** The intake form (`/`-adjacent public route, no Clerk session) is the only place in the app where an unauthenticated visitor would write to Convex storage. Every other upload surface (design creation, 2-05) sits behind login. An open `generateUploadUrl` endpoint would let a script fill the storage bucket or upload abusive content with no rate limit and no record of who did it.
**Options considered:**
1. Cloudflare Turnstile (invisible CAPTCHA) gating the upload-URL mutation.
2. Per-IP rate limit on the upload-URL-issuing mutation via a Convex HTTP action.
3. Signed, tightly-scoped upload URLs alone.
4. Server-side proxy that validates size/MIME before writing to Convex.
**Recommendation (agent):** Option 2 (per-IP rate limit) + server-side size/MIME caps.
**Answer (2026-07-19, human):** None of the above — **remove anonymous uploads from the problem entirely.** The public intake form will not accept file uploads at all. Instead it takes *links* to a share folder the visitor already keeps their inspiration in (OneDrive / Dropbox / Google Drive): we store plain-text URLs, never files, so there is no storage bucket to abuse and the whole abuse-control question is moot. Actual binary image upload stays confined to the authenticated customer portal, where a signed-in customer starts a Design (2-05, already shipped). 2-14 is reshaped accordingly (see `backlog/2-14-optional-intake-image-uploads.md`, "Decision") and unparked.
