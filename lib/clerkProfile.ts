// Reading a captain's real name and email out of Clerk (issue B-02).
//
// The Convex session token can't supply them. Clerk's first-party Convex
// integration issues the *default* session token (`aud: "convex"`, no JWT
// template — `ConvexProviderWithClerk` skips the template lookup entirely once
// it sees that audience), and that token carries only `sub`/`sid`/`iss`. So
// `identity.name` and `identity.email` are always null, and anything synced
// from the JWT alone lands blank.
//
// Both places that *do* see a full profile — the user.created/user.updated
// webhook body and a Backend API fetch — hand back the same shape, so one
// module reads both. Note there is no `primary` boolean on an address: the
// primary is named by `primary_email_address_id`. An earlier
// `.find((e) => e.primary)` never matched, which is the second reason every
// users row had an empty email (and an empty name, which falls back to it).

const CLERK_API_BASE = "https://api.clerk.com/v1";

export type ClerkEmailAddress = {
  id?: string;
  email_address: string;
};

export type ClerkUserPayload = {
  id: string;
  email_addresses?: ClerkEmailAddress[] | null;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type ClerkProfile = {
  name: string;
  email: string;
};

export function primaryEmailOf(user: ClerkUserPayload): string {
  const addresses = user.email_addresses ?? [];
  const primary =
    addresses.find(
      (address) => address.id && address.id === user.primary_email_address_id,
    ) ?? addresses[0];
  return primary?.email_address ?? "";
}

export function fullNameOf(user: ClerkUserPayload): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
}

// Name falls back to the email because every admin list keys its label off
// `name`; an address beats "Unnamed captain".
export function clerkProfileOf(user: ClerkUserPayload): ClerkProfile {
  const email = primaryEmailOf(user);
  return { name: fullNameOf(user) || email, email };
}

// Null covers both "no such user" and a Clerk-side error: callers here are
// best-effort backfills that run again on the next sign-in, so there's nothing
// useful to do with the distinction.
export async function fetchClerkUser(
  clerkId: string,
  secretKey: string,
): Promise<ClerkUserPayload | null> {
  const response = await fetch(
    `${CLERK_API_BASE}/users/${encodeURIComponent(clerkId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!response.ok) return null;
  return (await response.json()) as ClerkUserPayload;
}
