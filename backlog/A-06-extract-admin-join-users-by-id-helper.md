# Issue: Extract Admin Join Users By Id Helper

## Phase: 3

## Type: improvement

## Description

`convex/admin.ts` repeated the same hand-rolled user join three times —
`listOrders` (captainCache), `listDesigns` (ownerCache), and `listJerseyRuns`
(captainCache + orderCache). Each was a `Promise.all` over the rows with a
`Map` cache and an `undefined`-means-not-fetched-yet branch inline in the
mapper.

Extract that into a single `joinUsersById(ctx, rows, keyOf)` helper in
`convex/_users.ts` (alongside the existing `convex/_auth.ts` helpers) that
dedupes the ids, fetches each once in parallel, and returns a
`Map<Id<"users">, Doc<"users"> | null>` lookup. The "Unknown" / "" fallback
strings stay at the call-site mapper — they're presentation, not data access.

Land it before 2-13 adds a fourth admin list view.

## Acceptance Criteria

- [x] `convex/_users.ts:joinUsersById` created with a `(ctx, rows, keyOf)` signature
- [x] `listOrders`, `listDesigns`, and `listJerseyRuns` each use the helper
- [x] Unknown/empty-email fallback strings live at the call-site mapper
- [x] No behavior change for admin endpoints
- [x] All existing tests pass

## Dependencies

- Blocked by: 3-02 (admin jersey run oversight — added the third call site)

## Notes

- PRD: `docs/architecture/improvement-report-2026-05-22.md#priority-3`
- The three admin list queries had no test coverage before this. Characterization
  tests went in first (`convex/admin.test.ts` → "admin list-view user joins"),
  covering the joined shape and the deleted-user fallbacks, so the refactor is
  provably behavior-preserving.
