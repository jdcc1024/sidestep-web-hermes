#!/usr/bin/env node
/**
 * E2E receipt — the full Playwright suite runs once per tree.
 *
 * `full` runs the whole suite, reruns only what failed (once, --last-failed),
 * and on a pass writes .e2e-receipt.json pinned to the tree hash. `check` exits
 * 0 only if that receipt matches the current tree. Spec:
 * backlog/PROC-01-e2e-dev-loop.md §2–§3.
 *
 * Usage:
 *   node scripts/e2e.mjs full    # npm run e2e:full
 *   node scripts/e2e.mjs check   # npm run e2e:check
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeHash } from '../lib/treeHash.ts';
import { checkReceipt, summarizeRun } from '../lib/e2eReceipt.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT = path.join(ROOT, '.e2e-receipt.json');
const LOGS = path.join(ROOT, '.e2e-logs');
const PLAYWRIGHT = path.join(ROOT, 'node_modules', '.bin', 'playwright');
const USAGE = 'usage: node scripts/e2e.mjs full | check';

const [command, ...extra] = process.argv.slice(2);

if (command === 'full') {
  if (extra.length > 0) {
    console.error('e2e:full runs the whole suite; use `npx playwright test <files>` for a subset');
    process.exit(2);
  }
  process.exit(await full());
} else if (command === 'check') {
  process.exit(check());
} else {
  console.error(USAGE);
  process.exit(2);
}

async function full() {
  // Any old receipt dies now — a failed or aborted run must not leave a valid one behind.
  fs.rmSync(RECEIPT, { force: true });
  const tree0 = treeHash(ROOT);
  fs.mkdirSync(LOGS, { recursive: true });
  const base = path.join(LOGS, `${stamp(new Date())}-${tree0.slice(0, 12)}`);

  const fullRun = await playwright([], `${base}-full`);
  if (!fullRun.report) return environmentFailure(fullRun.log);

  let rerunRun = null;
  if (summarizeRun(fullRun.report, null).failed.length > 0) {
    console.log('\n[e2e] failures in the full run; rerunning only those, once (--last-failed)\n');
    rerunRun = await playwright(['--last-failed'], `${base}-rerun`);
    if (!rerunRun.report) return environmentFailure(rerunRun.log);
  }

  if (treeHash(ROOT) !== tree0) {
    console.error('files changed during the run; no receipt');
    return 1;
  }

  const summary = summarizeRun(fullRun.report, rerunRun?.report ?? null);
  // The JSON reporter's spec.file is relative to testDir; print and record repo paths (e2e/…).
  const rootDir = fullRun.report.config?.rootDir;
  const repoPath = (t) => (rootDir ? { ...t, file: path.relative(ROOT, path.resolve(rootDir, t.file)) } : t);
  summary.flaky = summary.flaky.map(repoPath);
  summary.failed = summary.failed.map(repoPath);
  const logs = { full: fullRun.log, ...(rerunRun ? { rerun: rerunRun.log } : {}) };
  const { passed, failed, flaky, skipped } = summary.counts;

  if (!summary.pass) {
    console.error('');
    for (const t of summary.failed) console.error(`failed: ${describe(t)}`);
    console.error(`e2e:full FAIL tree ${tree0.slice(0, 12)}: ${failed} failed, ${passed} passed, ${flaky} flaky, ${skipped} skipped; no receipt`);
    for (const log of Object.values(logs)) console.error(`log ${log}`);
    return 1;
  }

  const receipt = {
    version: 1,
    tree: tree0,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).trim(),
    finishedAt: new Date().toISOString(),
    playwright: playwrightVersion(),
    counts: summary.counts,
    flaky: summary.flaky,
    logs,
  };
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2));
  console.log('');
  for (const t of summary.flaky) console.log(`flake: ${describe(t)}`);
  console.log(`e2e:full PASS tree ${tree0.slice(0, 12)}: ${passed} passed, ${flaky} flaky, ${skipped} skipped; log ${fullRun.log}`);
  return 0;
}

function check() {
  const raw = fs.existsSync(RECEIPT) ? fs.readFileSync(RECEIPT, 'utf-8') : null;
  const tree = treeHash(ROOT);
  const result = checkReceipt(raw, tree);
  if (result.ok) {
    const r = result.receipt;
    console.log(`match: full run ${r.finishedAt}, ${r.counts.passed} passed, ${r.counts.flaky} flaky, log ${r.logs.full}`);
    return 0;
  }
  if (result.reason === 'missing') console.error('no receipt');
  else if (result.reason === 'unreadable') console.error('unreadable receipt');
  else {
    // checkReceipt only says tree-changed for a receipt that parsed and is valid.
    const receiptTree = JSON.parse(raw).tree;
    console.error(`tree changed: receipt ${receiptTree.slice(0, 12)} ≠ current ${tree.slice(0, 12)}`);
  }
  console.error('run npm run e2e:full');
  return 1;
}

/**
 * Runs Playwright with list + JSON reporters, teeing its output to the console
 * and `<base>.log`. Resolves `report: null` when the run produced no usable
 * report (missing, unparsable, top-level errors, or a non-zero exit with no
 * failed test to explain it): an environment failure, not a test result.
 */
function playwright(args, base) {
  const log = `${base}.log`;
  const json = `${base}.json`;
  const out = fs.createWriteStream(log);
  const child = spawn(PLAYWRIGHT, ['test', '--reporter=list,json', ...args], {
    cwd: ROOT,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: json },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { process.stdout.write(chunk); out.write(chunk); });
  child.stderr.on('data', (chunk) => { process.stderr.write(chunk); out.write(chunk); });

  return new Promise((resolve) => {
    const finish = (code) => out.end(() => resolve({ log, report: usableReport(json, code) }));
    child.on('error', (err) => { out.write(`\n[e2e] could not start playwright: ${err.message}\n`); finish(null); });
    child.on('close', (code) => finish(code));
  });
}

function usableReport(json, exitCode) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(json, 'utf-8'));
  } catch {
    return null;
  }
  if (typeof report !== 'object' || report === null) return null;
  if (Array.isArray(report.errors) && report.errors.length > 0) return null;
  if (exitCode !== 0 && summarizeRun(report, null).failed.length === 0) return null;
  return report;
}

function environmentFailure(log) {
  console.error(`no usable report: environment failure, see ${log}`);
  return 1;
}

function playwrightVersion() {
  const pkg = path.join(ROOT, 'node_modules', '@playwright', 'test', 'package.json');
  return JSON.parse(fs.readFileSync(pkg, 'utf-8')).version;
}

/** UTC `YYYYMMDDTHHMMSSZ`. */
function stamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function describe(t) {
  return `${t.file}:${t.line} [${t.project}] ${t.title}`;
}
