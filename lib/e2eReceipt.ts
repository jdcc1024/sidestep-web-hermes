// E2E receipt rules (backlog/PROC-01-e2e-dev-loop.md §2, §3), used by
// scripts/e2e.mjs. Plain Node imports this file directly, so: erasable
// TypeScript only, no imports at all.

export type E2eTestRef = { file: string; line: number; project: string; title: string };

export type E2eCounts = { passed: number; failed: number; flaky: number; skipped: number };

export type E2eReceipt = {
  version: 1;
  tree: string;
  head: string;
  finishedAt: string;
  playwright: string;
  counts: E2eCounts;
  flaky: E2eTestRef[];
  logs: { full: string; rerun?: string };
};

export type ReceiptCheck =
  | { ok: true; receipt: E2eReceipt }
  | { ok: false; reason: "missing" | "unreadable" | "tree-changed" };

export type RunSummary = {
  pass: boolean;
  counts: E2eCounts;
  flaky: E2eTestRef[];
  failed: E2eTestRef[];
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isValidReceipt(v: unknown): v is E2eReceipt {
  if (!isObject(v)) return false;
  if (v.version !== 1) return false;
  if (typeof v.tree !== "string" || !/^[0-9a-f]{40}$/.test(v.tree)) return false;
  if (!isObject(v.logs) || typeof v.logs.full !== "string") return false;
  return isObject(v.counts) && v.counts.failed === 0;
}

/** Validity is checked before the tree, so a corrupt receipt never reads as "tree changed". */
export function checkReceipt(raw: string | null, tree: string): ReceiptCheck {
  if (raw === null) return { ok: false, reason: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!isValidReceipt(parsed)) return { ok: false, reason: "unreadable" };
  if (parsed.tree !== tree) return { ok: false, reason: "tree-changed" };
  return { ok: true, receipt: parsed };
}

type ReportTest = { key: string; ref: E2eTestRef; status: string };

/** Flattens a Playwright JSON report's `suites[].suites[]…specs[].tests[]`. */
function reportTests(report: unknown): ReportTest[] {
  const out: ReportTest[] = [];
  const walk = (suite: unknown) => {
    if (!isObject(suite)) return;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (!isObject(spec)) continue;
      const file = String(spec.file);
      const line = Number(spec.line);
      const title = String(spec.title);
      for (const t of Array.isArray(spec.tests) ? spec.tests : []) {
        if (!isObject(t)) continue;
        const project = String(t.projectName);
        out.push({
          key: `${file}:${line}:${String(spec.column)}:${project}`,
          ref: { file, line, project, title },
          status: String(t.status),
        });
      }
    }
    for (const child of Array.isArray(suite.suites) ? suite.suites : []) walk(child);
  };
  if (isObject(report) && Array.isArray(report.suites)) report.suites.forEach(walk);
  return out;
}

const passed = (status: string) => status === "expected" || status === "flaky";

/**
 * A test that failed in `full` is flaky if it passed in `rerun` (matched by
 * file:line:column:project), otherwise failed — including when it is absent
 * from the rerun or there was no rerun.
 */
export function summarizeRun(full: unknown, rerun: unknown): RunSummary {
  const rerunStatus = new Map(reportTests(rerun).map((t) => [t.key, t.status]));
  const counts: E2eCounts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  const flaky: E2eTestRef[] = [];
  const failed: E2eTestRef[] = [];

  for (const t of reportTests(full)) {
    if (t.status === "expected") counts.passed++;
    else if (t.status === "skipped") counts.skipped++;
    else if (t.status === "flaky") flaky.push(t.ref);
    else {
      const again = rerunStatus.get(t.key);
      if (again !== undefined && passed(again)) flaky.push(t.ref);
      else failed.push(t.ref);
    }
  }
  counts.flaky = flaky.length;
  counts.failed = failed.length;
  return { pass: failed.length === 0, counts, flaky, failed };
}
