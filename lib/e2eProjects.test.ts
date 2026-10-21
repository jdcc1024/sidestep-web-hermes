import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Spec: backlog/PROC-01-e2e-dev-loop.md §4 and Done when 3. Lists tests with
// Playwright's own reporter (no browser, no dev server), so it checks the real
// config + tags, not a copy of them.

type Spec = { file: string; line: number; tags?: string[]; tests: { projectName: string }[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };

function list(...args: string[]) {
  const r = spawnSync("npx", ["playwright", "test", "--list", "--reporter=json", ...args], {
    cwd: process.cwd(),
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: "" },
  });
  const out = r.stdout.slice(r.stdout.indexOf("{"));
  const specs: { spec: Spec; project: string }[] = [];
  const walk = (s: Suite) => {
    for (const sp of s.specs ?? []) for (const t of sp.tests) specs.push({ spec: sp, project: t.projectName });
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of (JSON.parse(out) as { suites: Suite[] }).suites) walk(s);
  return specs;
}
const tagged = (xs: ReturnType<typeof list>, tag: string) =>
  xs.filter((x) => (x.spec.tags ?? []).some((t) => t.replace(/^@/, "") === tag.replace(/^@/, "")));

describe("E2E project scoping (@pinned-375)", () => {
  const mobile = list("--project=mobile");
  const desktop = list("--project=desktop");

  it("should tag exactly 20 tests @pinned-375", () => {
    expect(tagged(desktop, "@pinned-375")).toHaveLength(20);
  });

  it("should not run any @pinned-375 test in the mobile project", () => {
    expect(tagged(mobile, "@pinned-375")).toHaveLength(0);
  });

  it("should still run every @pinned-375 test in the desktop project", () => {
    expect(tagged(desktop, "@pinned-375")).toHaveLength(20);
  });

  it("should drop only the tagged tests from mobile: mobile = desktop - 20", () => {
    expect(desktop.length - mobile.length).toBe(20);
  });
}, 120_000);
