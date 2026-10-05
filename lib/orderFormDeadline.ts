// Pure helpers for jersey-run deadline enforcement (issue 3-01).
// The cron action in convex/orderFormActions.ts wires these together;
// keeping the email rendering and "is it expired" decision in plain
// functions lets us test them without a Convex harness.

export type FormStatus = "open" | "closed";

export function isFormExpired(
  run: { status: FormStatus; deadline: number },
  now: number = Date.now(),
): boolean {
  return run.status === "open" && run.deadline < now;
}

export type ClosureEmailContext = {
  teamName: string;
  captainName: string;
  responseCount: number;
  deadline: number;
  // Absolute URL to the captain's dashboard; built by the action because
  // only the deployment knows the public site origin.
  dashboardUrl: string;
};

export type ClosureEmail = {
  subject: string;
  html: string;
  text: string;
};

const VANCOUVER_TZ = "America/Vancouver";

function formatVancouverDate(ms: number): string {
  // en-CA format reads naturally to Sidestep's BC-based ops team and
  // forces a stable YYYY-MM-DD order regardless of the captain's locale.
  return new Date(ms).toLocaleString("en-CA", {
    timeZone: VANCOUVER_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCaptainClosureEmail(
  ctx: ClosureEmailContext,
): ClosureEmail {
  const deadlineLabel = formatVancouverDate(ctx.deadline);
  const subject = `Your order form for ${ctx.teamName} closed`;
  const greetingName = ctx.captainName.trim() || "there";
  const responseLine =
    ctx.responseCount === 1
      ? "1 person submitted before the cutoff."
      : `${ctx.responseCount} people submitted before the cutoff.`;

  const text = [
    `Hi ${greetingName},`,
    "",
    `Your order form for ${ctx.teamName} closed on ${deadlineLabel}.`,
    responseLine,
    "",
    "Everything they sent is on your order list. Check it and finish your order here:",
    ctx.dashboardUrl,
    "",
    "— Sidestep",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family: system-ui, sans-serif; color: #111; line-height: 1.5;">
<p>Hi ${escapeHtml(greetingName)},</p>
<p>Your order form for <strong>${escapeHtml(ctx.teamName)}</strong> closed on ${escapeHtml(deadlineLabel)}.</p>
<p>${escapeHtml(responseLine)} Everything they sent is on your order list.</p>
<p><a href="${escapeHtml(ctx.dashboardUrl)}" style="color: #0d9488;">Check your order list and finish your order →</a></p>
<p>— Sidestep</p>
</body></html>`;

  return { subject, html, text };
}

export function renderOpsClosureEmail(
  ctx: ClosureEmailContext,
): ClosureEmail {
  const deadlineLabel = formatVancouverDate(ctx.deadline);
  const subject = `[Jersey run closed] ${ctx.teamName}`;
  const captainLabel = ctx.captainName.trim() || "Unknown captain";

  const text = [
    `Jersey run closed: ${ctx.teamName}`,
    `Captain: ${captainLabel}`,
    `Deadline: ${deadlineLabel}`,
    `Responses: ${ctx.responseCount}`,
    "",
    "Captain dashboard:",
    ctx.dashboardUrl,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family: system-ui, sans-serif; color: #111; line-height: 1.5;">
<p><strong>Jersey run closed:</strong> ${escapeHtml(ctx.teamName)}</p>
<ul>
<li>Captain: ${escapeHtml(captainLabel)}</li>
<li>Deadline: ${escapeHtml(deadlineLabel)}</li>
<li>Responses: ${ctx.responseCount}</li>
</ul>
<p><a href="${escapeHtml(ctx.dashboardUrl)}" style="color: #0d9488;">Open captain dashboard →</a></p>
</body></html>`;

  return { subject, html, text };
}
