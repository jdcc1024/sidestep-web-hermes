"use client";

import { useConvexAuth, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

// Whether the signed-in visitor is an admin, from the caller's own Convex row
// (`users.isAdmin`, the server-written cache of the Clerk private flag).
// Loading, signed out and no row yet all read as false.
//
// UI hint only; never use it to authorise anything. Server code uses
// `requireAdmin` / the admin layout's Clerk check.
export function useIsAdmin(): boolean {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");
  return user?.isAdmin === true;
}
