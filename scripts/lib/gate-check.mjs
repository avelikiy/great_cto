// scripts/lib/gate-check.mjs — strict-mode evidence-blocking gate check (governance Phase 2).
//
// NaCl strict-mode: a gate REFUSES to pass while any in-scope task is in a terminal-fail
// state {BLOCKED, FAILED, UNVERIFIED, NOT_RUN} — instead of being downgraded to "explained".
// The ONLY sanctioned override is a valid signed exception (Phase 1). Every covered task is
// logged with the exception id, so a bypass is never silent.
//
// CLI:  node scripts/lib/gate-check.mjs <gate>   → exit 0 if the gate may pass, 1 if blocked
//   (loads tasks from `bd list --json` and exceptions from the registry)

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verify, list as listExceptions } from './exceptions.mjs';

// Terminal-fail states that block a gate (normalized, lowercase).
export const BLOCKING_STATES = new Set(['blocked', 'failed', 'unverified', 'not_run', 'not-run']);

/**
 * Normalize a beads task to { id, title, state }. A task's effective state is its
 * blocking status, else the first blocking label, else its status.
 */
export function normalizeTask(task) {
  const status = String(task.status || '').toLowerCase();
  const labels = (task.labels || []).map((l) => String(l).toLowerCase().replace(/^state:/, ''));
  let state = status;
  if (!BLOCKING_STATES.has(status)) {
    const bl = labels.find((l) => BLOCKING_STATES.has(l));
    if (bl) state = bl;
  }
  return { id: task.id, title: task.title || '', state };
}

/**
 * Does a signed exception cover this gate + task?
 * - gate must match exactly or be '*'.
 * - scope empty or '*' → gate-wide (covers every blocking task for that gate, e.g. a
 *   "CI billing-locked" exception).
 * - otherwise scope is a comma/space-separated list of task ids; coverage requires an
 *   EXACT id match (no substring — "uncovered" must not be covered by scope "covered").
 */
export function covers(exc, gate, taskId, now) {
  if (!verify(exc, { now }).valid) return false;
  if (!(exc.gate === gate || exc.gate === '*')) return false;
  const scope = String(exc.scope || '').trim();
  if (!scope || scope === '*') return true;
  return scope.split(/[\s,]+/).includes(String(taskId));
}

/**
 * Evaluate a gate against a list of (already-normalized) tasks + exceptions.
 * @returns {{ pass: boolean, blocking: Array, covered: Array }}
 */
export function evaluateGate(tasks, exceptions, { gate, now } = {}) {
  const blocking = [];
  const covered = [];
  for (const t of tasks) {
    if (!BLOCKING_STATES.has(String(t.state).toLowerCase())) continue;
    const exc = (exceptions || []).find((e) => covers(e, gate, t.id, now));
    if (exc) covered.push({ id: t.id, state: t.state, exception: exc.id });
    else blocking.push({ id: t.id, state: t.state, title: t.title });
  }
  return { pass: blocking.length === 0, blocking, covered };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function loadTasks() {
  try {
    const out = execFileSync('bd', ['list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const data = JSON.parse(out);
    const arr = Array.isArray(data) ? data : (data.issues || data.tasks || []);
    return arr.map(normalizeTask);
  } catch {
    return null; // bd unavailable
  }
}

function main() {
  const gate = process.argv[2];
  if (!gate) { process.stderr.write('Usage: gate-check.mjs <gate>\n'); process.exit(2); }

  const tasks = loadTasks();
  if (tasks === null) {
    process.stdout.write('gate-check: beads (bd) unavailable — cannot evaluate; treat as a manual check.\n');
    process.exit(0); // do not hard-fail when bd isn't present
  }
  const exceptions = listExceptions({});
  const r = evaluateGate(tasks, exceptions, { gate });

  for (const c of r.covered) {
    process.stdout.write(`  ⚠ ${c.id} [${c.state}] — sanctioned by signed exception ${c.exception}\n`);
  }
  if (r.pass) {
    process.stdout.write(`✓ ${gate}: no blocking tasks (${r.covered.length} covered by exception).\n`);
    process.exit(0);
  }
  process.stdout.write(`✗ ${gate} BLOCKED — ${r.blocking.length} task(s) in a terminal-fail state with no signed exception:\n`);
  for (const b of r.blocking) process.stdout.write(`    ${b.id} [${b.state}] ${b.title}\n`);
  process.stdout.write(`  Fix the task, or create a signed exception: /exception create --gate ${gate} --reason "…"\n`);
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
