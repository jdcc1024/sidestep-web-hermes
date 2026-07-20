import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  normalizeInspirationLinks,
  validateInspirationLinks,
} from "../lib/intake";

const designPreferenceValidator = v.union(
  v.literal("own-design"),
  v.literal("needs-help"),
  v.literal("undecided"),
);

const usageContextValidator = v.union(
  v.literal("event"),
  v.literal("league"),
);

// Server-side caps matching lib/intake.ts. Defense in depth — a hand-rolled
// client could otherwise post arbitrarily large strings.
const MIN_QTY = 5;
const MAX_SHORT_FIELD = 200;
const MAX_BRIEF = 1000;
const MAX_QUESTIONS = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Sanity bound on deadline: a year before "now" up to ~5 years out. Keeps
// pathological values out of the index without being strict about local TZ.
const DEADLINE_PAST_GRACE_MS = 365 * 24 * 60 * 60 * 1000;
const DEADLINE_MAX_FUTURE_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function requireShort(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError(`${field} is required.`);
  if (trimmed.length > MAX_SHORT_FIELD)
    throw new ConvexError(`${field} is too long.`);
  return trimmed;
}

// Public — no auth required. Anyone landing on /intake submits through here.
// Returns the new intake's _id so the same value can later be issued as a
// portal invite token (see issue 1-03 invite-link flow).
export const submitIntake = mutation({
  args: {
    name: v.string(),
    teamName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    sport: v.string(),
    estimatedQuantity: v.number(),
    designPreference: designPreferenceValidator,
    usageContext: v.optional(v.array(usageContextValidator)),
    deadline: v.optional(v.number()),
    brief: v.string(),
    questions: v.optional(v.string()),
    inspirationLinks: v.optional(v.array(v.string())),
    newsletterOptIn: v.boolean(),
  },
  handler: async (ctx, args) => {
    const name = requireShort(args.name, "Name");
    const teamName = requireShort(args.teamName, "Team name");
    const email = args.email.trim();
    if (!EMAIL_PATTERN.test(email))
      throw new ConvexError("A valid email is required.");
    const sport = requireShort(args.sport, "Sport");

    if (
      !Number.isFinite(args.estimatedQuantity) ||
      args.estimatedQuantity < MIN_QTY
    )
      throw new ConvexError(`Quantity must be at least ${MIN_QTY}.`);

    const brief = args.brief.trim();
    if (!brief) throw new ConvexError("Brief is required.");
    if (brief.length > MAX_BRIEF) throw new ConvexError("Brief is too long.");

    const phone = args.phone?.trim();
    const questions = args.questions?.trim();
    if (questions && questions.length > MAX_QUESTIONS)
      throw new ConvexError("Questions is too long.");

    const now = Date.now();
    const deadline = args.deadline;
    if (deadline !== undefined) {
      if (!Number.isFinite(deadline))
        throw new ConvexError("Deadline must be a valid date.");
      if (deadline < now - DEADLINE_PAST_GRACE_MS)
        throw new ConvexError("Deadline can't be in the past.");
      if (deadline > now + DEADLINE_MAX_FUTURE_MS)
        throw new ConvexError("Deadline is too far in the future.");
    }

    const usageContext = args.usageContext
      ? Array.from(new Set(args.usageContext))
      : undefined;

    // Caps and shape live in lib/intake.ts so the form and this mutation can't
    // drift. Validate before the insert — a rejected list writes nothing.
    const inspirationLinks = normalizeInspirationLinks(
      args.inspirationLinks ?? [],
    );
    const linkError = validateInspirationLinks(inspirationLinks);
    if (linkError) throw new ConvexError(linkError);

    return ctx.db.insert("intakes", {
      name,
      teamName,
      email,
      ...(phone ? { phone } : {}),
      sport,
      estimatedQuantity: args.estimatedQuantity,
      designPreference: args.designPreference,
      ...(usageContext && usageContext.length > 0 ? { usageContext } : {}),
      ...(deadline !== undefined ? { deadline } : {}),
      brief,
      ...(questions ? { questions } : {}),
      ...(inspirationLinks.length > 0 ? { inspirationLinks } : {}),
      newsletterOptIn: args.newsletterOptIn,
      submittedAt: now,
    });
  },
});

// Admin lead view (issue 2-13) consumes this. Newest first.
export const listIntakes = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("intakes").withIndex("by_submittedAt").order("desc").collect();
  },
});
