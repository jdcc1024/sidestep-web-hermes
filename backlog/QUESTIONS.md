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

### [D-09] Wipe the pre-D-01 dev design so the schema can push — 2026-07-25, ralph-loop
**Question:** May we delete the one remaining old-shape design document on the **dev** deployment (`benevolent-starling-766`), or would you rather delete it yourself?

**Context:** D-01 replaced `designs.fileIds` with the `designAssets` table and D-02 replaced `designs.brief` with the `blocks` array. The PRD chose **no migration** — "dummy designs wiped once (pre-launch, no real data)" (`docs/prd/design-page-blocks.md` §6). One document was never wiped, so `npx convex dev` refuses to push:

```
✖ Schema validation failed.
Document with ID "j572994ahcdr7mzg6h8aycd9sh877eb4" in table "designs"
does not match the schema: Object is missing the required field `blocks`.
```

It is the only row in `designs`: `{ title: "TOC 2026 Jersey", brief: "for toc", fileIds: [2 files] }`. That reads like a record **you** created by hand to test the portal, not loop-generated dummy data — which is why three iterations in a row have now left it alone rather than deleting your data on your deployment.

**What it blocks:** no schema push means no working dev backend, which means `scripts/snap.mjs` can't reach the app. **D-01, D-02 and D-03 all shipped without screenshots**, so the UX review surface for the whole design-page track is missing, and D-08 (motion & polish) can't be done at all without it. The code is fine — 789 tests green — this is purely the review surface.

**Options considered:**
1. **Delete the one document** (dashboard → `designs` → delete row), then re-run `npx convex dev --once`. Loses one hand-made test record; its two uploaded files stay orphaned in storage and can be deleted too. Matches the PRD's stated plan.
2. **Back-fill it in place** — add `blocks: [{kind:"text",field:"overview",body:"for toc"}]` and create `designAssets` rows for its two `fileIds`. Preserves the record, but means writing migration code the PRD explicitly declined, for one row.
3. **Make `blocks` optional in the schema** so the stale row validates. Rejected: it would let a design exist with no description forever and undo D-02's central guarantee.

**Recommendation:** Option 1, and honestly it's a 10-second dashboard click you may prefer to just do — say the word and the next iteration will do it instead. Once it's pushed, D-09 also re-captures the missing screenshots for D-01/D-02/D-03 in one pass.

**Update (2026-07-26, ralph-loop) — the schema half is solved; a different thing now blocks screenshots.** Your `_migrations.ts` backfill (f76fade) did it: `npx convex dev --once` pushes cleanly, and `TOC 2026 Jersey` now carries a real four-section brief. So this question no longer needs an answer as asked.

What still blocks Track D screenshots is the **Clerk session in `.auth/state.json`, which has expired** (saved 2026-07-19). `snap.mjs` reached the app fine during D-04 and photographed the **sign-in wall** at all 12 viewport/scheme combinations; those shots were deleted rather than filed as review artifacts. The one-time human step from CLAUDE.md fixes it:

```
node scripts/snap.mjs --login
```

Once that's re-run, D-09 can capture D-01/D-02/D-03/D-04 in one pass — and no dev data has to be deleted for any of it.

**Answer:** _(human fills in — or just re-run `--login` and unpark D-09 with `node scripts/dag-update.js answer D-09`)_

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
