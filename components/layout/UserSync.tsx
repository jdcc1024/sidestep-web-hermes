"use client";

import { useAuth } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";

const REFRESHED_KEY_PREFIX = "sidestep:clerk-refreshed:";

// Syncs the authenticated user into Convex. getCurrentUser is a cheap read;
// syncCurrentUser only fires when the row doesn't exist yet.
//
// Two steps because the Convex session token carries no name/email claims
// (see lib/clerkProfile): syncCurrentUser creates the row from `sub` alone,
// then refreshFromClerk fetches who they actually are — including the admin
// flag. The refresh runs once per browser session per signed-in user, so an
// admin change made in the Clerk dashboard lands on the next page load of a
// new session (or after sign-out and back in).
export function UserSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isLoaded && isSignedIn ? {} : "skip",
  );
  const syncCurrentUser = useMutation(api.users.syncCurrentUser);
  const refreshFromClerk = useAction(api.users.refreshFromClerk);

  useEffect(() => {
    if (currentUser === null) {
      syncCurrentUser();
      return;
    }
    if (!currentUser || !userId) return;

    // sessionStorage rather than a ref: a ref resets on every full page
    // load, which would turn this into one Clerk API call per navigation.
    const key = REFRESHED_KEY_PREFIX + userId;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    refreshFromClerk().catch(() => {
      // Let the next page load try again.
      sessionStorage.removeItem(key);
    });
  }, [currentUser, userId, syncCurrentUser, refreshFromClerk]);

  return null;
}

// UserSync's once-per-session refresh means a plain reload doesn't re-read
// Clerk. The /admin layout has just read Clerk server-side, though, so when
// that disagrees with the Convex cache it asks for one refresh — grants and
// revocations then reach requireAdmin on reload. `clerkSaysAdmin` is only a
// trigger; the action re-reads Clerk itself and trusts nothing from here.
export function AdminFlagReconciler({
  clerkSaysAdmin,
}: {
  clerkSaysAdmin: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isLoaded && isSignedIn ? {} : "skip",
  );
  const refreshFromClerk = useAction(api.users.refreshFromClerk);
  const requested = useRef(false);

  useEffect(() => {
    if (!currentUser || requested.current) return;
    if (currentUser.isAdmin === clerkSaysAdmin) return;
    requested.current = true;
    void refreshFromClerk();
  }, [currentUser, clerkSaysAdmin, refreshFromClerk]);

  return null;
}
