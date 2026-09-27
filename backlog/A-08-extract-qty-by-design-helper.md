# Issue: Extract Qty-By-Design Rollup Helper

## Phase: 3

## Type: improvement

## Description

The "sum `orderEntries.qty` grouped by design, projected onto the order's
current `designIds`" rollup is hand-rolled in three places:

- `convex/orderEntries.ts:countsByRun` — the live production total (R-04).
- `convex/jerseyRuns.ts:lock` — the frozen `lockSnapshot` taken at lock time (R-06).
- `convex/admin.ts:exportOrder` — the supplier handoff, which sorts entries by
  the same `designId` sequence (R-05/3-03).

Each independently builds a `Map<designId, Σqty>` over the run's entries and
walks `order.designIds` to resolve titles and totals. `countsByRun` and `lock`
in particular are supposed to produce the *same* number — the whole point of
the snapshot is that the frozen basis matches what the captain saw live — but
that guarantee currently rests on two separate copies of the arithmetic staying
identical.

Extract a single helper in `convex/orderEntries.ts` (or a shared
`convex/_orderEntries.ts` alongside the other underscore data-access modules)
with roughly:

```ts
qtyByDesign(ctx, run, order): Promise<{
  total: number;
  byDesign: Array<{ designId: Id<"designs">; title: string; total: number }>;
}>
```

`countsByRun` and `lock` then call it directly; `lock` wraps the result with
`lockedAt`. `exportOrder` can reuse the same `Map`/`designRank` build for its
row sort if it factors cleanly, but its per-row projection is a different shape,
so sharing there is optional — don't force it.

The auth gate, the empty-shape fallback, and the `Untitled design` fallback
stay at the call sites — they're policy/presentation, not the rollup itself.

## Acceptance Criteria

- [ ] A single `qtyByDesign`-style helper owns the Σ-qty-grouped-by-design rollup
- [ ] `orderEntries.countsByRun` and `jerseyRuns.lock` both derive their numbers from it
- [ ] The lock snapshot and the live count are provably the same computation (one source)
- [ ] `exportOrder` reuses the helper where it factors cleanly, or is left unchanged if not
- [ ] No behavior change for any of the three endpoints
- [ ] All existing tests pass

## Dependencies

- Blocked by: R-07 (retire the old response tables first, so the migration
  churn settles before this refactor touches the same handlers). Non-strict —
  can also land independently since it only touches the new-model handlers.

## Notes

- PRD: `docs/architecture/improvement-report-2026-07-26.md` (backend cohesion review)
- Characterization coverage already exists: `convex/orderEntries.test.ts`
  (countsByRun) and `convex/jerseyRuns.test.ts` (lock snapshot) assert the
  numbers, so the extraction is provably behavior-preserving. Add a test that
  locks a run and asserts `lockSnapshot.total` / `byDesign` equals a prior
  `countsByRun` call on the same run if one isn't already there.
- Same "extract a thrice-repeated data-access pattern into one deep helper"
  shape as A-06 (joinUsersById).
