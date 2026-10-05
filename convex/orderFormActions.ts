"use node";

import { Resend } from "resend";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  renderCaptainClosureEmail,
  renderOpsClosureEmail,
  type ClosureEmail,
  type ClosureEmailContext,
} from "../lib/jerseyRunDeadline";
import { OPS_EMAIL as DEFAULT_OPS_EMAIL } from "../lib/contact";

const DEFAULT_FROM_EMAIL = "hello@sidestep.design";
const DEFAULT_SITE_URL = "https://sidestep.design";

// Build the absolute URL to the captain's order page, where everything
// players sent lands on the order list (L-05 retired the responses page).
// Falls back to the
// production origin so emails generated in unconfigured dev environments
// still contain a clickable (if useless) link instead of "undefined/...".
function dashboardUrl(orderId: string): string {
  const base = (process.env.SIDESTEP_SITE_URL ?? DEFAULT_SITE_URL).replace(
    /\/+$/,
    "",
  );
  return `${base}/portal/orders/${orderId}`;
}

async function sendEmail(
  resend: Resend,
  to: string,
  email: ClosureEmail,
): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  const { error } = await resend.emails.send({
    from,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  // Don't throw on individual failures — one bad recipient shouldn't
  // block the other email or roll back a cron run. Convex logs capture
  // the failure for after-the-fact triage.
  if (error) console.error("Resend send failed", { to, error });
}

// Internal — closes a single run and emails both the captain and the
// Sidestep ops inbox. Used by both the daily cron (3-01) and the admin
// manual close button (3-02), so closure semantics stay consistent.
export const closeFormWithNotification = internalAction({
  args: { orderFormId: v.id("orderForms") },
  handler: async (ctx, { orderFormId }) => {
    const context = await ctx.runMutation(internal.orderForms._closeForm, {
      orderFormId,
    });
    if (!context) return { closed: false };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Local dev with no key set: the DB transition still happened, but
      // we have no way to mail anyone. Log so the operator notices.
      console.warn(
        "RESEND_API_KEY not set — jersey run closed but no email sent",
        { orderFormId },
      );
      return { closed: true, emailed: false };
    }

    const resend = new Resend(apiKey);
    const opsTo = process.env.SIDESTEP_NOTIFY_EMAIL ?? DEFAULT_OPS_EMAIL;
    const emailCtx: ClosureEmailContext = {
      teamName: context.teamName,
      captainName: context.captainName,
      responseCount: context.responseCount,
      deadline: context.deadline,
      dashboardUrl: dashboardUrl(context.orderId),
    };

    await Promise.all([
      context.captainEmail
        ? sendEmail(resend, context.captainEmail, renderCaptainClosureEmail(emailCtx))
        : Promise.resolve(),
      sendEmail(resend, opsTo, renderOpsClosureEmail(emailCtx)),
    ]);

    return { closed: true, emailed: true };
  },
});

// Cron entry — sweeps every open run whose deadline has passed and runs
// the same close-with-notification flow on each. Safe to re-run; the
// internal mutation no-ops on already-closed runs.
//
// Return type is annotated because this action and
// closeFormWithNotification are in the same module — without an annotation
// TypeScript can't resolve the type of `internal.orderFormActions.*`
// while it's still inferring this function.
export const closeExpiredForms = internalAction({
  args: {},
  handler: async (ctx): Promise<{ scanned: number; closed: number }> => {
    const expiredIds = await ctx.runQuery(
      internal.orderForms._listExpiredOpenForms,
      { now: Date.now() },
    );

    // Run sequentially so we don't dogpile Resend with parallel sends —
    // a daily cron will never have a backlog large enough to need fanout.
    let closed = 0;
    for (const orderFormId of expiredIds) {
      const result = await ctx.runAction(
        internal.orderFormActions.closeFormWithNotification,
        { orderFormId },
      );
      if (result.closed) closed += 1;
    }
    return { scanned: expiredIds.length, closed };
  },
});
