# Issue: Project Scaffolding

## Phase: 1

## Type: infrastructure

## Vertical Slice
This issue touches:
- [ ] Database: Initialize Convex project and connect to Next.js
- [ ] API: Verify Convex dev server runs and can accept queries/mutations
- [ ] Frontend: Next.js App Router project with Tailwind CSS, TypeScript, and ESLint
- [ ] Tests: Confirm build passes, dev server starts, Convex health check passes

## Description
Bootstrap the complete tech stack from scratch: Next.js 14 (App Router) with TypeScript and Tailwind CSS, Convex backend initialized and linked, Clerk auth dependency installed, Resend SDK installed, and all environment variables documented. No features — just a runnable, deployable foundation that every other issue builds on.

## Acceptance Criteria
- [ ] `npm run dev` starts without errors
- [ ] Next.js App Router with TypeScript and Tailwind CSS is functional
- [ ] Convex dev server (`npx convex dev`) connects successfully
- [ ] Clerk, Resend, and Convex npm packages are installed
- [ ] `.env.local.example` documents all required environment variables (Clerk publishable/secret key, Convex URL, Resend API key)
- [ ] ESLint and TypeScript compile with zero errors on a clean build
- [ ] Basic `README.md` updated with local dev setup instructions
- [ ] All tests pass
- [ ] No regressions in existing tests

## Dependencies
- Blocked by: none
- Blocks: 1-02, 1-04

## PRD Reference
See: docs/prd/sidestep-website-phase1.md — Section 6 (Implementation Decisions)

## Implementation Notes
- Use `create-next-app` with the `--typescript` and `--tailwind` flags
- Initialize Convex with `npx convex dev` — this creates `convex/` directory and `convex.json`
- Install: `@clerk/nextjs`, `convex`, `resend`
- The `.env.local.example` file is critical — every dev needs to know what keys to set

## TDD Approach
1. Write test: Verify the build compiles without TypeScript errors (`tsc --noEmit`)
2. Implement: Run `create-next-app`, install dependencies, run `npx convex dev`
3. Verify: `npm run build` succeeds, `npm run dev` loads at localhost:3000
