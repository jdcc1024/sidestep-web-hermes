import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily closure sweep. Vancouver is UTC-8 (PST) or UTC-7 (PDT). Cron
// times in Convex are UTC, so 08:00 UTC = midnight PT during PST and
// 01:00 PT during PDT — close enough to "early morning" for the captain
// to wake up to a closed-run summary. The action is idempotent, so a
// missed or duplicated run is safe.
crons.daily(
  "close expired order forms",
  { hourUTC: 8, minuteUTC: 0 },
  internal.orderFormActions.closeExpiredForms,
);

export default crons;
