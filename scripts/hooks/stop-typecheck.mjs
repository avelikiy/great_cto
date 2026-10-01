#!/usr/bin/env node
/**
 * stop-typecheck — Stop hook: code that does not compile is not done.
 *
 * Why this exists
 * ---------------
 * "Done" kept being claimed on code that did not typecheck. The PostToolUse
 * formatter runs per edit, but a typecheck per edit is slow and wrong mid-change.
 * So `typecheck-accumulate.mjs` records which typed files the turn edited, and
 * this hook checks them ONCE, when the model tries to end the turn:
 *
 *   TS      nearest tsconfig.json → the project's OWN node_modules/.bin/tsc
 *           --noEmit -p <tsconfig>. Never npx: a Stop hook that downloads a
 *           compiler is a network call nobody asked for.
 *   Python  nearest pyproject.toml / setup.cfg → pyright, else mypy, only if on
 *           PATH. Otherwise skipped.
 *
 * Only errors in files edited this turn are reported (max 15 lines) — errors
 * elsewhere in the project are not this turn's claim.
 *
 * Time-boxed: GREAT_CTO_TYPECHECK_BUDGET_S (default 60) for all checks together.
 * On the deadline the checker's whole PROCESS GROUP is killed (a plain kill, or
 * `timeout`, orphans grandchildren that then wedge later runs) and the user is
 * told "typecheck timed out — not verified". A timeout never blocks.
 *
 * It blocks a given error set ONCE. A Stop that is already a continuation
 * (stop_hook_active) or an error set already reported this session gets a
 * notice, not a block — a hook that can refuse to end the turn indefinitely is
 * a hang, not a guardrail.
 *
 * I/O (Claude Code Stop):
 *   stdin:  { session_id, cwd, hook_event_name: "Stop", stop_hook_active, ... }
 *   stdout: {"decision":"block","reason":"<errors>"}   — model must continue
 *           {"systemMessage":"<notice>"}               — shown to the user
 *           nothing                                    — clean / nothing to do
 *   exit:   always 0
 *
 * Opt-in (it adds latency): GREAT_CTO_TYPECHECK_AT_STOP=1 or
 * `typecheck_at_stop: true` in .great_cto/PROJECT.md.
 * Opt-out always wins: GREAT_CTO_DISABLE_STOP_TYPECHECK=1.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, extname, delimiter, isAbsolute } from 'node:path';
import { sessionKey, stateDir, listPath, isActive, readList } from './typecheck-accumulate.mjs';

export const MAX_LINES = 15;
const TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function reportedPath(key) { return join(stateDir(), `${key}.reported`); }

function nearest(start, names) {
  let dir = start;
  for (let i = 0; i < 40; i++) {
    for (const n of names) if (existsSync(join(dir, n))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

/** The project's own tsc: nearest node_modules/.bin/tsc at or above the tsconfig dir. */
function projectTsc(tsDir) {
  let dir = tsDir;
  for (let i = 0; i < 40; i++) {
    const p = join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

function onPath(cmd) {
  for (const d of (process.env.PATH || '').split(delimiter)) {
    if (!d) continue;
    const p = join(d, cmd);
    try { if (statSync(p).isFile()) return p; } catch { /* next */ }
  }
  return null;
}

/** Group edited files into check jobs: one per tsconfig, one per Python root. */
export function planJobs(files, cwd) {
  const jobs = new Map();
  const pyChecker = () => {
    const pyright = onPath('pyright');
    if (pyright) return { bin: pyright, args: (fs) => fs, tool: 'pyright' };
    const mypy = onPath('mypy');
    if (mypy) return { bin: mypy, args: (fs) => ['--no-error-summary', ...fs], tool: 'mypy' };
    return null;
  };
  let py;
  for (const f of files) {
    if (!existsSync(f)) continue;            // deleted this turn — nothing to check
    const ext = extname(f).toLowerCase();
    if (TS_EXTS.has(ext)) {
      const root = nearest(dirname(f), ['tsconfig.json']);
      if (!root) continue;
      const id = `ts:${root}`;
      if (!jobs.has(id)) {
        const tsc = projectTsc(root);
        if (!tsc) continue;
        jobs.set(id, { tool: 'tsc', cwd: root, bin: tsc,
          args: ['--noEmit', '-p', join(root, 'tsconfig.json'), '--pretty', 'false'], files: [] });
      }
      jobs.get(id).files.push(f);
    } else if (ext === '.py') {
      if (py === undefined) py = pyChecker();
      if (!py) continue;
      const root = nearest(dirname(f), ['pyproject.toml', 'setup.cfg']) || cwd;
      const id = `py:${root}`;
      if (!jobs.has(id)) jobs.set(id, { tool: py.tool, cwd: root, bin: py.bin, pyArgs: py.args, files: [] });
      jobs.get(id).files.push(f);
    }
  }
  for (const j of jobs.values()) if (j.pyArgs) j.args = j.pyArgs(j.files);
  return [...jobs.values()];
}

/**
 * Run a checker in its own process group; on the deadline kill the WHOLE group.
 * Resolves { out, code, timedOut, failed }.
 */
export function runBounded(bin, args, cwd, ms) {
  return new Promise((res) => {
    let child;
    const detached = process.platform !== 'win32';
    try {
      child = spawn(bin, args, { cwd, detached, stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32' && bin.endsWith('.cmd') });
    } catch { return res({ out: '', code: null, timedOut: false, failed: true }); }
    let out = '';
    let done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); res(r); };
    child.stdout.on('data', (d) => { if (out.length < 2_000_000) out += d; });
    child.stderr.on('data', (d) => { if (out.length < 2_000_000) out += d; });
    child.on('error', () => finish({ out, code: null, timedOut: false, failed: true }));
    child.on('close', (code) => finish({ out, code, timedOut: false, failed: false }));
    const timer = setTimeout(() => {
      try {
        if (detached) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL');
      } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
      // Do not wait for 'close': a grandchild outside the group could hold the pipe.
      child.stdout.destroy(); child.stderr.destroy(); child.unref();
      finish({ out, code: null, timedOut: true, failed: false });
    }, Math.max(1, ms));
  });
}

/** Lines of checker output that name one of the edited files. */
export function filterLines(out, files, cwd) {
  const cands = [];
  for (const f of files) {
    cands.push(f);
    const rel = relative(cwd, f);
    if (rel && !isAbsolute(rel)) cands.push(rel);
  }
  const hits = [];
  for (const line of out.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    // `path(1,2): error` (tsc) or `path:1: error` / `path:1:2 - error` (mypy/pyright)
    if (cands.some((c) => t.startsWith(`${c}(`) || t.startsWith(`${c}:`))) hits.push(t);
  }
  return hits;
}

/** Pure decision on what the Stop hook emits. */
export function decide({ errors, timedOut, stopHookActive, alreadyReported }) {
  const shown = errors.slice(0, MAX_LINES);
  const more = errors.length - shown.length;
  const body = shown.join('\n') + (more > 0 ? `\n… and ${more} more` : '');
  if (errors.length === 0) {
    if (timedOut) return { kind: 'notice', message: 'stop-typecheck: typecheck timed out — not verified.' };
    return { kind: 'clean' };
  }
  const tail = timedOut ? '\n(another check timed out — not verified)' : '';
  if (stopHookActive || alreadyReported) {
    return { kind: 'notice',
      message: `stop-typecheck: edited files still failing typecheck (already reported, not blocking again):\n${body}${tail}` };
  }
  return { kind: 'block',
    reason: 'Typecheck fails in files you edited this turn — code that does not compile is not done. '
      + `Fix these before finishing:\n${body}${tail}\n`
      + '(stop-typecheck blocks an error set once; GREAT_CTO_DISABLE_STOP_TYPECHECK=1 turns it off.)' };
}

function budgetMs() {
  const s = parseFloat(process.env.GREAT_CTO_TYPECHECK_BUDGET_S || '');
  return (Number.isFinite(s) && s > 0 ? s : 60) * 1000;
}

function clearList(key) { try { rmSync(listPath(key), { force: true }); } catch { /* best effort */ } }

export async function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* Stop may send {} */ }
  const cwd = resolve(payload.cwd || process.cwd());
  if (!isActive(cwd)) return 0;

  const key = sessionKey(payload, cwd);
  const files = readList(key);
  if (files.length === 0) return 0;

  const jobs = planJobs(files, cwd);
  const deadline = Date.now() + budgetMs();
  const errors = [];
  let timedOut = false;
  for (const job of jobs) {
    const left = deadline - Date.now();
    if (left <= 0) { timedOut = true; break; }
    const r = await runBounded(job.bin, job.args, job.cwd, left);
    if (r.failed) continue;                   // could not start — not evidence of anything
    if (r.timedOut) timedOut = true;
    if (r.code === 0 && !r.timedOut) continue;
    errors.push(...filterLines(r.out, job.files, job.cwd));
  }

  const hash = createHash('sha1').update([...errors].sort().join('\n')).digest('hex');
  let alreadyReported = false;
  try { alreadyReported = readFileSync(reportedPath(key), 'utf8').split('\n').includes(hash); } catch { /* none */ }

  const d = decide({ errors, timedOut, stopHookActive: Boolean(payload.stop_hook_active), alreadyReported });
  if (d.kind === 'block') {
    try {
      mkdirSync(stateDir(), { recursive: true });
      let prev = '';
      try { prev = readFileSync(reportedPath(key), 'utf8'); } catch { /* none */ }
      writeFileSync(reportedPath(key), `${prev}${hash}\n`);
    } catch { /* a marker we cannot write means we may block twice; not fatal */ }
    // The list survives a block so the fix is re-checked at the next Stop.
    process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
    return 0;
  }
  clearList(key);
  if (d.kind === 'notice') {
    process.stdout.write(JSON.stringify({ systemMessage: d.message }));
    process.stderr.write(`${d.message}\n`);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((c) => { process.exitCode = c; }, () => { process.exitCode = 0; });
}
