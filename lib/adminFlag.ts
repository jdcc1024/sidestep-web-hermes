// The one definition of "is this Clerk user an admin?".
//
// Canonical source: Clerk *private* metadata, `{"isAdmin": true}` — exactly
// that key, exactly the boolean. Private metadata is server-only by Clerk's
// design, so a user can neither read nor edit their own flag. Public metadata,
// a snake_case `is_admin`, or the string "true" all mean not-admin.
//
// Pass the private metadata object itself — `user.privateMetadata` from the
// Next SDK, or `private_metadata` from a Backend API payload — never the whole
// user, so nothing else on the user can satisfy the check.
export function isAdminFromClerk(privateMetadata: unknown): boolean {
  if (typeof privateMetadata !== "object" || privateMetadata === null) {
    return false;
  }
  return (privateMetadata as { isAdmin?: unknown }).isAdmin === true;
}
