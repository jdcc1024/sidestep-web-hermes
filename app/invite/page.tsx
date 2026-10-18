import Link from "next/link";

// This page renders only when /invite is visited without a token.
// Valid invite links (/invite?token=<id>) are intercepted by the proxy (proxy.ts),
// which sets the sidestep_invite_token cookie and redirects to /sign-up.
export default function InvitePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Invalid Invite Link
        </h1>
        <p className="mt-2 text-zinc-600">
          This link is missing a token. Please use the link sent to you by
          Sidestep.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-blue-600 hover:underline"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
