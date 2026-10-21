import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// "Same tree" has one definition (backlog/PROC-01-e2e-dev-loop.md §1), shared by
// scripts/verify.mjs and scripts/e2e.mjs. Plain Node imports this file directly,
// so: erasable TypeScript only, `node:` builtins only, no `@/` imports.

/**
 * Hash of the full working tree (tracked changes + untracked non-ignored files),
 * via `git write-tree` of a temporary index. The real index is never touched.
 */
export function treeHash(cwd: string): string {
  const idx = path.join(
    process.env.TMPDIR ?? os.tmpdir(),
    `verify-idx-${process.pid}-${Date.now()}`,
  );
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    execFileSync("git", ["add", "-A"], { cwd, env, stdio: "pipe" });
    return execFileSync("git", ["write-tree"], { cwd, env, encoding: "utf-8" }).trim();
  } finally {
    fs.rmSync(idx, { force: true });
  }
}
