import { readFileSync } from "node:fs";
import path from "node:path";
import { formatEgressReport, parseEgressLog } from "../../lib/e2eEgress";

// IMG-02: prints one line on how much the run pulled from Convex storage.
// Each test's `storageEgress` fixture (fixtures.ts) appends a JSON line to
// EGRESS_LOG; workers are separate processes, so the run's total goes
// through a file. Playwright empties `test-results/` before global setup,
// which then creates the log, so nothing wipes it mid-run.
export const EGRESS_LOG = path.resolve(
  __dirname,
  "../../test-results/egress.jsonl",
);

export default async function globalTeardown() {
  let text = "";
  try {
    text = readFileSync(EGRESS_LOG, "utf8");
  } catch {
    // No log (setup failed before creating it): report zeros.
  }
  console.log(formatEgressReport(parseEgressLog(text)));
}
