# Issue: Shared Block Editor: Text Sections and Reorder

## Status: done

## Phase: 2

## Type: feature

## Vertical Slice
This issue touches:
- [x] Database: none (uses `designs.blocks` from D-02)
- [x] API: block add/update/remove/reorder mutations (owner or admin)
- [x] Frontend: shared block editor shell (add from fixed menu, edit, remove, drag-to-reorder); text block editing wired into the portal detail page
- [x] Tests: reorder + add/remove mutation smoke tests; editor interaction tests

## Description
Build the shared block editor shell that later block-types plug into, and ship the text block type through it. The owner can add fixed text sections (Overview/Concept/Inspiration/Notes), edit their bodies, remove them, and drag to reorder all blocks. This is the editing surface both portal and admin reuse.

## Acceptance Criteria
- [x] Shared `DesignBlockEditor` component: renders the ordered blocks, an "add block" menu limited to the fixed types, per-block remove, and drag-to-reorder with persisted order
- [x] Text sections limited to Overview/Concept/Inspiration/Notes; a used field can't be added twice; Overview required
- [x] Block mutations (add/update/remove/reorder) are owner-or-admin guarded and re-run the D-02 validators
- [x] Reorder persists to `designs.blocks` and survives reload
- [x] Wired into the portal design detail page, replacing the current full-form edit flow for block content
- [x] All tests pass
- [x] No regressions in existing tests

## Delivered
- `lib/designBlock.ts`: `availableTextFields`, `newTextBlock`, `isRequiredBlock`,
  `indexOfBlock`, `moveBlockTo` — the pure half, shared by editor and server.
- `convex/_designBlocks.ts`: `requireBlockEditAccess` (owner **or** admin, one
  gate), `patchBlocks` (the only writer of `designs.blocks`), `requireBlockIndex`.
- `convex/designs.ts`: `addBlock` / `updateBlock` / `removeBlock` / `moveBlock`.
  `updateDesign.blocks` became optional so a metadata save can't clobber the brief.
- `components/design/DesignBlockEditor.tsx`, reusing `DesignBlockBody` (split out
  of `DesignBlocks.tsx`) so the editor and the read page render blocks identically.
- Portal design page edits the brief in place; `DesignForm` keeps the Overview on
  create only.

**Open:** the add menu offers text sections only. Gallery and palette blocks are
reorderable and removable here but not yet editable — their menu entries land with
D-04 and D-05, which own those editors.

**Screenshots not captured** — the dev deployment still holds one pre-D-01 design
(`TOC 2026 Jersey`), so the schema can't push. See D-09 / QUESTIONS.md.

## Dependencies
- Blocked by: D-02
- Blocks: D-04, D-05, D-06

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 4 (P0), Section 5 (shared block editor), Appendix slice 4 (shell established here)

## Implementation Notes
- **Sequencing note:** the PRD appendix lists palette (slice 3) before this; we build the editor *shell* here first because palette (D-04) and gallery (D-05) editing plug into it. This is a technical ordering decision, not a scope change.
- Reorder: prefer a small, dependency-light drag approach; the exact handle affordance + mobile behavior is an open question in PRD §10 — pick a sensible default and note it in the session report.
- Reuse the RHF + zod grain from the current `DesignForm` for text body editing; keep the block editor a deep component with a simple prop surface (`designId`, `blocks`).
- Overview-on-create authoring (create form vs editor) is PRD §10 open — resolve here: keep the create form requiring an Overview body, then hand off to the editor for everything else.

## TDD Approach
1. Write test: add/remove/reorder mutations persist and reject unauthorized callers + duplicate text fields; editor renders add-menu, reorders on drag, saves.
2. Implement: mutations + `DesignBlockEditor` shell + text block editing; wire into portal page.
3. Verify: convex-test + component tests green; manual drag check.
