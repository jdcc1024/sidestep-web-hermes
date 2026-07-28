import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserOrNull } from "./_auth";
import { clerkProfileOf, fetchClerkUser } from "../lib/clerkProfile";

// Called client-side on first sign-in. Convex verifies the Clerk JWT
// automatically — no args needed, identity is read from auth context.
//
// The token itself has no name/email claims (see lib/clerkProfile), so this
// creates the row and hydrateProfileFromClerk fills in who they are.
export const syncCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clerkId = identity.subject;
    const email = identity.email ?? "";
    const name = identity.name ?? email;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      // Patch only what the token actually gave us. Blindly writing both
      // fields wipes the profile the webhook or the backfill just wrote,
      // since both claims are normally absent.
      const patch: { email?: string; name?: string } = {};
      if (email) patch.email = email;
      if (name) patch.name = name;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }

    return ctx.db.insert("users", {
      clerkId,
      email,
      name,
      isAdmin: false,
      createdAt: Date.now(),
    });
  },
});

// Name/email only — isAdmin stays the webhook's to write, so a profile
// refresh can never escalate anyone.
//
// The explicit return types on this and the two below are load-bearing: the
// action that calls them lives in the same module, so `internal.users.*` is
// self-referential and TypeScript can't infer through the cycle.
export const applyClerkProfile = internalMutation({
  args: { clerkId: v.string(), name: v.string(), email: v.string() },
  handler: async (ctx, { clerkId, name, email }): Promise<Id<"users"> | null> => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!existing) return null;
    if (existing.name === name && existing.email === email) return existing._id;

    await ctx.db.patch(existing._id, { name, email });
    return existing._id;
  },
});

export type HydrateProfileResult =
  | "ok"
  | "unauthenticated"
  | "unconfigured"
  | "not-found"
  | "empty";

// Pulls the caller's real name and email from Clerk's Backend API. Called by
// UserSync only when the row is missing one of them, so a populated user
// costs zero writes per page load.
export const hydrateProfileFromClerk = action({
  args: {},
  handler: async (ctx): Promise<HydrateProfileResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return "unauthenticated";

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.warn(
        "CLERK_SECRET_KEY is not set on this Convex deployment — user names and emails will stay blank.",
      );
      return "unconfigured";
    }

    const clerkUser = await fetchClerkUser(identity.subject, secretKey);
    if (!clerkUser) return "not-found";

    const { name, email } = clerkProfileOf(clerkUser);
    if (!name && !email) return "empty";

    await ctx.runMutation(internal.users.applyClerkProfile, {
      clerkId: identity.subject,
      name,
      email,
    });
    return "ok";
  },
});

export const listUnhydratedClerkIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const users = await ctx.db.query("users").collect();
    return users
      .filter((user) => !user.name || !user.email)
      .map((user) => user.clerkId);
  },
});

// One-off backfill for rows created before the profile fetch existed:
//   npx convex run --prod users:backfillProfilesFromClerk '{}'
// Rows for users Clerk has since deleted are counted as missing and left
// blank rather than removed — orders still reference them.
export type BackfillProfilesResult = {
  scanned: number;
  patched: number;
  missing: number;
};

export const backfillProfilesFromClerk = internalAction({
  args: {},
  handler: async (ctx): Promise<BackfillProfilesResult> => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "CLERK_SECRET_KEY is not set on this Convex deployment — cannot backfill user profiles.",
      );
    }

    const clerkIds: string[] = await ctx.runQuery(
      internal.users.listUnhydratedClerkIds,
      {},
    );

    let patched = 0;
    let missing = 0;
    for (const clerkId of clerkIds) {
      const clerkUser = await fetchClerkUser(clerkId, secretKey);
      const profile = clerkUser ? clerkProfileOf(clerkUser) : null;
      if (!profile || (!profile.name && !profile.email)) {
        missing += 1;
        continue;
      }
      await ctx.runMutation(internal.users.applyClerkProfile, {
        clerkId,
        ...profile,
      });
      patched += 1;
    }

    return { scanned: clerkIds.length, patched, missing };
  },
});

// Called by the Clerk webhook on user.created and user.updated. The webhook
// is the only path that writes isAdmin — keeps Clerk's privateMetadata as
// the canonical source. syncCurrentUser (called from the browser) never
// touches isAdmin.
export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, { clerkId, email, name, isAdmin }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { email, name, isAdmin });
      return existing._id;
    }

    return ctx.db.insert("users", {
      clerkId,
      email,
      name,
      isAdmin,
      createdAt: Date.now(),
    });
  },
});

// Returns the currently authenticated user's record, or null if not found.
// Used by UserSync in providers.tsx to avoid calling syncCurrentUser when
// the user already exists in the database.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return getCurrentUserOrNull(ctx);
  },
});

export const getByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    return ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
  },
});
