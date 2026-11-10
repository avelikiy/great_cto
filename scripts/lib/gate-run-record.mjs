#!/usr/bin/env node
/**
 * Append one line per ci-local run to <main checkout>/.great_cto/gate-runs.jsonl,
 * so the board can say "the local gate went red" (trigger gate.local_red) instead
 * of the result living only in a terminal.
 *
 *   node scripts/lib/gate-run-record.mjs --result green|skipped|red [--failed "step a\nstep b"]
 *
 * The MAIN checkout, not the current one: gates run in worktrees, and the board
 * watches the project. `git rev-parse --git-common-dir` points at the main
 * repository's .git from any of its worktrees.
 *
 * A record is a report, never a reason to change the gate's result: every
 * failure here is printed and swallowed, and the exit code is always 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isMainModule } from './is-main.mjs';

export const MAX_LINES = 200;
export const RESULTS = Object.freeze(['green', 'skipped', 'red']);

function git(args, cwd) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

/** The main checkout's root, from the main checkout or any of its worktrees. Null outside git. */
export function mainCheckout(cwd = process.cwd()) {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  if (!common) return null;
  return path.basename(common) === '.git' ? path.dirname(common) : null;
}

export function buildRecord({ result, failed = '', cwd = process.cwd(), now = Date.now() }) {
  if (!RESULTS.includes(result)) throw new Error(`result must be one of ${RESULTS.join(', ')}`);
  return {
    v: 1,
    ts: new Date(now).toISOString(),
    result,
    branch: git(['branch', '--show-current'], cwd) || null,
    sha: git(['rev-parse', '--short', 'HEAD'], cwd) || null,
    failed: String(failed).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20),
  };
}

/** Append and keep the newest MAX_LINES. Returns the file written, or null when there is no project to write into. */
export function appendRecord(record, { cwd = process.cwd() } = {}) {
  const root = mainCheckout(cwd);
  if (!root) return null;
  const dir = path.join(root, '.great_cto');
  // Only into a great_cto project: a gate in some other repository has no board to tell.
  if (!fs.existsSync(path.join(dir, 'PROJECT.md'))) return null;
  const file = path.join(dir, 'gate-runs.jsonl');
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); }
  catch (e) { if (e.code !== 'ENOENT') throw e; } // unreadable: refuse to rewrite it from nothing
  lines.push(JSON.stringify(record));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, lines.slice(-MAX_LINES).join('\n') + '\n');
  fs.renameSync(tmp, file);
  return file;
}

if (isMainModule(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  try {
    const file = appendRecord(buildRecord({ result: arg('--result'), failed: arg('--failed') || '' }));
    if (file) process.stdout.write(`   run recorded: ${path.relative(process.cwd(), file) || file}\n`);
  } catch (e) {
    process.stdout.write(`   ⚠ run not recorded (${e.message}) — the board will not report this run\n`);
  }
  process.exit(0);
}
