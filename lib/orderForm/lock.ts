// The order form's open/closed state. A run's stored status is
// `open | closed`; the deadline only closes the form (L-06, Q1 = A). Lazy on
// read: no scheduler flips a run when its deadline passes, this resolver
// computes the true status fresh on every read/mutation. Whether the *list*
// is locked is a different question, answered by the order's
// "Order Size Confirmed" stage (lib/orderItem/lock).

export type FormStatus = "open" | "closed";

export type FormRun = {
  status: FormStatus;
  deadline: number;
};

export function effectiveStatus(
  run: FormRun,
  now: number = Date.now(),
): FormStatus {
  if (run.status === "open" && run.deadline < now) return "closed";
  return run.status;
}
