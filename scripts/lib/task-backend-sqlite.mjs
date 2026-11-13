/**
 * Built-in SQLite backend of the task store: one file per project,
 * `.great_cto/tasks.db`, on Node's own `node:sqlite` (no binary to install).
 *
 * Why it exists: docs/research/SPIKE-task-store-sqlite-2026-11.md — one operation
 * in a fresh process costs 0.1–0.25 s here against 3–15 s through `bd`. The owner
 * chose option A on 2026-11-11: new projects get this backend, existing Beads
 * projects stay on Beads until migrated one by one.
 *
 * Rules it keeps (the same contract as task-backend-beads.mjs):
 *   - a read that did not happen throws TaskReadFailed, never returns empty;
 *   - every write runs in one `BEGIN IMMEDIATE` transaction and records who made
 *     it in `events`; a write that could not take the lock wrote nothing and says so;
 *   - the file is created only by `initSqliteStore`, never by a read or a write,
 *     so a typo in a path cannot start an empty second store.
 *
 * `node:sqlite` is absent before Node 22.5 (and flagged before 22.13): there the
 * backend reports `not_installed` and the project keeps Beads or tasks.md.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { TaskReadFailed, TaskWriteFailed } from './task-store.mjs';

export const SQLITE_FILE = join('.great_cto', 'tasks.db');
const SCHEMA_VERSION = 1;
const BUSY_MS = 5000; // how long a write waits for another writer's lock

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  design TEXT NOT NULL DEFAULT '',
  acceptance TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER,
  type TEXT NOT NULL DEFAULT 'task',
  labels TEXT NOT NULL DEFAULT '[]',
  owner TEXT NOT NULL DEFAULT '',
  parent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  close_reason TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS deps (
  task TEXT NOT NULL,
  depends_on TEXT NOT NULL,
  PRIMARY KEY (task, depends_on)
);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  what TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_task ON events (task);
`;

/**
 * `node:sqlite` without the one-time ExperimentalWarning on stderr: the tracker's
 * output is read by agents and hooks, and a warning line there is noise.
 * Returns null when the running Node has no such module.
 */
function loadSqlite() {
  if (typeof process.getBuiltinModule !== 'function') return null;
  const original = process.emitWarning;
  process.emitWarning = function quiet(warning, ...rest) {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (/SQLite is an experimental feature/i.test(String(text || ''))) return;
    return original.call(process, warning, ...rest);
  };
  try {
    return process.getBuiltinModule('node:sqlite') || null;
  } catch {
    return null;
  } finally {
    process.emitWarning = original;
  }
}

const now = () => new Date().toISOString();
const isBusy = (e) => /SQLITE_BUSY|database is locked/i.test(String(e?.message || e)) || e?.errcode === 5;
const firstLine = (e) => String(e?.message || e).split('\n')[0].slice(0, 300);

function notInstalled(what) {
  return new TaskReadFailed('not_installed',
    `${what}: this Node (${process.version}) has no built-in SQLite — use Node 22.13 or newer, or keep this project on Beads`);
}

function openDb(file, what, busyMs = BUSY_MS) {
  const sqlite = loadSqlite();
  if (!sqlite) throw notInstalled(what);
  let db;
  try {
    db = new sqlite.DatabaseSync(file);
    db.exec(`PRAGMA busy_timeout = ${busyMs}; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = OFF;`);
    const { user_version: version } = db.prepare('PRAGMA user_version').get();
    if (version > SCHEMA_VERSION) {
      db.close();
      throw new TaskReadFailed('store_refused',
        `${what}: ${file} was written by a newer great-cto (schema ${version}, this one knows ${SCHEMA_VERSION}) — upgrade great-cto`);
    }
    if (version < SCHEMA_VERSION) {
      db.exec(SCHEMA);
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
    return db;
  } catch (e) {
    if (e instanceof TaskReadFailed) throw e;
    try { db?.close(); } catch { /* already closed */ }
    if (isBusy(e)) throw new TaskReadFailed('timeout', `${what}: the task store stayed locked for ${busyMs / 1000} s`);
    throw new TaskReadFailed('store_refused', `${what}: ${file} could not be opened — ${firstLine(e)}`);
  }
}

/** Is the built-in SQLite there in this Node? */
export const sqliteAvailable = () => Boolean(loadSqlite());

/** Default id prefix: the project folder's name, the way `bd` names its ids. */
function prefixFor(cwd) {
  const p = basename(cwd).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return p || 'task';
}

/**
 * Create `.great_cto/tasks.db` in a project. The only function that creates the file.
 * @returns {{file: string, created: boolean}}
 */
export function initSqliteStore(cwd) {
  const file = join(cwd, SQLITE_FILE);
  const existed = existsSync(file);
  mkdirSync(join(cwd, '.great_cto'), { recursive: true });
  openDb(file, 'create the task store').close();
  return { file, created: !existed };
}

/**
 * @param {string} cwd Project root (the folder that holds `.great_cto/tasks.db`).
 * @param {object} [opts]
 * @param {string} [opts.prefix] Id prefix; default the folder name.
 * @param {number} [opts.busyMs] How long a write waits for another writer (tests shorten it).
 */
export function sqliteBackend(cwd, { prefix, busyMs = BUSY_MS } = {}) {
  const file = join(cwd, SQLITE_FILE);
  const idPrefix = prefix || prefixFor(cwd);
  let db = null;

  function handle(what) {
    if (db) return db;
    if (!existsSync(file)) {
      throw new TaskReadFailed('not_initialized', `${what}: ${SQLITE_FILE} does not exist — run \`great-cto tracker init\``);
    }
    db = openDb(file, what, busyMs);
    return db;
  }

  function normalize(r) {
    let labels = [];
    try { labels = JSON.parse(r.labels); } catch { /* a hand-edited row; show no labels rather than fail the list */ }
    if (!Array.isArray(labels)) labels = [];
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      notes: r.notes,
      design: r.design,
      acceptance: r.acceptance,
      status: r.status,
      priority: Number.isInteger(r.priority) ? r.priority : null,
      type: r.type,
      labels,
      owner: r.owner,
      parent: r.parent || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      closed_at: r.closed_at || null,
      close_reason: r.close_reason,
      is_gate: labels.includes('gate') || r.type === 'decision' || r.title.toLowerCase().startsWith('gate:'),
    };
  }

  function read(what, fn) {
    const d = handle(what);
    try { return fn(d); } catch (e) {
      if (isBusy(e)) throw new TaskReadFailed('timeout', `${what}: the task store stayed locked for ${busyMs / 1000} s`);
      throw new TaskReadFailed('store_refused', `${what}: ${firstLine(e)}`);
    }
  }

  /** One write = one IMMEDIATE transaction. Not taking the lock means nothing was written. */
  function write(what, fn) {
    let d;
    try { d = handle(what); } catch (e) {
      throw new TaskWriteFailed(e.code === 'not_installed' || e.code === 'not_initialized' ? e.code : 'store_refused', e.message);
    }
    try {
      d.exec('BEGIN IMMEDIATE');
    } catch (e) {
      if (isBusy(e)) throw new TaskWriteFailed('store_refused', `${what}: the task store stayed locked for ${busyMs / 1000} s — nothing was written`);
      throw new TaskWriteFailed('store_refused', `${what}: ${firstLine(e)}`);
    }
    try {
      const value = fn(d);
      d.exec('COMMIT');
      return value;
    } catch (e) {
      try { d.exec('ROLLBACK'); } catch { /* the transaction is already gone */ }
      if (e instanceof TaskWriteFailed) throw e;
      throw new TaskWriteFailed('store_refused', `${what}: ${firstLine(e)} — nothing was written`);
    }
  }

  const exists = (d, id) => Boolean(d.prepare('SELECT 1 FROM tasks WHERE id = ?').get(id));
  const mustExist = (d, id, what) => { if (!exists(d, id)) throw new TaskWriteFailed('absent', `${what}: no such task ${id}`); };
  const event = (d, task, actor, what) => d.prepare('INSERT INTO events (task, actor, at, what) VALUES (?, ?, ?, ?)').run(task, actor, now(), what);
  const appendNote = (d, id, line, at) => d.prepare(
    "UPDATE tasks SET updated_at = ?, notes = CASE notes WHEN '' THEN ? ELSE notes || char(10) || ? END WHERE id = ?",
  ).run(at, line, line, id);

  async function list() {
    return read('list tasks', (d) => d.prepare('SELECT * FROM tasks ORDER BY created_at, id').all().map(normalize));
  }

  async function get(id) {
    const row = read(`read task ${id}`, (d) => d.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
    return row ? normalize(row) : null;
  }

  async function create({ title, type, priority, labels, parent, description, actor }) {
    const what = `create "${title}"`;
    return write(what, (d) => {
      let id;
      if (parent) {
        mustExist(d, parent, what);
        const { n } = d.prepare('SELECT COUNT(*) AS n FROM tasks WHERE parent = ?').get(parent);
        id = `${parent}.${n + 1}`;
        if (exists(d, id)) id = `${parent}.${n + 1}-${randomBytes(2).toString('hex')}`;
      } else {
        do { id = `${idPrefix}-${randomBytes(3).toString('hex')}`; } while (exists(d, id));
      }
      const at = now();
      d.prepare(`INSERT INTO tasks (id, title, description, priority, type, labels, parent, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, title, description ? String(description) : '', priority ?? null, type ? String(type) : 'task',
          JSON.stringify(Array.isArray(labels) ? labels.map(String) : []), parent || null, at, at);
      event(d, id, actor, 'created');
      return id;
    });
  }

  async function move(id, status, { actor, reason }) {
    const what = `move ${id} to ${status}`;
    write(what, (d) => {
      mustExist(d, id, what);
      const at = now();
      appendNote(d, id, `[${at} ${actor}] → ${status}${reason ? `: ${reason}` : ''}`, at);
      // Leaving `closed` reopens the task: it is no longer closed at any time.
      d.prepare("UPDATE tasks SET status = ?, closed_at = NULL, close_reason = '' WHERE id = ?").run(status, id);
      event(d, id, actor, `status:${status}${reason ? ` ${reason}` : ''}`);
    });
  }

  async function close(id, { actor, reason }) {
    const what = `close ${id}`;
    write(what, (d) => {
      mustExist(d, id, what);
      const at = now();
      d.prepare("UPDATE tasks SET status = 'closed', closed_at = ?, updated_at = ?, close_reason = ? WHERE id = ?")
        .run(at, at, `[${actor}] ${reason || 'closed'}`, id);
      event(d, id, actor, `closed${reason ? ` ${reason}` : ''}`);
    });
  }

  async function link(id, dependsOn, { actor }) {
    const what = `link ${id} → ${dependsOn}`;
    write(what, (d) => {
      mustExist(d, id, what);
      mustExist(d, dependsOn, what);
      if (id === dependsOn) throw new TaskWriteFailed('store_refused', `${what}: a task cannot depend on itself`);
      d.prepare('INSERT OR IGNORE INTO deps (task, depends_on) VALUES (?, ?)').run(id, dependsOn);
      event(d, id, actor, `depends:${dependsOn}`);
    });
  }

  async function note(id, text, { actor }) {
    const what = `note on ${id}`;
    write(what, (d) => {
      mustExist(d, id, what);
      const at = now();
      appendNote(d, id, `[${at} ${actor}] ${text}`, at);
      event(d, id, actor, 'note');
    });
  }

  return { name: 'sqlite', file, list, get, create, move, close, link, note };
}
