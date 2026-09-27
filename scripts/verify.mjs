#!/usr/bin/env node
/**
 * Verify gate — the only way to earn a receipt.
 *
 * Runs typecheck + lint + tests (add --build for config/deps/routing changes).
 * On success, writes .verify-receipt.json containing a hash of the exact
 * working-tree state that passed. The receipt is proof that verify passed on
 * this exact tree: if its hash doesn't match the current tree, the files have
 * changed since and "verified" no longer holds.
 *
 * Usage:
 *   node scripts/verify.mjs           # typecheck + lint + test
 *   node scripts/verify.mjs --build   # also next build
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT = path.join(ROOT, '.verify-receipt.json');

/** Hash of the full working tree (tracked changes + untracked non-ignored files). */
function treeHash() {
  const idx = path.join(os.tmpdir(), `verify-idx-${process.pid}-${Date.now()}`);
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    execSync('git add -A', { cwd: ROOT, env, stdio: 'pipe' });
    return execSync('git write-tree', { cwd: ROOT, env, encoding: 'utf-8' }).trim();
  } finally {
    fs.rmSync(idx, { force: true });
  }
}

const steps = [
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['test', 'npm test'],
];
if (process.argv.includes('--build')) steps.push(['build', 'npm run build']);

// Any stale receipt dies now — failing halfway must not leave a valid one behind.
fs.rmSync(RECEIPT, { force: true });

for (const [name, cmd] of steps) {
  console.log(`\n[verify] ${name}: ${cmd}`);
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n[verify] FAILED at ${name} — no receipt written.`);
    process.exit(1);
  }
}

const receipt = {
  tree: treeHash(),
  verifiedAt: new Date().toISOString(),
  steps: steps.map(s => s[0]),
};
fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2));
console.log(`\n[verify] PASS — receipt written for tree ${receipt.tree.slice(0, 12)}.`);
console.log('[verify] Note: any further file change invalidates the receipt; re-run verify before completing.');
