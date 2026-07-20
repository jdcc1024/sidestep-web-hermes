import { SignUp } from "@clerk/nextjs";
import { cookies } from "next/headers";

// Middleware stamps sidestep_invite_token when someone follows /invite?token=…
// Carrying it into the sign-up as unsafeMetadata is what lets the Clerk
// user.created webhook (3-06) tell an invited captain from a walk-in: the
// flag is part of the sign-up request itself, so it's already on the user
// when the webhook fires — no post-hoc metadata write to race against.
export default async function SignUpPage() {
  const invited = (await cookies()).has("sidestep_invite_token");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        unsafeMetadata={invited ? { registeredViaInvite: true } : undefined}
      />
    </div>
  );
}
