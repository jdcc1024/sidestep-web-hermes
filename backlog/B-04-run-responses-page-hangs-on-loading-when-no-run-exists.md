# Issue: Run responses page hangs on loading when no run exists

## Status: done

## Phase: 3

## Type: bug

## Description

`app/portal/orders/[id]/run/responses/page.tsx` resolved its three queries in
the wrong order. The entries query is skipped while there is no run:

```tsx
const runStub = useQuery(api.jerseyRuns.getByOrder, order ? { orderId } : "skip");
const data = useQuery(
  api.jerseyRuns.listOrderEntries,
  runStub ? { jerseyRunId: runStub._id } : "skip",
);
```

A skipped `useQuery` returns `undefined` — the same value it returns while
loading. The page then gated the skeleton on both at once:

```tsx
if (runStub === undefined || data === undefined) return <Loading />;
if (runStub === null) return <NoRunYet />;   // unreachable
```

When `runStub` is `null` (order exists, no run yet) `data` is permanently
`undefined`, so the first line returns the skeleton forever and the `NoRunYet`
branch below it can never run. A captain who opens Responses before setting up
their run sees an endless loading skeleton with no way forward.

The fix is to settle the run before reading anything derived from it, so each
`undefined` is interpreted against a known run state.

## Acceptance Criteria

- [x] A captain opening `/run/responses` before any run exists sees the
      `NoRunYet` state, not a skeleton
- [x] A run that exists still renders its responses unchanged
- [x] Regression test covers the no-run-yet path
- [x] The skeleton is still shown while the run — and, once found, its
      entries — are genuinely loading
- [x] A found run whose entries come back `null` still shows `NotFound`

## Dependencies

- Blocked by: none

## Notes

Same family as B-03 (`backlog/B-03-portal-pages-flash-not-found-while-auth-loading.md`):
a tri-state Convex read whose `undefined` was read as one thing when it means
two. B-03 was "not yet authenticated" vs "not found"; this is "skipped" vs
"loading". The order-scoped read above both of these already goes through
`useOwnedResource` (`lib/ownedResource.ts`), which exists precisely to make
that distinction explicit; the run/entries pair here is still hand-rolled.

`NoRunYet` and `Loading` are unchanged — the bug was purely control flow, so
no markup moved.
