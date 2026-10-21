import { describe, expect, it } from "vitest";
import { checkReceipt, summarizeRun } from "./e2eReceipt";

// Spec: backlog/PROC-01-e2e-dev-loop.md §2 (receipt) and §3 (summarizeRun).

const TREE = "a".repeat(40);
const OTHER = "b".repeat(40);

function receipt(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    tree: TREE,
    head: "c".repeat(40),
    finishedAt: "2026-10-22T03:14:00.000Z",
    playwright: "1.61.1",
    counts: { passed: 98, failed: 0, flaky: 1, skipped: 13 },
    flaky: [],
    logs: { full: "/repo/.e2e-logs/x-full.log" },
    ...over,
  };
}
const raw = (o: unknown) => JSON.stringify(o);

describe("checkReceipt", () => {
  it("should accept a valid receipt whose tree matches the current tree", () => {
    const r = checkReceipt(raw(receipt()), TREE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.receipt.tree).toBe(TREE);
  });

  it("should reject a receipt written for a different tree as tree-changed", () => {
    const r = checkReceipt(raw(receipt()), OTHER);
    expect(r).toEqual({ ok: false, reason: "tree-changed" });
  });

  it("should report a null receipt as missing", () => {
    expect(checkReceipt(null, TREE)).toEqual({ ok: false, reason: "missing" });
  });

  it("should report non-JSON as unreadable", () => {
    expect(checkReceipt("{not json", TREE)).toEqual({
      ok: false,
      reason: "unreadable",
    });
    expect(checkReceipt("", TREE)).toEqual({ ok: false, reason: "unreadable" });
  });

  it.each([
    ["wrong version", receipt({ version: 2 })],
    ["tree not 40-hex", receipt({ tree: "abc123" })],
    ["no logs.full", receipt({ logs: {} })],
    ["failed tests", receipt({ counts: { passed: 97, failed: 1, flaky: 0, skipped: 13 } })],
    ["JSON null", null],
    ["JSON array", []],
  ])("should report %s as unreadable, never as a match", (_n, body) => {
    const r = checkReceipt(raw(body), TREE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unreadable");
  });

  it("should check validity before the tree: a corrupt receipt for another tree is unreadable", () => {
    const r = checkReceipt(raw(receipt({ version: 9 })), OTHER);
    expect(r).toEqual({ ok: false, reason: "unreadable" });
  });
});

// --- Playwright JSON reporter fixtures (suites[].specs[].tests[]) ---

type T = { file: string; line: number; col?: number; project: string; status: string; title?: string };

function report(tests: T[]) {
  return {
    errors: [],
    suites: [
      {
        title: "outer.spec.ts",
        suites: [
          {
            title: "inner",
            specs: tests.map((t) => ({
              title: t.title ?? `test at ${t.line}`,
              file: t.file,
              line: t.line,
              column: t.col ?? 5,
              tests: [
                {
                  projectName: t.project,
                  status: t.status,
                  results: [{ status: t.status === "expected" ? "passed" : t.status === "skipped" ? "skipped" : "failed" }],
                },
              ],
            })),
          },
        ],
      },
    ],
  };
}

const A = { file: "e2e/a.spec.ts", line: 10, project: "desktop" };
const B = { file: "e2e/b.spec.ts", line: 20, project: "mobile" };
const C = { file: "e2e/c.spec.ts", line: 30, project: "desktop" };

describe("summarizeRun", () => {
  it("should pass with no flaky and no failed when nothing failed and no rerun was needed", () => {
    const full = report([
      { ...A, status: "expected" },
      { ...B, status: "expected" },
      { ...C, status: "skipped" },
    ]);
    const s = summarizeRun(full, null);
    expect(s.pass).toBe(true);
    expect(s.flaky).toEqual([]);
    expect(s.failed).toEqual([]);
    expect(s.counts).toMatchObject({ passed: 2, failed: 0, flaky: 0, skipped: 1 });
  });

  it("should pass and list a test that failed in the full run and passed on rerun as flaky", () => {
    const full = report([
      { ...A, status: "expected" },
      { ...B, status: "unexpected", title: "375px: flaky one" },
    ]);
    const rerun = report([{ ...B, status: "expected", title: "375px: flaky one" }]);
    const s = summarizeRun(full, rerun);
    expect(s.pass).toBe(true);
    expect(s.failed).toEqual([]);
    expect(s.flaky).toHaveLength(1);
    expect(s.flaky[0]).toMatchObject({ file: B.file, line: B.line, project: "mobile" });
    expect(s.counts.flaky).toBe(1);
    expect(s.counts.failed).toBe(0);
  });

  it("should fail and list a test that failed in both runs", () => {
    const full = report([
      { ...A, status: "unexpected" },
      { ...B, status: "expected" },
    ]);
    const rerun = report([{ ...A, status: "unexpected" }]);
    const s = summarizeRun(full, rerun);
    expect(s.pass).toBe(false);
    expect(s.failed).toHaveLength(1);
    expect(s.failed[0]).toMatchObject({ file: A.file, line: A.line, project: "desktop" });
    expect(s.flaky).toEqual([]);
    expect(s.counts.failed).toBe(1);
  });

  it("should fail when a failing test is absent from the rerun report", () => {
    const full = report([{ ...A, status: "unexpected" }]);
    const s = summarizeRun(full, report([]));
    expect(s.pass).toBe(false);
    expect(s.failed).toHaveLength(1);
  });

  it("should fail when there was a failure and no rerun report at all", () => {
    const s = summarizeRun(report([{ ...A, status: "unexpected" }]), null);
    expect(s.pass).toBe(false);
    expect(s.failed).toHaveLength(1);
  });

  it("should match across reports by file, line, column and project, not title alone", () => {
    // Same file+line+column in two projects: only the desktop one passes on rerun.
    const full = report([
      { ...A, project: "desktop", status: "unexpected" },
      { ...A, project: "mobile", status: "unexpected" },
    ]);
    const rerun = report([
      { ...A, project: "desktop", status: "expected" },
      { ...A, project: "mobile", status: "unexpected" },
    ]);
    const s = summarizeRun(full, rerun);
    expect(s.pass).toBe(false);
    expect(s.flaky.map((f) => f.project)).toEqual(["desktop"]);
    expect(s.failed.map((f) => f.project)).toEqual(["mobile"]);
  });

  it("should treat a different column on the same line as a different test", () => {
    const full = report([{ ...A, col: 5, status: "unexpected" }]);
    const rerun = report([{ ...A, col: 9, status: "expected" }]);
    const s = summarizeRun(full, rerun);
    expect(s.pass).toBe(false);
  });
});
