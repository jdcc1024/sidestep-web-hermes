// New-registration ops notification (issue 3-06).
//
// The Clerk webhook (app/api/webhooks/clerk/route.ts) calls
// notifyNewRegistration on every user.created event. Captains who arrive
// through an invite link are already visible to the admin as an intake
// lead, so only self-registrations are worth an email.
//
// The send side is injected rather than importing Resend here: that keeps
// this module testable without network mocks and lets the route own the
// "is Resend configured at all" decision.

const DEFAULT_FROM_EMAIL = "noreply@sidestep.design";
const DEFAULT_OPS_EMAIL = "info@sidestep.design";

export type ClerkRegistrationData = {
  id: string;
  email_addresses: Array<{ email_address: string; primary: boolean }>;
  first_name: string | null;
  last_name: string | null;
  // Set by <SignUp unsafeMetadata={{ registeredViaInvite: true }} /> when the
  // invite cookie is present at sign-up. public_metadata is checked too so a
  // server-side promotion of the flag keeps working.
  unsafe_metadata?: { registeredViaInvite?: unknown };
  public_metadata?: { registeredViaInvite?: unknown };
};

export type RegistrationEmail = {
  subject: string;
  html: string;
  text: string;
};

export type OutgoingEmail = RegistrationEmail & {
  to: string;
  from: string;
};

export type EmailSender = (message: OutgoingEmail) => Promise<unknown>;

export type NotifyResult =
  | "sent"
  | "failed"
  | "skipped-invite"
  | "skipped-no-email"
  | "skipped-unconfigured";

// Index signature so process.env satisfies it directly (a weak type with
// only optional members isn't assignable from ProcessEnv).
type EnvLike = {
  [key: string]: string | undefined;
  SIDESTEP_NOTIFY_EMAIL?: string;
  RESEND_FROM_EMAIL?: string;
};

export function registrationNotificationRecipient(env: EnvLike): string {
  return env.SIDESTEP_NOTIFY_EMAIL || DEFAULT_OPS_EMAIL;
}

function registrationNotificationSender(env: EnvLike): string {
  return env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;
}

export function isSelfRegistration(data: ClerkRegistrationData): boolean {
  return (
    data.unsafe_metadata?.registeredViaInvite !== true &&
    data.public_metadata?.registeredViaInvite !== true
  );
}

function primaryEmailOf(data: ClerkRegistrationData): string {
  const primary = data.email_addresses.find((e) => e.primary);
  return (primary ?? data.email_addresses[0])?.email_address ?? "";
}

function fullNameOf(data: ClerkRegistrationData): string {
  return [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderRegistrationEmail(captain: {
  name: string;
  email: string;
}): RegistrationEmail {
  const displayName = captain.name.trim() || captain.email;
  const subject = `New Sidestep registration: ${displayName}`;

  const text = [
    "A new captain signed up without an invite link.",
    "",
    `Name: ${displayName}`,
    `Email: ${captain.email}`,
    "",
    "— Sidestep",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family: system-ui, sans-serif; color: #111; line-height: 1.5;">
<p>A new captain signed up without an invite link.</p>
<ul>
<li>Name: ${escapeHtml(displayName)}</li>
<li>Email: ${escapeHtml(captain.email)}</li>
</ul>
<p>— Sidestep</p>
</body></html>`;

  return { subject, html, text };
}

// Returns why it did (or didn't) send rather than throwing — the webhook
// must answer Clerk with a 200 regardless of what happens to the email.
export async function notifyNewRegistration(
  data: ClerkRegistrationData,
  deps: {
    send: EmailSender | null;
    env?: EnvLike;
    onError?: (error: unknown) => void;
  },
): Promise<NotifyResult> {
  if (!isSelfRegistration(data)) return "skipped-invite";

  const email = primaryEmailOf(data);
  if (!email) return "skipped-no-email";

  if (!deps.send) return "skipped-unconfigured";

  const env = deps.env ?? {};
  const rendered = renderRegistrationEmail({ name: fullNameOf(data), email });

  try {
    await deps.send({
      ...rendered,
      to: registrationNotificationRecipient(env),
      from: registrationNotificationSender(env),
    });
    return "sent";
  } catch (error) {
    deps.onError?.(error);
    return "failed";
  }
}
