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
 *
 * Status visibility:
 *   claude is run with --output-format stream-json --verbose instead of the default
 *   text mode, which prints nothing until the whole turn finishes. Each tool call the
 *   agent makes is echoed as a one-line `[claude] → ...` status; a heartbeat line prints
 *   every ~30s of silence (e.g. mid-way through a slow test run) so a long-but-working
 *   iteration doesn't look indistinguishable from a hang.
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
const HEARTBEAT_MS = 30_000; // console "still alive" ping if no stream event for this long

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

// stdout chunks from `claude --output-format stream-json` are arbitrary slices of a
// newline-delimited JSON stream: one chunk can hold zero, one, or many complete lines,
// and can split a line (even mid-JSON-token) across chunks.
class NdjsonLineBuffer {
  constructor(onLine) {
    this.buf = '';
    this.onLine = onLine;
  }
  push(chunkStr) {
    this.buf += chunkStr;
    const lines = this.buf.split('\n');
    this.buf = lines.pop(); // last element is the partial tail (or '' if chunk ended in \n)
    for (const line of lines) {
      if (line.trim()) this.onLine(line);
    }
  }
  flush() {
    if (this.buf.trim()) this.onLine(this.buf);
    this.buf = '';
  }
}

function safeParseJson(line) {
  try { return JSON.parse(line); } catch { return null; }
}

const TOOL_PATH_KEYS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit']);
function describeToolUse(block) {
  const input = block.input || {};
  if (block.name === 'Bash') {
    const cmd = String(input.command || '').replace(/\s+/g, ' ').trim();
    return `Bash: ${cmd.length > 100 ? cmd.slice(0, 100) + '…' : cmd}`;
  }
  if (TOOL_PATH_KEYS.has(block.name) && input.file_path) {
    return `${block.name} ${path.relative(ROOT, input.file_path) || input.file_path}`;
  }
  if ((block.name === 'Glob' || block.name === 'Grep') && input.pattern) {
    return `${block.name}: ${input.pattern}`;
  }
  let fallback = JSON.stringify(input);
  if (fallback && fallback.length > 100) fallback = fallback.slice(0, 100) + '…';
  return `${block.name}${fallback ? `: ${fallback}` : ''}`;
}

// Dispatches one parsed NDJSON stream event to a condensed, human-readable console/log
// line via `emit`. Unhandled types (system/init, user/tool_result, rate_limit_event, and
// any future type not seen yet) fall through silently — the raw line is already logged
// by the caller regardless, so nothing is lost, it's just not echoed to the console.
function handleStreamEvent(evt, emit) {
  switch (evt.type) {
    case 'assistant': {
      const blocks = evt.message?.content || [];
      for (const block of blocks) {
        if (block?.type === 'tool_use') emit(`[claude] → ${describeToolUse(block)}`);
      }
      break;
    }
    case 'result': {
      const meta = [];
      if (evt.duration_ms != null) meta.push(`${(evt.duration_ms / 1000).toFixed(0)}s`);
      if (evt.num_turns != null) meta.push(`${evt.num_turns} turns`);
      if (evt.total_cost_usd != null) meta.push(`$${evt.total_cost_usd.toFixed(2)}`);
      emit(`[claude] result${meta.length ? ` (${meta.join(', ')})` : ''}:`);
      if (evt.result) emit(evt.result);
      break;
    }
    default:
      break;
  }
}

function runIteration(iter, logFile) {
  const prompt = fs.readFileSync(PROMPT_FILE, 'utf-8');
  // Prompt is piped over stdin, not passed as an argv string: on Windows, spawn's
  // shell:true routes through cmd.exe, whose line-based parser mangles any argument
  // containing a newline (truncates at the first line break, regardless of quoting).
  // --output-format stream-json (+ required --verbose) gives real-time per-tool-call
  // events instead of the default text mode's total silence until the final response.
  const args = ['-p', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'];
  if (MODEL) args.push('--model', MODEL);

  return new Promise(resolve => {
    const child = spawn('claude', args, { cwd: ROOT, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const log = fs.createWriteStream(logFile, { flags: 'a' });
    log.write(`\n===== Iteration ${iter} — ${new Date().toISOString()} =====\n`);

    const iterStart = Date.now();
    let lastEventAt = iterStart;
    const emit = line => { console.log(line); log.write(line + '\n'); };

    const timer = setTimeout(() => {
      log.write('\n[ralph-loop] TIMEOUT — killing iteration\n');
      child.kill('SIGTERM');
    }, TIMEOUT_MS);

    const heartbeat = setInterval(() => {
      const idleMs = Date.now() - lastEventAt;
      if (idleMs >= HEARTBEAT_MS) {
        const elapsedMin = ((Date.now() - iterStart) / 60000).toFixed(1);
        console.log(`[ralph-loop] iteration ${iter} still running — ${elapsedMin}m elapsed, ${(idleMs / 1000).toFixed(0)}s since last event`);
      }
    }, HEARTBEAT_MS);

    const lineBuffer = new NdjsonLineBuffer(line => {
      log.write(line + '\n'); // raw NDJSON — full fidelity for after-the-fact debugging
      const evt = safeParseJson(line);
      if (evt) handleStreamEvent(evt, emit);
      else emit(`[claude] (unparsed line) ${line.slice(0, 200)}`);
    });

    child.stdout.on('data', d => {
      lastEventAt = Date.now();
      lineBuffer.push(d.toString('utf-8'));
    });
    child.stderr.on('data', d => {
      lastEventAt = Date.now();
      process.stderr.write(d);
      log.write(d);
    });
    child.on('close', code => {
      lineBuffer.flush();
      clearTimeout(timer);
      clearInterval(heartbeat);
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
      console.log(`[ralph-loop] DRY RUN — would spawn: claude -p --output-format stream-json --verbose --dangerously-skip-permissions${MODEL ? ` --model ${MODEL}` : ''}  (prompt piped via stdin)`);
      break;
    }

    const headBefore = sh('git rev-parse HEAD');
    const fpBefore = dagFingerprint(dag);
    const iterStartedAt = Date.now();

    await runIteration(iter, logFile);

    const elapsedMin = ((Date.now() - iterStartedAt) / 60000).toFixed(1);
    const headAfter = sh('git rev-parse HEAD');
    const fpAfter = dagFingerprint(readDag());
    const progressed = headAfter !== headBefore || fpAfter !== fpBefore;

    if (progressed) {
      noProgressStreak = 0;
      console.log(`[ralph-loop] Progress: ${headAfter !== headBefore ? 'new commit(s)' : 'DAG state change'} (${elapsedMin}m).`);
    } else {
      noProgressStreak++;
      console.log(`[ralph-loop] No progress detected (${noProgressStreak}/2) (${elapsedMin}m).`);
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
