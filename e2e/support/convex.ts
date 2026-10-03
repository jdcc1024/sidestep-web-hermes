import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// Thin wrapper over `npx convex run` for the internal E2E helpers in
// convex/_e2e.ts. Runs against the deployment in .env.local (dev only).

function run<T>(fn: string, args: Record<string, unknown>): T {
  if (!/^dev:/.test(process.env.CONVEX_DEPLOYMENT ?? "")) {
    throw new Error("E2E refuses to run: CONVEX_DEPLOYMENT is not a dev deployment.");
  }
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out.slice(out.search(/[[{]/))) as T;
}

const email = () => {
  const uid = process.env.SNAP_UID;
  if (!uid) throw new Error("SNAP_UID is not set");
  return uid;
};

/** A unique per-test tag: every row the test makes carries it. */
export const newTag = () => `e2e-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;

export type SeededOrder = { orderId: string; designId: string; teamName: string };

export const seedOrder = (tag: string) =>
  run<SeededOrder>("_e2e:seedOrder", { email: email(), tag });

export const cleanup = (tag: string) =>
  run<{ orders: number; designs: number; rows: number }>("_e2e:cleanup", { email: email(), tag });

/** Rows from crashed runs: any E2E row older than an hour. */
export const sweepStale = () =>
  run<{ orders: number }>("_e2e:cleanup", { email: email(), olderThanMs: 60 * 60 * 1000 });
