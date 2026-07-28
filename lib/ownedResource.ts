"use client";

import { useConvexAuth } from "convex/react";

// Owner-scoped Convex queries (`getMyOrder`, `getMyDesign`, `listMyDesigns`, …)
// answer "no identity" and "not yours / doesn't exist" with the same value —
// `null` for a single resource, `[]` for a list. A page that reads that value
// directly renders "Order not found" during the window where the Clerk token
// hasn't been attached to the Convex client yet (B-03).
//
// This module folds the two signals — auth readiness and query readiness —
// into one state, so a page only ever renders "not found" on an answer the
// server gave while it knew who was asking.
export type OwnedResourceState<T> =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "ready"; data: T };

export function resolveOwnedResource<T>({
  authLoading,
  isAuthenticated,
  result,
}: {
  authLoading: boolean;
  isAuthenticated: boolean;
  result: T | null | undefined;
}): OwnedResourceState<T> {
  // Until Convex has an authenticated identity, nothing it returned is a
  // statement about this user's data. `/portal` is middleware-protected, so a
  // genuinely signed-out visitor is redirected rather than left here loading.
  if (authLoading || !isAuthenticated) return { status: "loading" };
  if (result === undefined) return { status: "loading" };
  if (result === null) return { status: "not-found" };
  return { status: "ready", data: result };
}

// `useConvexAuth` — not Clerk's `useAuth` — is the right gate: it flips to
// authenticated only once the Convex client has validated the token, which is
// the exact moment owner-scoped queries start answering for a real identity.
// It also re-enters loading on a reconnect (e.g. after a redeploy), which is
// where the flash was most visible.
export function useOwnedResource<T>(
  result: T | null | undefined,
): OwnedResourceState<T> {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return resolveOwnedResource({
    authLoading: isLoading,
    isAuthenticated,
    result,
  });
}

// Lists have no "not found" — they come back `[]`. Callers already branch on
// `undefined` for their skeleton, so this keeps that shape and simply holds
// `undefined` until the `[]` is one the server vouched for.
export function useOwnedList<T>(result: T[] | undefined): T[] | undefined {
  const state = useOwnedResource(result);
  return state.status === "ready" ? state.data : undefined;
}
