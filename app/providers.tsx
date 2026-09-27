"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { UserSync } from "@/components/layout/UserSync";
import { Toaster } from "@/components/ui/sonner";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
          {/* reducedMotion="user" makes the a11y guarantee structural: transform
              and layout animations are suppressed for anyone with the OS
              preference set, without each component remembering to opt in. */}
          <MotionConfig reducedMotion="user">
            <UserSync />
            {children}
            <Toaster />
          </MotionConfig>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </ThemeProvider>
  );
}
