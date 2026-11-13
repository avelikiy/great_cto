/**
 * The task store: the one door to tracker tasks.
 *
 * Design: docs/architecture/ARCH-task-api.md. Contract: tests/lib/task-store-contract.test.mjs.
 *
 * Three rules this file exists to hold:
 *
 *   1. A read that did not happen is never an empty answer. `list` returns
 *      `{ state: 'read', tasks }` or throws TaskReadFailed; `get` returns `found`
 *      or `absent` only when the backend actually answered.
 *   2. Every write names who made it. The actor is DECLARED by the caller, so
 *      this is a record, not an authorization boundary — anything with a shell
 *      can pass `human`. What proves a person is the board's gate token.
 *   3. A write that timed out is unknown, not failed and not done. The store
 *      looks once to see whether it landed and says what it found; it never
 *      repeats the write on its own.
 *
 * Backends are replaceable: the built-in SQLite file `.great_cto/tasks.db`
 * (owner's decision 2026-11-11, option A of the store spike), Beads for the
 * projects that already use it, `.great_cto/tasks.md` for projects with neither.
 * Nothing outside task-backend-beads.mjs should launch `bd`.
 */
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { beadsBackend } from './task-backend-beads.mjs';
import { tasksMdBackend } from './task-backend-tasks-md.mjs';
import { sqliteBackend, initSqliteStore, SQLITE_FILE } from './task-backend-sqlite.mjs';

/** What the store really holds. Anything else in a write is a usage error. */
export const STATUSES = Object.freeze(['open', 'in_progress', 'blocked', 'deferred', 'closed']);

const ACTOR = /^(human|agent:[a-z0-9][a-z0-9-]*|system:[a-z0-9][a-z0-9-]*)$/;

/** The backend did not answer. `code`: timeout | not_installed | not_initialized | store_refused | bad_output | backend_unavailable. */
export class TaskReadFailed extends Error {
  constructor(code, message) { super(message); this.name = 'TaskReadFailed'; this.code = code; }
}
/** The backend answered and refused. `code`: absent | unsupported | store_refused | not_installed | not_initialized. */
export class TaskWriteFailed extends Error {
  constructor(code, message) { super(message); this.name = 'TaskWriteFailed'; this.code = code; }
}
/** The write may or may not have landed, and a look afterwards could not tell. */
export class TaskWriteUnknown extends Error {
  constructor(message) { super(message); this.name = 'TaskWriteUnknown'; this.code = 'unknown'; }
}
/** The caller asked for something this API does not accept. Nothing was sent to the backend. */
export class TaskUsageError extends Error {
  constructor(message) { super(message); this.name = 'TaskUsageError'; this.code = 'usage'; }
}

export const BACKENDS = Object.freeze(['sqlite', 'beads', 'tasks-md']);

/**
 * Nearest ancestor that holds a task store: `.great_cto/tasks.db` or `.beads/`.
 * The nearer one wins, so a project inside a folder that has Beads keeps its own
 * store; in one folder an explicit tasks.db wins over `.beads/`.
 */
function findStoreRoot(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, SQLITE_FILE))) return { kind: 'sqlite', dir };
    if (existsSync(join(dir, '.beads'))) return { kind: 'beads', dir };
    if (dirname(dir) === dir) return null;
  }
}

function pickBackend(cwd, opts) {
  const forced = opts.backend || process.env.GREAT_CTO_TASK_BACKEND || null;
  if (forced && !BACKENDS.includes(forced)) throw new TaskUsageError(`unknown task backend "${forced}" — one of: ${BACKENDS.join(', ')}`);
  const found = process.env.BEADS_DIR ? { kind: 'beads', dir: cwd } : findStoreRoot(cwd);
  if (forced === 'sqlite') return sqliteBackend(found?.kind === 'sqlite' ? found.dir : cwd, opts);
  if (forced === 'beads' || (!forced && found?.kind === 'beads')) return beadsBackend(cwd, opts);
  if (!forced && found?.kind === 'sqlite') return sqliteBackend(found.dir, opts);
  if (forced === 'tasks-md' || existsSync(join(cwd, '.great_cto', 'tasks.md'))) return tasksMdBackend(cwd, opts);
  throw new TaskReadFailed('not_initialized',
    'no task source in this project: no .great_cto/tasks.db, no .beads/ store and no .great_cto/tasks.md — run `great-cto tracker init`');
}

/**
 * Start a task store in a project that has none: `.great_cto/tasks.db`.
 * Refuses when the project already has a store, so two stores never split one backlog.
 * @returns {{backend: 'sqlite', file: string, created: boolean}}
 */
export function initTaskStore(cwd = process.cwd()) {
  const root = resolve(cwd);
  const found = process.env.BEADS_DIR ? { kind: 'beads', dir: process.env.BEADS_DIR } : findStoreRoot(root);
  if (found?.kind === 'beads') {
    throw new TaskWriteFailed('store_refused',
      `this project already uses Beads (${join(found.dir, '.beads')}); it stays on Beads until it is migrated`);
  }
  if (found?.kind === 'sqlite' && found.dir !== root) {
    throw new TaskWriteFailed('store_refused', `a task store already covers this folder: ${join(found.dir, SQLITE_FILE)}`);
  }
  if (existsSync(join(root, '.great_cto', 'tasks.md'))) {
    throw new TaskWriteFailed('store_refused',
      'this project keeps its tasks in .great_cto/tasks.md; moving them into a store is a migration, not an init');
  }
  try {
    return { backend: 'sqlite', ...initSqliteStore(root) };
  } catch (e) {
    // Nothing exists yet, so a failure here is a refusal, not an unread store.
    if (e instanceof TaskReadFailed) throw new TaskWriteFailed(e.code, e.message);
    throw e;
  }
}

function requireActor(actor) {
  if (typeof actor !== 'string' || !ACTOR.test(actor)) {
    throw new TaskUsageError('a write needs an actor: human, agent:<role> or system:<name>');
  }
  return actor;
}
function requireStatus(status) {
  if (!STATUSES.includes(status)) throw new TaskUsageError(`unknown status "${status}" — one of: ${STATUSES.join(', ')}`);
  return status;
}
function requireId(id) {
  if (typeof id !== 'string' || !/^[\w.:-]{1,128}$/.test(id)) throw new TaskUsageError('a task id is required');
  return id;
}
const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function matches(task, { status, label, parent, text }) {
  if (status) {
    const wanted = Array.isArray(status) ? status : [status];
    if (!wanted.includes(task.status)) return false;
  }
  if (label && !task.labels.includes(label)) return false;
  if (parent && task.parent !== parent && !task.id.startsWith(`${parent}.`)) return false;
  if (text && !task.title.toLowerCase().includes(String(text).toLowerCase())) return false;
  return true;
}

/** Was the read failure a timeout, i.e. could a write still be in flight behind it? */
const timedOut = (e) => e && e.code === 'timeout';

/**
 * Open the task store of a project.
 *
 * @param {string} cwd Project directory (or any directory inside it).
 * @param {object} [opts]
 * @param {'sqlite'|'beads'|'tasks-md'} [opts.backend] Force a backend (also GREAT_CTO_TASK_BACKEND).
 * @param {string} [opts.bin] Path to `bd` (tests pass a stub).
 * @param {number} [opts.timeoutMs] Per-call cap for the backend process.
 */
export function openTaskStore(cwd = process.cwd(), opts = {}) {
  const backend = pickBackend(resolve(cwd), opts);

  async function list(filter = {}) {
    for (const s of [].concat(filter.status || [])) requireStatus(s);
    const wantsClosed = filter.includeClosed === true || [].concat(filter.status || []).includes('closed');
    const all = await backend.list();
    const tasks = all.filter((t) => (wantsClosed || t.status !== 'closed') && matches(t, filter));
    return { state: 'read', tasks };
  }

  async function get(id) {
    const task = await backend.get(requireId(id));
    return task ? { state: 'found', task } : { state: 'absent' };
  }

  async function create(input = {}) {
    const actor = requireActor(input.actor);
    const title = oneLine(input.title);
    if (!title) throw new TaskUsageError('a task needs a title');
    if (input.priority !== undefined && !(Number.isInteger(input.priority) && input.priority >= 0 && input.priority <= 4)) {
      throw new TaskUsageError('priority is an integer from 0 (urgent) to 4');
    }
    if (input.parent !== undefined) requireId(input.parent);
    const asked = Date.now();
    try {
      return { id: await backend.create({ ...input, title, actor }) };
    } catch (e) {
      if (!timedOut(e)) throw e;
      // The create may have landed behind the timeout. Look once; do not create again.
      let found = null;
      try {
        found = (await backend.list()).find((t) => t.title === title
          && Number.isFinite(Date.parse(t.created_at)) && Date.parse(t.created_at) >= asked - 120000);
      } catch { /* the look failed too — that is exactly "unknown" */ }
      if (found) return { id: found.id, recovered: true };
      throw new TaskWriteUnknown(`create "${title}" timed out and no such task could be confirmed — check before creating it again`);
    }
  }

  async function move(id, status, { actor, reason } = {}) {
    requireId(id); requireStatus(status); requireActor(actor);
    if (status === 'closed') return close(id, { actor, reason });
    try {
      await backend.move(id, status, { actor, reason: oneLine(reason) });
      return { id, to: status };
    } catch (e) {
      if (!timedOut(e)) throw e;
      return confirm(id, status, `move ${id} to ${status}`);
    }
  }

  async function close(id, { actor, reason } = {}) {
    requireId(id); requireActor(actor);
    try {
      await backend.close(id, { actor, reason: oneLine(reason) });
      return { id, to: 'closed' };
    } catch (e) {
      if (!timedOut(e)) throw e;
      return confirm(id, 'closed', `close ${id}`);
    }
  }

  /** After a timed-out status write: did it land? One look, no second write. */
  async function confirm(id, status, what) {
    let now = null;
    try { now = await backend.get(id); } catch { /* unknown stays unknown */ }
    if (now && now.status === status) return { id, to: status, recovered: true };
    throw new TaskWriteUnknown(`${what} timed out and could not be confirmed — read the task before trying again`);
  }

  async function link(id, dependsOn, { actor } = {}) {
    requireId(id); requireId(dependsOn); requireActor(actor);
    try { await backend.link(id, dependsOn, { actor }); } catch (e) {
      if (timedOut(e)) throw new TaskWriteUnknown(`link ${id} → ${dependsOn} timed out and was not confirmed`);
      throw e;
    }
    return { ok: true };
  }

  async function note(id, text, { actor } = {}) {
    requireId(id); requireActor(actor);
    const body = String(text ?? '').trim();
    if (!body) throw new TaskUsageError('a note needs text');
    try { await backend.note(id, body, { actor }); } catch (e) {
      if (timedOut(e)) throw new TaskWriteUnknown(`note on ${id} timed out and was not confirmed`);
      throw e;
    }
    return { ok: true };
  }

  /** Open (not closed) tasks matching a label and/or title text — the duplicate check. */
  const findOpen = ({ label, text } = {}) => list({ label, text });

  return { backend: backend.name, list, get, create, move, close, link, note, findOpen };
}
