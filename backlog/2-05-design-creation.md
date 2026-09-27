# Issue: Design Creation

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `designs` table — write via Convex mutation; Convex storage for file uploads
- [ ] API: Convex mutation `createDesign`; Convex storage `generateUploadUrl` and `getUrl`
- [ ] Frontend: Design creation form (title, brief, Canva link, file uploads); design detail page
- [ ] Tests: Form creates design record; files upload to Convex storage; design appears in dashboard; file URL is retrievable

## Description
Build the design creation flow in the customer portal. A captain fills in a design title, writes a brief (with an optional Canva share link field), and uploads one or more files (logos, mood boards, reference images — any file type accepted). On save, the design is stored in Convex and appears in the portal dashboard. A design detail page shows all the uploads and the brief.

## Acceptance Criteria
- [ ] Design form fields: title (required), brief text (textarea, required), Canva link (optional text field, displayed as a clickable link), file upload (multi-file, any file type, required — at least one file)
- [ ] Files upload to Convex storage; file IDs are stored in the `designs` record; file URLs are generated at view time
- [ ] After save, the new design appears in the portal dashboard `My Designs` section
- [ ] Design detail page shows: title, brief, Canva link (if present, as a clickable anchor), list of uploaded files with file name and a download link
- [ ] Uploading additional files to an existing design is supported (edit mode)
- [ ] Upload progress indicator shown while files are uploading
- [ ] Error state if upload fails (file too large, network error)
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: 2-04
- Blocks: 2-06

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Customer Portal), Section 5 (In Scope — File storage), Section 7 (Technical Constraints — file types)

## Implementation Notes
- Convex file upload flow: (1) call `generateUploadUrl` mutation to get a signed URL, (2) PUT the file to that URL from the browser, (3) call `createDesign` or `updateDesign` mutation with the returned storage IDs
- Routes: `app/(portal)/designs/new/page.tsx` and `app/(portal)/designs/[id]/page.tsx`
- Convex functions: `convex/designs.ts` — `createDesign`, `updateDesign`, `getDesign`, `listMyDesigns`
- No file size limit enforced in Phase 1 (Convex free tier allows up to 1GB per file)
- Canva link: store as plain text; display as `<a href={canvaLink} target="_blank">` — no embed or preview
- Use `<input type="file" multiple accept="*/*">` — accept all file types per PRD

## TDD Approach
1. Write test: Mock Convex storage upload; submit form with title, brief, and one file → assert `createDesign` mutation called with correct fields and at least one fileId
2. Implement: Build the form, Convex upload flow, and design detail page
3. Verify: Upload a PNG and a PDF in browser; confirm both appear as download links on the detail page; confirm design appears in dashboard
