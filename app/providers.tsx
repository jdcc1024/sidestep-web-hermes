"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import {
  ConvexReactClient,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import { ThemeProvider } from "next-themes";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Toaster } from "@/components/ui/sonner";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Syncs the authenticated user into Convex. getCurrentUser is a cheap read;
// both writes below are gated on it, so a user whose row already exists and
// is complete costs nothing per page load.
//
// Two steps because the Convex session token carries no name/email claims
// (see lib/clerkProfile): syncCurrentUser creates the row from `sub` alone,
// then hydrateProfileFromClerk fetches who they actually are. Existing rows
// left blank by the old sync are repaired by the same second step.
function UserSync() {
  const { isLoaded, isSignedIn } = useAuth();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isLoaded && isSignedIn ? {} : "skip",
  );
  const syncCurrentUser = useMutation(api.users.syncCurrentUser);
  const hydrateProfile = useAction(api.users.hydrateProfileFromClerk);
  // A profile Clerk can't complete would otherwise re-fetch on every render
  // this effect is re-run for.
  const hydrating = useRef(false);

  useEffect(() => {
    if (currentUser === null) {
      syncCurrentUser();
      return;
    }
    if (!currentUser || hydrating.current) return;
    if (currentUser.name && currentUser.email) return;

    hydrating.current = true;
    hydrateProfile().finally(() => {
      hydrating.current = false;
    });
  }, [currentUser, syncCurrentUser, hydrateProfile]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <UserSync />
          {children}
          <Toaster />
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </ThemeProvider>
  );
}
