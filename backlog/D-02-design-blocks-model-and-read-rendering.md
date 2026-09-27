# Issue: Design Blocks Model and Read Rendering

## Phase: 1

## Type: feature

## Vertical Slice
This issue touches:
- [x] Database: `designs.blocks` — ordered array of a discriminated union (`text` | `gallery` | `palette`); remove `designs.brief` (replaced by Overview)
- [x] API: mutations accept/validate `blocks`; queries return them; block validators (fixed-field uniqueness, single-palette rule, swatch shape)
- [x] Frontend: read-only rendering of blocks on portal + admin detail pages (text sections, gallery grids, palette swatches)
- [x] Tests: block validators; render tests for each block kind incl. inline-image vs download-card

## Description
Introduce the block content model on the design doc and render it read-only on both detail pages. Text sections render as headed prose, galleries as thumbnail grids (web-safe images inline, other files as download cards), palette as labelled swatches. `brief` is removed — the Overview text block becomes the design's primary description read by list/card/admin summaries.

## Acceptance Criteria
- [x] `designs.blocks` array persists a discriminated union: `text {field: overview|concept|inspiration|notes, body}`, `gallery {caption?, assetIds[]}`, `palette {caption?, swatches[]}`; each block has a stable `id`
- [x] Validators enforce: each text `field` used at most once; at most one `palette` block; swatch `{hex, role?, label?, pantoneCode?}` with valid hex + role in `primary|secondary|accent`
- [x] `designs.brief` removed; Overview text block is the summary source for list/card/admin views (with a graceful empty state)
- [x] Portal + admin detail pages render blocks read-only in stored order
- [x] Gallery renders web-safe images inline (by `contentType`) and non-web assets as typed download cards; unavailable URLs degrade gracefully
- [x] Palette renders swatches with hex chip, role, and Pantone code label when present
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: D-01
- Blocks: D-03

## PRD Reference
See: docs/prd/design-page-blocks.md — Section 2, Section 5 (Scope), Section 6 (block storage / text sections decisions), Appendix slice 2

## Implementation Notes
- Store blocks as an array on the design doc (reorder = one patch) — a `v.union` of `v.object`s in schema.ts. Keep validation in a `lib/designBlock` module (unit-testable) mirroring the `lib/design/rules` grain.
- This slice is read-only rendering; all editing is D-03/D-04/D-05. Keep the current portal detail page's section styling (`app/portal/designs/[id]/page.tsx`) and admin card styling.
- Removing `brief`: update `createDesign`/`updateDesign`, `DesignForm`, list/card views, admin list, and any order query that reads `brief`. Overview lives in `blocks`; on create, seed a required Overview text block (see D-03 for the create-form authoring detail — for now accept blocks incl. Overview).
- Silhouette specs + Canva link stay as their existing fixed sections — not blocks.

## TDD Approach
1. Write test: block validators (field uniqueness, single palette, swatch validation); component tests rendering each block kind, inline-vs-card by content type, empty states.
2. Implement: schema union, `lib/designBlock` validators, mutation wiring, read-only block renderer components shared by both pages.
3. Verify: convex-test + tsc + component tests green.
