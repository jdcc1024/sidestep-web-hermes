// @vitest-environment node
// L-05 §4 (UX §8.10): no raw `err.message` reaches a captain. Every catch in
// the portal trees goes through `userMessage(err, <fallback>)`. This reads the
// source, so it also fails the day someone reintroduces
// `toast.error(…, { description: err.message })`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const TREES = ["app/portal", "components/portal", "components/orderList", "components/run"];
const RAW = /\b(err|error|e)\.message\b/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

// `formState.errors.<field>.message` is react-hook-form validation text we
// wrote ourselves, not a thrown error.
function offending(source: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  source.split("\n").forEach((text, i) => {
    const code = text.replace(/\/\/.*$/, "");
    if (!RAW.test(code)) return;
    if (/formState\.errors/.test(code)) return;
    hits.push({ line: i + 1, text: text.trim() });
  });
  return hits;
}

describe("userMessage guard (L-05, UX §8.10)", () => {
  it("finds the portal trees (the guard is not vacuous)", () => {
    const files = TREES.flatMap((t) => sourceFiles(path.join(ROOT, t)));
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith("StartCollecting.tsx"))).toBe(true);
  });

  it("no err.message / error.message / e.message in app/portal, components/portal, components/orderList, components/run", () => {
    const found: string[] = [];
    for (const tree of TREES) {
      for (const file of sourceFiles(path.join(ROOT, tree))) {
        for (const hit of offending(readFileSync(file, "utf8"))) {
          found.push(`${path.relative(ROOT, file)}:${hit.line}  ${hit.text}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("fails when `toast.error(…, { description: err.message })` is reintroduced", () => {
    const reintroduced = [
      "} catch (err) {",
      '  toast.error("Could not save", { description: err.message });',
      "}",
    ].join("\n");
    expect(offending(reintroduced)).toHaveLength(1);
    expect(offending("catch (e) { setError(e.message); }")).toHaveLength(1);
    expect(offending("setError(error.message)")).toHaveLength(1);
  });

  it("allows react-hook-form's formState.errors…message", () => {
    expect(offending("{form.formState.errors.teamName?.message}")).toEqual([]);
  });

  it("allows the sanctioned form: userMessage(err, fallback)", () => {
    expect(
      offending('toast.error("Could not save", { description: userMessage(err, "Please try again.") });'),
    ).toEqual([]);
  });
});
