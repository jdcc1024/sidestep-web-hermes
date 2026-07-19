# Issue: Admin Data Export

## Status: done

## Phase: 3

## Type: feature

## Vertical Slice
This issue touches:
- [ ] Database: `orders`, `jerseyRuns`, `jerseyRunResponses` — read for export
- [ ] API: Next.js API route `/api/admin/export/[orderId]` — streams a CSV download; admin-only
- [ ] Frontend: "Export to CSV" button on the admin order detail page; triggers browser download
- [ ] Tests: CSV contains all expected columns; jersey run responses included when run exists; download is rejected for non-admin users

## Description
Add a CSV export button to the admin order detail page. When clicked, it downloads a CSV containing the order's details and all jersey run responses (if a jersey run exists for the order). The CSV is formatted for supplier handoff: each row is one jersey response, with columns for the respondent's details and the jersey specifications. For orders without a jersey run, the CSV contains a single row with the order details.

## Acceptance Criteria
- [x] "Export CSV" button appears on the admin order detail page
- [x] CSV columns (for jersey run orders): respondent name, email, size, name on jersey, number on jersey, one column per custom question, submission date, team name, sport, jersey style, neckline, sleeve style — plus **Design** and **Quantity** (see Deviations)
- [x] CSV columns (for orders without jersey run): team name, captain name, captain email, sport, quantity, jersey style, neckline, sleeve style, order date
- [x] CSV filename: `sidestep-order-<teamname>-<date>.csv`
- [x] Download is initiated via a browser file download (no new page opened)
- [x] Non-admin callers are refused — enforced by `requireAdmin` in Convex (see Deviations)
- [x] All tests pass
- [x] No regressions in existing tests

## Deviations from the original spec

This issue was written before the O-01 spec move and the R-track roster
refactor. Three things changed as a result:

1. **Transport: Convex query, not a Next route handler.** The spec called for
   `/api/admin/export/[orderId]` gated on Clerk `privateMetadata.isAdmin`.
   Admin is actually determined by `users.isAdmin` in Convex (synced by the
   Clerk webhook) and every other admin surface gates on `requireAdmin`.
   A route handler on `privateMetadata` would have been a second, divergent
   source of truth for authorization. The export is an admin-only Convex
   query (`admin.exportOrder`); the button builds the file client-side from
   a Blob. Non-admins are refused server-side by `requireAdmin` — same
   security property, one gate instead of two.
2. **Rows come from `orderEntries`/`rosterEntries`, not `jerseyRunResponses`.**
   The legacy table is retired in R-07; building on it would have created
   work for that issue. Two new columns follow from the new model:
   **Design** (an order spans several designs now) and **Quantity** (an
   order entry carries a qty, so a row is not necessarily one jersey).
3. **Silhouette specs are per-row.** Jersey style / neckline / sleeve style
   moved onto the design in O-01, so they vary within one order and cannot
   be order-level columns. For an order with no run, rows degrade to one per
   linked design for the same reason.

Entries on designs the order no longer links are excluded, so the export
reconciles with the production count from `orderEntries.countsByRun` (R-05).

## Dependencies
- Blocked by: 3-02
- Blocks: none

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 4 (User Stories — Admin, export order data), Section 4 (P2 Nice to Have — CSV/PDF format)

## Implementation Notes
- Use a Next.js Route Handler (`app/api/admin/export/[orderId]/route.ts`) that returns a `Response` with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="..."` headers
- Admin check in the route handler: `auth()` from Clerk server SDK → check `privateMetadata.isAdmin`
- CSV generation: use a simple string-building function — no external library needed for straightforward CSV; escape commas and quotes per RFC 4180
- Client-side: the "Export CSV" button triggers a fetch to the API route and uses `URL.createObjectURL(blob)` to initiate the download
- Phase 1 exports CSV only; PDF export is flagged as P2 and deferred

## TDD Approach
1. Write test: Mock an admin session + order with jersey run data; call the export route → assert the response has the correct headers and CSV body with all expected columns and rows; call without admin → assert 403
2. Implement: Build the Route Handler, CSV generation function, and client-side download button
3. Verify: Export a real order with jersey run responses in the browser; open the CSV; confirm all columns are correct and values match the Convex data
