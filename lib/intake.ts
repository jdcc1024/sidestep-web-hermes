export const DESIGN_PREFERENCES = [
  "own-design",
  "needs-help",
  "undecided",
] as const;

export type DesignPreference = (typeof DESIGN_PREFERENCES)[number];

export const USAGE_CONTEXTS = ["event", "league"] as const;
export type UsageContext = (typeof USAGE_CONTEXTS)[number];

export const MIN_QUANTITY = 5;
export const BRIEF_MAX_LENGTH = 1000;
export const QUESTIONS_MAX_LENGTH = 1000;

// Inspiration is captured as links to a folder the customer already keeps
// (Drive, Dropbox, OneDrive, iCloud) — never as uploaded files. See issue 2-14:
// an open-write storage endpoint on a public form is an abuse surface we don't
// want to own. The caps below are the only defence needed for plain text.
export const MAX_INSPIRATION_LINKS = 5;
export const INSPIRATION_LINK_MAX_LENGTH = 500;

// Soft recognition only — used for a UI hint. A well-formed https URL on an
// unlisted host is still accepted; people keep inspiration in all sorts of
// places. Matched as "this exact host, or a subdomain of it", so a lookalike
// like drive.google.com.evil.tld does not slip through.
const KNOWN_SHARE_HOSTS = [
  "drive.google.com",
  "docs.google.com",
  "photos.google.com",
  "dropbox.com",
  "onedrive.live.com",
  "1drv.ms",
  "icloud.com",
] as const;

// Deadlines are captured as a YYYY-MM-DD string in the form (HTML date input)
// and converted to a UTC midnight epoch-ms number in the payload so admin
// queries can sort numerically alongside submittedAt/createdAt.
export const DEADLINE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type IntakeInput = {
  name: string;
  teamName: string;
  email: string;
  phone: string;
  sport: string;
  estimatedQuantity: number | string;
  designPreference: string;
  usageContext: string[];
  deadline: string;
  brief: string;
  questions: string;
  inspirationLinks: string[];
  newsletterOptIn: boolean;
};

export type IntakeErrors = Partial<Record<keyof IntakeInput, string>>;

export type IntakePayload = {
  name: string;
  teamName: string;
  email: string;
  phone?: string;
  sport: string;
  estimatedQuantity: number;
  designPreference: DesignPreference;
  usageContext?: UsageContext[];
  deadline?: number;
  brief: string;
  questions?: string;
  inspirationLinks?: string[];
  newsletterOptIn: boolean;
};

export const EMPTY_INTAKE: IntakeInput = {
  name: "",
  teamName: "",
  email: "",
  phone: "",
  sport: "",
  estimatedQuantity: "",
  designPreference: "",
  usageContext: [],
  deadline: "",
  brief: "",
  questions: "",
  inspirationLinks: [],
  newsletterOptIn: false,
};

// Tolerates common typing patterns ("name@x.co", trailing spaces) without
// enforcing RFC-perfect email; the back end never sends to this address in
// Phase 1, so we only need enough validation to catch obvious typos.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateIntake(input: IntakeInput): IntakeErrors {
  const errors: IntakeErrors = {};

  if (!input.name.trim()) errors.name = "Please share your name.";
  if (!input.teamName.trim())
    errors.teamName = "Tell us your team or organization name.";

  const email = input.email.trim();
  if (!email) errors.email = "We need an email to follow up.";
  else if (!EMAIL_PATTERN.test(email))
    errors.email = "That email doesn't look right.";

  if (!input.sport.trim())
    errors.sport = "Let us know the sport or activity.";

  const qty =
    typeof input.estimatedQuantity === "number"
      ? input.estimatedQuantity
      : Number.parseInt(String(input.estimatedQuantity), 10);
  if (!Number.isFinite(qty) || qty < MIN_QUANTITY)
    errors.estimatedQuantity = `Our minimum order is ${MIN_QUANTITY} jerseys.`;

  if (!isDesignPreference(input.designPreference))
    errors.designPreference = "Pick the option that fits best.";

  if (input.usageContext.some((v) => !isUsageContext(v)))
    errors.usageContext = "Pick a valid option.";

  const deadline = input.deadline.trim();
  if (deadline) {
    const ts = parseDeadlineToMs(deadline);
    if (ts === null) errors.deadline = "Pick a valid date.";
    else if (ts < startOfTodayUtcMs())
      errors.deadline = "Deadline can't be in the past.";
  }

  const brief = input.brief.trim();
  if (!brief) errors.brief = "Tell us a bit about your team.";
  else if (brief.length > BRIEF_MAX_LENGTH)
    errors.brief = `Please keep this under ${BRIEF_MAX_LENGTH} characters.`;

  if (input.questions.trim().length > QUESTIONS_MAX_LENGTH)
    errors.questions = `Please keep this under ${QUESTIONS_MAX_LENGTH} characters.`;

  const linkError = validateInspirationLinks(input.inspirationLinks);
  if (linkError) errors.inspirationLinks = linkError;

  return errors;
}

// Trims, drops rows the visitor left blank, and dedupes while preserving the
// order they were entered in.
export function normalizeInspirationLinks(links: string[]): string[] {
  return Array.from(
    new Set(links.map((link) => link.trim()).filter(Boolean)),
  );
}

// Returns a human-readable message, or null when the list is acceptable.
// Shared by the browser form and the Convex mutation so both agree on what
// counts as a usable link.
export function validateInspirationLinks(links: string[]): string | null {
  const cleaned = normalizeInspirationLinks(links);

  if (cleaned.length > MAX_INSPIRATION_LINKS)
    return `Please share at most ${MAX_INSPIRATION_LINKS} links.`;

  for (const link of cleaned) {
    if (link.length > INSPIRATION_LINK_MAX_LENGTH)
      return `That link is too long — please keep each one under ${INSPIRATION_LINK_MAX_LENGTH} characters.`;
    if (!isHttpsUrl(link))
      return "Each link needs to be a full https:// address you can paste into a browser.";
  }

  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// Soft check for the UI hint only — never a reason to reject a submission.
export function isKnownShareHost(value: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  return KNOWN_SHARE_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

export function isDesignPreference(value: string): value is DesignPreference {
  return (DESIGN_PREFERENCES as readonly string[]).includes(value);
}

export function isUsageContext(value: string): value is UsageContext {
  return (USAGE_CONTEXTS as readonly string[]).includes(value);
}

// Parses "YYYY-MM-DD" into UTC-midnight epoch ms. Returns null for any
// shape that isn't a real calendar date (including 2026-02-30).
export function parseDeadlineToMs(value: string): number | null {
  if (!DEADLINE_INPUT_PATTERN.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  )
    return null;
  return ms;
}

function startOfTodayUtcMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function toIntakePayload(input: IntakeInput): IntakePayload {
  const phone = input.phone.trim();
  const questions = input.questions.trim();
  const deadline = input.deadline.trim();
  const qty =
    typeof input.estimatedQuantity === "number"
      ? input.estimatedQuantity
      : Number.parseInt(String(input.estimatedQuantity), 10);

  if (!isDesignPreference(input.designPreference))
    throw new Error("Invalid design preference");

  const usageContext = Array.from(new Set(input.usageContext)).filter(
    isUsageContext,
  );

  const deadlineMs = deadline ? parseDeadlineToMs(deadline) : null;
  if (deadline && deadlineMs === null)
    throw new Error("Invalid deadline date");

  const inspirationLinks = normalizeInspirationLinks(input.inspirationLinks);
  const linkError = validateInspirationLinks(inspirationLinks);
  if (linkError) throw new Error(linkError);

  return {
    name: input.name.trim(),
    teamName: input.teamName.trim(),
    email: input.email.trim(),
    ...(phone ? { phone } : {}),
    sport: input.sport.trim(),
    estimatedQuantity: qty,
    designPreference: input.designPreference,
    ...(usageContext.length > 0 ? { usageContext } : {}),
    ...(deadlineMs !== null ? { deadline: deadlineMs } : {}),
    brief: input.brief.trim(),
    ...(questions ? { questions } : {}),
    ...(inspirationLinks.length > 0 ? { inspirationLinks } : {}),
    newsletterOptIn: input.newsletterOptIn,
  };
}
