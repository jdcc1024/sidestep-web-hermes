import { Webhook } from "svix";
import { headers } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { Resend } from "resend";
import { api } from "@/convex/_generated/api";
import { clerkProfileOf } from "@/lib/clerkProfile";
import {
  notifyNewRegistration,
  type ClerkRegistrationData,
  type EmailSender,
} from "@/lib/registrationNotification";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

type ClerkUserEvent = {
  type: "user.created" | "user.updated";
  data: ClerkRegistrationData & {
    // privateMetadata is server-only by Clerk's design — never sent to the
    // browser. We read it here and forward to Convex so admin status is
    // anchored to Clerk as the source of truth.
    private_metadata?: { is_admin?: unknown };
  };
};

// Null when Resend isn't configured (local dev, preview deploys) so the
// notification is skipped instead of failing the webhook.
function resendSender(): EmailSender | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const resend = new Resend(apiKey);
  return async (message) => {
    const { error } = await resend.emails.send(message);
    if (error) throw error;
  };
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  let event: ClerkUserEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  if (event.type !== "user.created" && event.type !== "user.updated") {
    return new Response(null, { status: 200 });
  }

  const { id, private_metadata } = event.data;
  const { name, email } = clerkProfileOf(event.data);
  const isAdmin = private_metadata?.is_admin === true;

  await convex.mutation(api.users.syncUser, {
    clerkId: id,
    email,
    name,
    isAdmin,
  });

  // Ops gets a heads-up only for brand-new captains who found us on their
  // own; invite-link sign-ups are already tracked as intake leads.
  if (event.type === "user.created") {
    const result = await notifyNewRegistration(event.data, {
      send: resendSender(),
      env: process.env,
      onError: (error) =>
        console.error("Registration notification failed", { id, error }),
    });
    if (result === "skipped-unconfigured") {
      console.warn("RESEND_API_KEY not set — registration email skipped", {
        id,
      });
    }
  }

  return new Response(null, { status: 200 });
}
