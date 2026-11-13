/**
 * Beads backend of the task store — the only file that should launch `bd`.
 *
 * Measured on this repository's store (1132 issues, bd 1.3.1, 2026-11-11): one
 * `bd show` 6.7 s, a full list 8.1 s, three reads started together 31.9 s. The
 * cost is per process and `bd` queues callers itself, so this backend adds no
 * lock of its own and spends exactly one process per operation.
 *
 * Every call is bounded (20 s, above the 8.7 s worst case recorded in
 * tests/lib/bd-timeout-floor.test.mjs) and killed with SIGKILL: a `bd` waiting on
 * a lock has been seen to ignore SIGTERM for minutes.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { TaskReadFailed, TaskWriteFailed } from './task-store.mjs';

const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin'), '/usr/bin', '/bin'];

function resolveBin(explicit) {
  if (explicit) return explicit;
  const fromEnv = process.env.GREAT_CTO_BD_BIN;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const dir of EXTRA_PATHS) {
    const p = join(dir, 'bd');
    if (existsSync(p)) return p;
  }
  return 'bd';
}

/** PATH with the usual install locations, so bd's own children (git) are found too. */
function childEnv() {
  const have = new Set((process.env.PATH || '').split(delimiter).filter(Boolean));
  const add = EXTRA_PATHS.filter((d) => !have.has(d));
  return add.length ? { ...process.env, PATH: [process.env.PATH, ...add].filter(Boolean).join(delimiter) } : process.env;
}

const firstLine = (text) => String(text || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 300) || '';
const NOT_THERE = /no issues? found|not found/i;
const NO_STORE = /no beads database|not initialized|run 'bd init'/i;

function normalize(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const title = String(issue.title || '');
  return {
    id: String(issue.id),
    title,
    description: issue.description || '',
    notes: issue.notes || '',
    design: issue.design || '',
    acceptance: issue.acceptance_criteria || issue.acceptance || '',
    status: String(issue.status || ''),
    priority: Number.isInteger(issue.priority) ? issue.priority : null,
    type: issue.issue_type || 'task',
    labels,
    owner: issue.owner || '',
    parent: issue.parent || (/^(.+)\.\d+$/.exec(String(issue.id)) || [])[1] || null,
    created_at: issue.created_at || null,
    updated_at: issue.updated_at || null,
    closed_at: issue.closed_at || null,
    close_reason: issue.close_reason || '',
    is_gate: labels.includes('gate') || issue.issue_type === 'decision' || title.toLowerCase().startsWith('gate:'),
  };
}

/**
 * @param {string} cwd
 * @param {object} [opts]
 * @param {string} [opts.bin] Path to bd; defaults to GREAT_CTO_BD_BIN, the usual install dirs, then PATH.
 * @param {number} [opts.timeoutMs] Cap for one bd process.
 */
export function beadsBackend(cwd, { bin, timeoutMs = 20000 } = {}) {
  const BD_BIN = resolveBin(bin);

  /** Run one bd process. Resolves `{ status, stdout, stderr, timedOut, missing }`; never rejects. */
  function run(args, actor) {
    const argv = [...(actor ? ['--actor', actor] : []), ...args];
    return new Promise((done) => {
      let stdout = '', stderr = '', settled = false, timer = null;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        done({ stdout, stderr, timedOut: false, missing: false, status: null, ...result });
      };
      let child;
      try {
        child = spawn(BD_BIN, argv, { cwd, env: childEnv(), timeout: timeoutMs, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        finish({ missing: e.code === 'ENOENT', stderr: String(e.message || e) });
        return;
      }
      child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
      child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
      child.on('error', (e) => finish({ missing: e.code === 'ENOENT', stderr: String(e.message || e) }));
      child.on('close', (status) => finish({ status }));
      // Do not wait for `close` after a timeout: a grandchild can hold the pipes
      // open long after the process we own is dead.
      timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        child.stdout.destroy(); child.stderr.destroy();
        finish({ timedOut: true });
      }, timeoutMs);
    });
  }

  /** Why a call failed, as a store error code plus a message a person can act on. */
  function failure(r, what) {
    if (r.missing) return ['not_installed', `${what}: 'bd' was not found (looked for ${BD_BIN}). Install Beads or set GREAT_CTO_BD_BIN.`];
    if (r.timedOut) return ['timeout', `${what}: the task store did not answer in ${Math.round(timeoutMs / 1000)} s`];
    const text = `${r.stderr}\n${r.stdout}`;
    if (NO_STORE.test(text)) return ['not_initialized', `${what}: ${firstLine(r.stderr) || 'no beads database found'}`];
    let fromJson = '';
    try { fromJson = String(JSON.parse(r.stdout.trim()).error || ''); } catch { /* not JSON */ }
    return ['store_refused', `${what}: ${firstLine(r.stderr) || fromJson || firstLine(r.stdout) || `bd exited ${r.status}`}`];
  }

  function parse(r, what) {
    try { return JSON.parse(r.stdout.trim()); } catch {
      throw new TaskReadFailed('bad_output', `${what}: bd did not return JSON (${firstLine(r.stdout) || 'empty output'})`);
    }
  }

  async function read(args, what) {
    const r = await run(args);
    if (r.status !== 0 || r.timedOut || r.missing) {
      const [code, message] = failure(r, what);
      const err = new TaskReadFailed(code, message);
      err.result = r;
      throw err;
    }
    return parse(r, what);
  }

  async function write(args, actor, what) {
    const r = await run(args, actor);
    if (r.status === 0 && !r.timedOut && !r.missing) return r;
    const [code, message] = failure(r, what);
    // A timeout is surfaced as a read-shaped failure so the store can look once
    // for whether the write landed; everything else was refused outright.
    if (code === 'timeout') throw new TaskReadFailed('timeout', message);
    if (code === 'store_refused' && NOT_THERE.test(`${r.stderr}\n${r.stdout}`)) throw new TaskWriteFailed('absent', `${what}: no such task`);
    throw new TaskWriteFailed(code, message);
  }

  async function list() {
    // --all and filter here: bd's default view hides more than closed tasks, and
    // a filter the caller cannot see is how a task goes missing.
    const out = await read(['list', '--json', '--all', '--include-gates', '--limit', '0'], 'list tasks');
    if (!Array.isArray(out)) {
      throw new TaskReadFailed(out && out.error ? 'store_refused' : 'bad_output',
        `list tasks: ${out && out.error ? String(out.error).slice(0, 300) : 'bd returned something that is not a list'}`);
    }
    return out.map(normalize);
  }

  async function get(id) {
    let out;
    try { out = await read(['show', id, '--json'], `read task ${id}`); } catch (e) {
      const r = e.result;
      // bd reports a missing id as exit 1 with a JSON error on stdout.
      if (e.code === 'store_refused' && r && NOT_THERE.test(`${r.stderr}\n${r.stdout}`)) return null;
      throw e;
    }
    const issue = Array.isArray(out) ? out[0] : out;
    if (!issue || !issue.id) {
      if (out && out.error && NOT_THERE.test(String(out.error))) return null;
      throw new TaskReadFailed('bad_output', `read task ${id}: bd returned no task`);
    }
    return normalize(issue);
  }

  async function create({ title, type, priority, labels, parent, description, actor }) {
    const args = ['create', title, '--json'];
    if (type) args.push('--type', String(type));
    if (priority !== undefined) args.push('--priority', String(priority));
    if (Array.isArray(labels) && labels.length) args.push('--labels', labels.join(','));
    if (parent) args.push('--parent', parent);
    if (description) args.push('--description', String(description));
    const r = await write(args, actor, `create "${title}"`);
    let id = null;
    try { id = JSON.parse(r.stdout.trim()).id; } catch { /* handled below */ }
    if (!id) throw new TaskReadFailed('bad_output', `create "${title}": bd reported success but returned no id`);
    return String(id);
  }

  const stamp = (actor, text) => `[${new Date().toISOString()} ${actor}] ${text}`;

  async function move(id, status, { actor, reason }) {
    // --append-notes, never --notes: the latter replaces what is already written.
    await write(['update', id, '--status', status, '--append-notes', stamp(actor, `→ ${status}${reason ? `: ${reason}` : ''}`), '--json'],
      actor, `move ${id} to ${status}`);
  }

  async function close(id, { actor, reason }) {
    await write(['close', id, '--reason', `[${actor}] ${reason || 'closed'}`, '--json'], actor, `close ${id}`);
  }

  async function link(id, dependsOn, { actor }) {
    await write(['dep', 'add', id, dependsOn, '--json'], actor, `link ${id} → ${dependsOn}`);
  }

  async function note(id, text, { actor }) {
    await write(['update', id, '--append-notes', stamp(actor, text), '--json'], actor, `note on ${id}`);
  }

  return { name: 'beads', list, get, create, move, close, link, note };
}
