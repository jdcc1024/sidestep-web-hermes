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
import { isAdminFromClerk } from "../lib/adminFlag";
import {
  clerkProfileOf,
  fetchClerkUser,
  type ClerkUserPayload,
} from "../lib/clerkProfile";

// Called client-side on first sign-in. Convex verifies the Clerk JWT
// automatically — no args needed, identity is read from auth context.
//
// The token itself has no name/email claims (see lib/clerkProfile), so this
// creates the row and refreshFromClerk fills in who they are. Never grants
// admin: new rows start at false and existing rows keep their cached flag.
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
      // fields wipes the profile the refresh or the backfill just wrote,
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

// The only writer of users.isAdmin. Internal, and its callers only ever pass
// a value derived by isAdminFromClerk from a server-side Backend API fetch —
// the Convex row is a cache of Clerk private metadata, never a source.
//
// Name/email are fill-only: they land only where the row is blank, so neither
// a blank value from Clerk nor a stale one can undo an admin.updateUser
// correction. isAdmin always lands, so a revocation in Clerk takes effect too.
//
// The explicit return types on this and the two below are load-bearing: the
// actions that call them live in the same module, so `internal.users.*` is
// self-referential and TypeScript can't infer through the cycle.
export const applyClerkUser = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (
    ctx,
    { clerkId, name, email, isAdmin },
  ): Promise<Id<"users"> | null> => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!existing) return null;

    const patch: { name?: string; email?: string; isAdmin?: boolean } = {};
    if (name && !existing.name) patch.name = name;
    if (email && !existing.email) patch.email = email;
    if (isAdmin !== existing.isAdmin) patch.isAdmin = isAdmin;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
    }
    return existing._id;
  },
});

function cachedFieldsOf(clerkUser: ClerkUserPayload) {
  return {
    ...clerkProfileOf(clerkUser),
    isAdmin: isAdminFromClerk(clerkUser.private_metadata),
  };
}

export type RefreshFromClerkResult =
  | "ok"
  | "unauthenticated"
  | "unconfigured"
  | "not-found";

// Re-reads the caller's own Clerk user from the Backend API and applies their
// name, email and admin flag. UserSync calls it once per browser session, so
// an admin grant or revocation made in the Clerk dashboard lands on the next
// page load — no webhook involved. Takes no args: the Clerk id comes from the
// verified token, so a caller can only ever refresh themselves.
export const refreshFromClerk = action({
  args: {},
  handler: async (ctx): Promise<RefreshFromClerkResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return "unauthenticated";

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      console.warn(
        "CLERK_SECRET_KEY is not set on this Convex deployment — user profiles and admin flags will not refresh.",
      );
      return "unconfigured";
    }

    // Null also covers a Clerk-side error, so leave the cache as it was
    // rather than revoke on a transient failure; the next session retries.
    const clerkUser = await fetchClerkUser(identity.subject, secretKey);
    if (!clerkUser) return "not-found";

    await ctx.runMutation(internal.users.applyClerkUser, {
      clerkId: identity.subject,
      ...cachedFieldsOf(clerkUser),
    });
    return "ok";
  },
});

export const listClerkIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const users = await ctx.db.query("users").collect();
    return users.map((user) => user.clerkId);
  },
});

// Re-syncs every row's profile and admin flag from Clerk:
//   npx convex run --prod users:backfillProfilesFromClerk '{}'
// Rows for users Clerk has since deleted are counted as missing and left
// as they are rather than removed — orders still reference them.
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
      internal.users.listClerkIds,
      {},
    );

    let patched = 0;
    let missing = 0;
    for (const clerkId of clerkIds) {
      const clerkUser = await fetchClerkUser(clerkId, secretKey);
      if (!clerkUser) {
        missing += 1;
        continue;
      }
      await ctx.runMutation(internal.users.applyClerkUser, {
        clerkId,
        ...cachedFieldsOf(clerkUser),
      });
      patched += 1;
    }

    return { scanned: clerkIds.length, patched, missing };
  },
});

// Returns the currently authenticated user's record, or null if not found.
// Used by UserSync (components/layout/UserSync.tsx) to avoid calling
// syncCurrentUser when the user already exists in the database.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return getCurrentUserOrNull(ctx);
  },
});
