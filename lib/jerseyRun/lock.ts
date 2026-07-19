// Lock & freeze (R-06). A run's status is `open | closed | locked` — the
// single source of truth (PRD roster-manager-and-lock.md §6, "no parallel
// flag"). Auto-lock is lazy on read: no scheduler flips a run to `locked`
// when its deadline passes, this resolver just computes the true status
// fresh on every read/mutation.

export type LockableRun = {
  status: "open" | "closed" | "locked";
  deadline: number;
};

export type EffectiveRunStatus = "open" | "closed" | "locked";

// Only an "open" run auto-locks when its deadline passes. A "closed" run
// stays "closed" even past its deadline — that's the state `unlock()`
// (via `statusAfterUnlock` below) puts a run in when an admin reopens it
// after the deadline has already passed. Without this distinction, that
// admin unlock would be undone on the very next read: `effectiveStatus`
// would see the (still past) deadline and lock it right back.
export function effectiveStatus(
  run: LockableRun,
  now: number = Date.now(),
): EffectiveRunStatus {
  if (run.status === "open" && run.deadline < now) return "locked";
  return run.status;
}

export function isLocked(run: LockableRun, now: number = Date.now()): boolean {
  return effectiveStatus(run, now) === "locked";
}

// Checked against the *stored* status, not the effective one: an "open"
// run whose deadline has already passed (lazily locked, but never
// materialized) can still be explicitly locked — that's how it gets a
// snapshot recorded. Only an already-stored "locked" run rejects a
// second lock.
export function canLock(run: Pick<LockableRun, "status">): boolean {
  return run.status !== "locked";
}

// Admin can always unlock; a captain only while the deadline hasn't
// passed (PRD §6, "Lock reversibility").
export function canUnlock(
  run: LockableRun,
  actor: { isAdmin: boolean },
  now: number = Date.now(),
): boolean {
  if (!isLocked(run, now)) return false;
  if (actor.isAdmin) return true;
  return run.deadline >= now;
}

// The status an unlocked run reverts to. Still ahead of its deadline →
// fully reopened ("open"). Already past its deadline → "closed", so the
// unlock sticks instead of being immediately reversed by the lazy
// auto-lock check above.
export function statusAfterUnlock(
  run: LockableRun,
  now: number = Date.now(),
): "open" | "closed" {
  return run.deadline >= now ? "open" : "closed";
}
