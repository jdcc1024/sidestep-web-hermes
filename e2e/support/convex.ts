import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// Thin wrapper over `npx convex run` for the internal E2E helpers in
// convex/_e2e.ts. Runs against the deployment in .env.local (dev only).

function run<T>(fn: string, args: Record<string, unknown>): T {
  if (!/^dev:/.test(process.env.CONVEX_DEPLOYMENT ?? "")) {
    throw new Error(
      "E2E refuses to run: CONVEX_DEPLOYMENT is not a dev deployment.",
    );
  }
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out.slice(out.search(/[[{]/))) as T;
}

/**
 * Who owns the seeded rows. "admin" is SNAP_UID (an admin in Clerk). "captain"
 * is the optional non-admin E2E_CAPTAIN_UID: admins can always edit, so any
 * check of what a plain captain can't do needs that account.
 */
export type As = "admin" | "captain";

export const captainConfigured = () =>
  Boolean(process.env.E2E_CAPTAIN_UID && process.env.E2E_CAPTAIN_PWD);

const email = (as: As = "admin") => {
  const uid =
    as === "captain" ? process.env.E2E_CAPTAIN_UID : process.env.SNAP_UID;
  if (!uid)
    throw new Error(
      as === "captain" ? "E2E_CAPTAIN_UID is not set" : "SNAP_UID is not set",
    );
  return uid;
};

/** A unique per-test tag: every row the test makes carries it. */
export const newTag = () =>
  `e2e-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;

export type SeededOrder = {
  orderId: string;
  designId: string;
  teamName: string;
};

export const seedOrder = (tag: string, as: As = "admin") =>
  run<SeededOrder>("_e2e:seedOrder", { email: email(as), tag });

export type SeedItem = {
  name?: string;
  number?: string;
  size?: string;
  qty?: number;
};

/** Puts items on the seeded order's design. */
export const seedItems = (
  tag: string,
  orderId: string,
  items: SeedItem[],
  as: As = "admin",
) =>
  run<{ count: number }>("_e2e:seedItems", {
    email: email(as),
    tag,
    orderId,
    items,
  });

/** Checks or unchecks "Order Size Confirmed", bypassing the admin gate. */
export const setConfirmed = (
  tag: string,
  orderId: string,
  confirmed: boolean,
  as: As = "admin",
) =>
  run<{ ok: true }>("_e2e:setConfirmed", {
    email: email(as),
    tag,
    orderId,
    confirmed,
  });

const accounts = (): As[] =>
  captainConfigured() ? ["admin", "captain"] : ["admin"];

export const cleanup = (tag: string) => {
  for (const as of accounts()) run("_e2e:cleanup", { email: email(as), tag });
};

/** Rows from crashed runs: any E2E row older than an hour. */
export const sweepStale = () => {
  for (const as of accounts()) {
    try {
      run("_e2e:cleanup", { email: email(as), olderThanMs: 60 * 60 * 1000 });
    } catch {
      // A captain who has never signed in has no users row yet: nothing to sweep.
    }
  }
};

/** Adds a second (third, ...) design to a seeded order. Title: `E2E <tag> <title>`. */
export const addDesign = (
  tag: string,
  orderId: string,
  title: string,
  as: As = "admin",
) =>
  run<{ designId: string }>("_e2e:addDesign", {
    email: email(as),
    tag,
    orderId,
    title,
  });

/**
 * Stores a small generated file and attaches it to an E2E design (0004
 * R3-01). `kind: "png"` is a 1x1 picture, `"pdf"` a minimal PDF. `isMain`
 * flags it as the design's main file.
 */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF_MIN = Buffer.from("%PDF-1.1\n%%EOF\n").toString("base64");

export const attachFile = (
  designId: string,
  kind: "png" | "pdf",
  isMain = true,
) =>
  run<{ ok: true }>("_e2e:attachFile", {
    designId,
    base64: kind === "png" ? PNG_1X1 : PDF_MIN,
    contentType: kind === "png" ? "image/png" : "application/pdf",
    filename: kind === "png" ? "e2e-main.png" : "e2e-print.pdf",
    isMain,
  });
