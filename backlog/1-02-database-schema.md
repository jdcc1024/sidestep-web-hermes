# Issue: Database Schema

## Phase: 1

## Type: infrastructure

## Vertical Slice
This issue touches:
- [x] Database: Define all Convex schema tables and field types
- [x] API: Convex schema validation active (Convex enforces types at runtime)
- [x] Frontend: No UI — schema only
- [x] Tests: Schema compiles; basic Convex queries for each table return expected shape

## Description
Define the complete Convex schema covering all core entities: users, designs, orders, jersey runs, jersey run responses, and intake submissions. Establishes the data model that every feature issue builds on. Includes field types, optional fields, and index definitions for common query patterns.

## Acceptance Criteria
- [x] `users` table: clerkId, email, name, isAdmin (boolean), createdAt
- [x] `designs` table: ownerId, title, brief, canvaLink (optional), fileIds (array of Convex storage IDs), createdAt, updatedAt
- [x] `orders` table: captainId, teamName, sport, estimatedQuantity, jerseyStyle, neckline, sleeveStyle, hasOwnDesign, designIds (array), internalStages (array of stage objects with name + completedAt), createdAt, updatedAt
- [x] `jerseyRuns` table: orderId, captainId, namesMode ("open"|"fixed"), fixedRoster (optional array), customQuestions (array), deadline, status ("open"|"closed"), createdAt
- [x] `jerseyRunResponses` table: jerseyRunId, respondentName, respondentEmail, jerseyName (optional), jerseyNumber (optional), size, customAnswers (object), submittedAt
- [x] `intakes` table: name, teamName, sport, estimatedQuantity, brief, submittedAt
- [x] Indexes defined for common queries (e.g. orders by captainId, jerseyRunResponses by jerseyRunId)
- [x] `npx convex dev` starts without schema errors
- [x] All tests pass
- [x] No regressions in existing tests

## Dependencies
- Blocked by: 1-01
- Blocks: 1-03, 2-01, 2-02, 2-03, 2-04, 2-05, 2-06, 2-07, 2-08, 2-09, 2-10, 2-11, 2-12, 2-13

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 5 (Scope), Grilling Summary (Key Data Entities)

## Implementation Notes
- All tables live in `convex/schema.ts`
- The 14 internal order stages (from PRD grilling): Inquiry, Planned, Started, Design Ideated, Design Confirmed, Invoice Sent, Order Size Confirmed, Sent to supplier, Invoice Paid, Colour Confirmation, Production, Produced, Shipped, Delivered
- The 8 customer-facing stages derive from internal stages — the mapping logic lives in a helper function, not in the schema itself
- Use Convex `v.optional()` for nullable fields; prefer explicit types over `v.any()`
- `fileIds` stores Convex storage IDs (strings); actual file URLs are generated at query time via `ctx.storage.getUrl()`

## TDD Approach
1. Write test: A Convex query that inserts one record into each table and reads it back, asserting field shapes match
2. Implement: Define `convex/schema.ts` with all tables; run `npx convex dev` to push schema
3. Verify: No schema validation errors in Convex dashboard; test queries return correct shapes
