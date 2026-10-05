// L-07 acceptance test (initiative 0004, phase 1): residue guard. After the
// rename no identifier says jerseyRun / runId / the old close-run names, and no
// file is named after jerseyRun. Identifiers only: copy and URLs are out of
// scope (spaced "jersey run", `/run/[id]`, `app/admin/jersey-runs/`).
// Spec: backlog/L-07-rename-jersey-runs-to-order-forms.md, Notes -> "Residue
// checks" (greps 1-3 + file-name check). Allow-list: comment lines of
// convex/_migrations.ts (its history comment).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const THIS = "lib/orderFormRename.l07.test.ts";
// Mirrors `grep -r` over source: text files only.
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css)$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (path.relative(ROOT, full) === path.join("convex", "_generated")) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(path.relative(ROOT, full));
  }
  return out;
}

const isComment = (l: string) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l);

function hits(
  dirs: string[],
  re: RegExp,
  skipFile: (rel: string) => boolean = () => false,
): string[] {
  const out: string[] = [];
  for (const d of dirs) {
    for (const rel of walk(path.join(ROOT, d))) {
      if (!TEXT.test(rel) || rel === THIS || skipFile(rel)) continue;
      readFileSync(path.join(ROOT, rel), "utf8")
        .split("\n")
        .forEach((l, i) => {
          if (!re.test(l)) return;
          // Allow-list: comment lines of convex/_migrations.ts only.
          if (rel === path.join("convex", "_migrations.ts") && isComment(l)) return;
          out.push(`${rel}:${i + 1}  ${l.trim()}`);
        });
    }
  }
  return out;
}

describe("L-07 residue guard: jerseyRuns is orderForms everywhere in code", () => {
  it("grep 1: no jerseyRun / JerseyRun / jersey_run / JERSEY_RUN identifier", () => {
    const found = hits(
      ["app", "components", "convex", "lib", "scripts"],
      /jerseyRun|JerseyRun|jersey_run|JERSEY_RUN/,
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("grep 2: no runId field outside test files", () => {
    const found = hits(["app", "components", "convex", "lib"], /\brunId\b/, (rel) =>
      /\.test\.tsx?$/.test(rel),
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("grep 3: the renamed close/expiry exports are gone", () => {
    const found = hits(
      ["app", "components", "convex", "lib"],
      /\b(closeRunByAdmin|_closeRun|_listExpiredOpenRuns|closeRunWithNotification|closeExpiredRuns|listJerseyRuns|isRunExpired|RunStatus)\b/,
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("file names: nothing under app, components, convex or lib is named *jerseyrun*", () => {
    const found: string[] = [];
    const walkNames = (dir: string) => {
      let names: string[] = [];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (name === "node_modules" || name === ".next") continue;
        const full = path.join(dir, name);
        if (/jerseyrun/i.test(name)) found.push(path.relative(ROOT, full));
        if (statSync(full).isDirectory()) walkNames(full);
      }
    };
    for (const d of ["app", "components", "convex", "lib"]) walkNames(path.join(ROOT, d));
    expect(found, found.join("\n")).toEqual([]);
  });
});
