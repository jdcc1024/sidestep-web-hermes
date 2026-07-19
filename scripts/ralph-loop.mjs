#!/usr/bin/env node
/**
 * Ralph Loop — autonomous build runner
 *
 * Repeatedly spawns a fresh `claude -p` session (fresh context = smart zone)
 * that picks ONE unblocked DAG task, implements it per CLAUDE.md, and exits.
 * The loop handles orchestration; the agent handles one task.
 *
 * Usage:
 *   node scripts/ralph-loop.mjs [options]
 *
 * Options:
 *   --max-iterations <n>   Stop after n iterations (default: 5)
 *   --model <model>        Passed to claude (e.g. opus, sonnet)
 *   --timeout <minutes>    Kill an iteration after n minutes (default: 60)
 *   --dry-run              Show what would run (eligible tasks, command) and exit
 *
 * Stop conditions (any):
 *   - No eligible tasks left (pending, deps complete, not needs-human)
 *   - Max iterations reached
 *   - 2 consecutive iterations with no progress (no new commit AND no DAG change)
 *   - A file named STOP exists in the repo root (create it to halt gracefully)
 *
 * Safety:
 *   - Refuses to start on a dirty git tree
 *   - Never pushes; you review via /review-batch and push yourself
 *   - Each iteration's output is logged to docs/review/loop-runs/
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAG_FILE = path.join(ROOT, 'dag.json');
const PROMPT_FILE = path.join(ROOT, 'scripts', 'ralph-prompt.md');
const STOP_FILE = path.join(ROOT, 'STOP');
const LOG_DIR = path.join(ROOT, 'docs', 'review', 'loop-runs');

// --- args ---
const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const MAX_ITER = parseInt(flag('max-iterations', '5'), 10);
const MODEL = flag('model', null);
const TIMEOUT_MS = parseInt(flag('timeout', '60'), 10) * 60 * 1000;
const DRY_RUN = argv.includes('--dry-run');

// --- helpers ---
function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
}

function readDag() {
  return JSON.parse(fs.readFileSync(DAG_FILE, 'utf-8'));
}

function eligibleTasks(dag) {
  return dag.nodes.filter(n => {
    if (n.status !== 'pending' || n.needsHuman) return false;
    const deps = dag.edges.filter(e => e.to === n.id);
    return deps.every(e => {
      const dep = dag.nodes.find(x => x.id === e.from);
      return dep && (dep.status === 'completed' || dep.status === 'obsolete');
    });
  });
}

function dagFingerprint(dag) {
  return dag.nodes.map(n => `${n.id}:${n.status}${n.needsHuman ? ':nh' : ''}`).join('|');
}

function summarize(dag) {
  const counts = {};
  dag.nodes.forEach(n => { counts[n.status] = (counts[n.status] || 0) + 1; });
  const nh = dag.nodes.filter(n => n.needsHuman).length;
  return `${JSON.stringify(counts)}${nh ? ` | needs-human: ${nh}` : ''}`;
}

function runIteration(iter, logFile) {
  const prompt = fs.readFileSync(PROMPT_FILE, 'utf-8');
  // Prompt is piped over stdin, not passed as an argv string: on Windows, spawn's
  // shell:true routes through cmd.exe, whose line-based parser mangles any argument
  // containing a newline (truncates at the first line break, regardless of quoting).
  const args = ['-p', '--dangerously-skip-permissions'];
  if (MODEL) args.push('--model', MODEL);

  return new Promise(resolve => {
    const child = spawn('claude', args, { cwd: ROOT, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(logFile, { flags: 'a' });
    log.write(`\n===== Iteration ${iter} — ${new Date().toISOString()} =====\n`);

    const timer = setTimeout(() => {
      log.write('\n[ralph-loop] TIMEOUT — killing iteration\n');
      child.kill('SIGTERM');
    }, TIMEOUT_MS);

    child.stdout.on('data', d => { process.stdout.write(d); log.write(d); });
    child.stderr.on('data', d => { process.stderr.write(d); log.write(d); });
    child.on('close', code => {
      clearTimeout(timer);
      log.end(`\n[ralph-loop] iteration ${iter} exited with code ${code}\n`);
      resolve(code);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// --- main ---
async function main() {
  // Preflight
  if (!fs.existsSync(PROMPT_FILE)) {
    console.error('Missing scripts/ralph-prompt.md'); process.exit(1);
  }
  const dirty = sh('git status --porcelain');
  if (dirty && !DRY_RUN) {
    console.error('Git tree is dirty — commit or stash before running the loop:\n' + dirty);
    process.exit(1);
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const runStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = path.join(LOG_DIR, `run-${runStamp}.log`);

  let noProgressStreak = 0;

  for (let iter = 1; iter <= MAX_ITER; iter++) {
    if (fs.existsSync(STOP_FILE)) {
      console.log('[ralph-loop] STOP file found — halting.'); break;
    }

    const dag = readDag();
    const eligible = eligibleTasks(dag);
    const inProgress = dag.nodes.filter(n => n.status === 'in-progress');

    console.log(`\n[ralph-loop] --- Iteration ${iter}/${MAX_ITER} ---`);
    console.log(`[ralph-loop] DAG: ${summarize(dag)}`);
    if (inProgress.length) {
      console.log(`[ralph-loop] WARNING — stale in-progress nodes (fix in dag.json or let the agent resume): ${inProgress.map(n => n.id).join(', ')}`);
    }
    if (eligible.length === 0) {
      console.log('[ralph-loop] No eligible tasks. Done.');
      break;
    }
    console.log(`[ralph-loop] Eligible: ${eligible.map(n => n.id).join(', ')}`);

    if (DRY_RUN) {
      console.log(`[ralph-loop] DRY RUN — would spawn: claude -p <ralph-prompt.md> --dangerously-skip-permissions${MODEL ? ` --model ${MODEL}` : ''}`);
      break;
    }

    const headBefore = sh('git rev-parse HEAD');
    const fpBefore = dagFingerprint(dag);

    await runIteration(iter, logFile);

    const headAfter = sh('git rev-parse HEAD');
    const fpAfter = dagFingerprint(readDag());
    const progressed = headAfter !== headBefore || fpAfter !== fpBefore;

    if (progressed) {
      noProgressStreak = 0;
      console.log(`[ralph-loop] Progress: ${headAfter !== headBefore ? 'new commit(s)' : 'DAG state change'}.`);
    } else {
      noProgressStreak++;
      console.log(`[ralph-loop] No progress detected (${noProgressStreak}/2).`);
      if (noProgressStreak >= 2) {
        console.log('[ralph-loop] Two stalled iterations — halting. Check ' + path.relative(ROOT, logFile));
        break;
      }
    }

    // Leave the tree clean between iterations; a stalled agent may abandon scratch files
    const leftover = sh('git status --porcelain');
    if (leftover) {
      console.log('[ralph-loop] Dirty tree after iteration — resetting uncommitted changes.');
      sh('git checkout -- . && git clean -fd');
    }
  }

  const dag = readDag();
  console.log(`\n[ralph-loop] Finished. DAG: ${summarize(dag)}`);
  const nh = dag.nodes.filter(n => n.needsHuman);
  if (nh.length) {
    console.log(`[ralph-loop] Waiting on YOU (backlog/QUESTIONS.md): ${nh.map(n => n.id).join(', ')}`);
  }
  console.log('[ralph-loop] Next: run /review-batch to catch up review, answer open questions, push when happy.');
}

main().catch(e => { console.error(e); process.exit(1); });
