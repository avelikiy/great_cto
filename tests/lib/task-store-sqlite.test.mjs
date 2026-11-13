/**
 * The built-in SQLite backend: what the shared contract
 * (task-store-contract.test.mjs) does not cover — which store a folder gets,
 * how a store is started, and how the file fails.
 *
 * The rule that runs through all of it: a store that could not be read is never
 * an empty store, and nothing but `tracker init` creates the file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openTaskStore, initTaskStore, TaskReadFailed, TaskWriteFailed,
} from '../../scripts/lib/task-store.mjs';
import { sqliteAvailable, SQLITE_FILE } from '../../scripts/lib/task-backend-sqlite.mjs';
import { runTracker, EXIT } from '../../scripts/tracker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HAS = sqliteAvailable();
const NO = `node:sqlite is absent in ${process.version} — not checked, not passed`;

function scratch(t, name) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `task-sqlite-${name}-`)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function project(t, name = 'p') {
  const dir = scratch(t, name);
  initTaskStore(dir);
  return dir;
}
const dbOf = (dir) => {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  return new DatabaseSync(join(dir, SQLITE_FILE));
};

// ── Which store a folder gets ────────────────────────────────────────────────

test('a project with tasks.db gets the sqlite backend, also from a subfolder', { skip: !HAS && NO }, (t) => {
  const dir = project(t);
  mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
  assert.equal(openTaskStore(dir).backend, 'sqlite');
  assert.equal(openTaskStore(join(dir, 'src', 'deep')).backend, 'sqlite');
});

test('the nearer store wins: a project inside a Beads folder keeps its own tasks.db', { skip: !HAS && NO }, (t) => {
  const outer = scratch(t, 'outer');
  mkdirSync(join(outer, '.beads'));
  const inner = join(outer, 'inner');
  mkdirSync(inner);
  assert.throws(() => initTaskStore(inner), (e) => e instanceof TaskWriteFailed && /Beads/.test(e.message),
    'a folder already covered by Beads is not given a second store');
  assert.equal(openTaskStore(inner).backend, 'beads');
});

test('init refuses where a backlog already lives; a second init is a no-op', { skip: !HAS && NO }, (t) => {
  const beads = scratch(t, 'beads');
  mkdirSync(join(beads, '.beads'));
  assert.throws(() => initTaskStore(beads), (e) => e instanceof TaskWriteFailed && e.code === 'store_refused');
  assert.equal(existsSync(join(beads, SQLITE_FILE)), false);

  const md = scratch(t, 'md');
  mkdirSync(join(md, '.great_cto'));
  writeFileSync(join(md, '.great_cto', 'tasks.md'), '| id | title | status |\n|--|--|--|\n| T-1 | a | open |\n');
  assert.throws(() => initTaskStore(md), (e) => e instanceof TaskWriteFailed && /migration/.test(e.message));

  const fresh = scratch(t, 'fresh');
  assert.equal(initTaskStore(fresh).created, true);
  assert.equal(initTaskStore(fresh).created, false);
  mkdirSync(join(fresh, 'sub'));
  assert.throws(() => initTaskStore(join(fresh, 'sub')), TaskWriteFailed, 'no nested second store');
});

test('a forced sqlite store with no file is not initialised — and reading it creates nothing', { skip: !HAS && NO }, async (t) => {
  const dir = scratch(t, 'none');
  const store = openTaskStore(dir, { backend: 'sqlite' });
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'not_initialized');
  await assert.rejects(() => store.create({ title: 'x', actor: 'human' }), (e) => e instanceof TaskWriteFailed && e.code === 'not_initialized');
  assert.equal(existsSync(join(dir, SQLITE_FILE)), false);
});

// ── How the file fails ───────────────────────────────────────────────────────

test('a file that is not a database is unread, not an empty backlog', { skip: !HAS && NO }, async (t) => {
  const dir = scratch(t, 'garbage');
  mkdirSync(join(dir, '.great_cto'));
  writeFileSync(join(dir, SQLITE_FILE), 'this is not sqlite '.repeat(400));
  const store = openTaskStore(dir);
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'store_refused');
  await assert.rejects(() => store.findOpen({ text: 'x' }), TaskReadFailed, 'the duplicate check must not see "no duplicates"');
});

test('a store written by a newer great-cto is refused, not misread', { skip: !HAS && NO }, async (t) => {
  const dir = project(t);
  const db = dbOf(dir);
  db.exec('PRAGMA user_version = 99');
  db.close();
  await assert.rejects(() => openTaskStore(dir).list(), (e) => e instanceof TaskReadFailed && /newer great-cto/.test(e.message));
});

test('a write that cannot take the lock wrote nothing and says so', { skip: !HAS && NO }, async (t) => {
  const dir = project(t);
  const store = openTaskStore(dir, { busyMs: 200 });
  const { id } = await store.create({ title: 'locked out', actor: 'human' });
  const other = dbOf(dir);
  other.exec('BEGIN IMMEDIATE');
  try {
    await assert.rejects(() => store.note(id, 'should not land', { actor: 'human' }),
      (e) => e instanceof TaskWriteFailed && e.code === 'store_refused' && /nothing was written/.test(e.message));
  } finally { other.exec('ROLLBACK'); other.close(); }
  assert.doesNotMatch((await store.get(id)).task.notes, /should not land/);
});

test('without node:sqlite the backend says not_installed, never empty', { skip: !HAS && NO }, async (t) => {
  const dir = project(t);
  const real = process.getBuiltinModule;
  process.getBuiltinModule = (name) => (name === 'node:sqlite' ? undefined : real.call(process, name));
  try {
    await assert.rejects(() => openTaskStore(dir).list(), (e) => e instanceof TaskReadFailed && e.code === 'not_installed' && /Node 22\.13/.test(e.message));
  } finally { process.getBuiltinModule = real; }
});

// ── What the store keeps ─────────────────────────────────────────────────────

test('children are numbered under their parent; a missing parent is absent', { skip: !HAS && NO }, async (t) => {
  const dir = project(t, 'kids');
  const store = openTaskStore(dir);
  const { id: epic } = await store.create({ title: 'epic', type: 'epic', actor: 'agent:pm' });
  assert.equal(epic.slice(0, -7), basename(dir).toLowerCase(), 'the id prefix is the folder name, as with bd');
  assert.match(epic, /-[0-9a-f]{6}$/);
  const a = await store.create({ title: 'one', parent: epic, actor: 'agent:pm' });
  const b = await store.create({ title: 'two', parent: epic, actor: 'agent:pm' });
  assert.deepEqual([a.id, b.id], [`${epic}.1`, `${epic}.2`]);
  assert.deepEqual((await store.list({ parent: epic })).tasks.map((x) => x.id), [a.id, b.id]);
  await assert.rejects(() => store.create({ title: 'orphan', parent: 'nope-000000', actor: 'human' }),
    (e) => e instanceof TaskWriteFailed && e.code === 'absent');
});

test('every write is an event with its actor; reopening clears the close', { skip: !HAS && NO }, async (t) => {
  const dir = project(t);
  const store = openTaskStore(dir);
  const { id } = await store.create({ title: 'audited', actor: 'agent:senior-dev' });
  const { id: other } = await store.create({ title: 'dep', actor: 'human' });
  await store.link(id, other, { actor: 'agent:pm' });
  await assert.rejects(() => store.link(id, id, { actor: 'human' }), TaskWriteFailed);
  await store.close(id, { actor: 'agent:qa-engineer', reason: 'verified' });
  assert.ok((await store.get(id)).task.closed_at);
  await store.move(id, 'open', { actor: 'human', reason: 'regressed' });
  const back = (await store.get(id)).task;
  assert.equal(back.status, 'open');
  assert.equal(back.closed_at, null);
  assert.equal(back.close_reason, '');

  const db = dbOf(dir);
  const events = db.prepare('SELECT actor, what FROM events WHERE task = ? ORDER BY seq').all(id).map((e) => `${e.actor} ${e.what}`);
  db.close();
  assert.deepEqual(events, [
    'agent:senior-dev created',
    `agent:pm depends:${other}`,
    'agent:qa-engineer closed verified',
    'human status:open regressed',
  ]);
});

test('three processes writing at once: every create lands, no id twice', { skip: !HAS && NO, timeout: 60000 }, async (t) => {
  const dir = project(t, 'race');
  const worker = `
    const { openTaskStore } = await import(${JSON.stringify(join(ROOT, 'scripts/lib/task-store.mjs'))});
    const store = openTaskStore(process.argv[1]);
    for (let i = 0; i < 30; i++) await store.create({ title: process.argv[2] + ' ' + i, actor: 'system:race' });`;
  const run = (tag) => new Promise((done, fail) => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', worker, dir, tag], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => (code === 0 ? done() : fail(new Error(`worker ${tag} exited ${code}: ${err.slice(0, 300)}`))));
  });
  await Promise.all(['a', 'b', 'c'].map(run));
  const { tasks } = await openTaskStore(dir).list();
  assert.equal(tasks.length, 90);
  assert.equal(new Set(tasks.map((x) => x.id)).size, 90);
});

// ── From a shell ─────────────────────────────────────────────────────────────

test('tracker init, then the usual commands; init on a Beads project is refused', { skip: !HAS && NO }, async (t) => {
  const dir = scratch(t, 'cli');
  const init = await runTracker(['init', '--dir', dir, '--json']);
  assert.equal(init.code, EXIT.ok);
  assert.equal(JSON.parse(init.out).created, true);
  const made = await runTracker(['create', 'from the shell', '--actor', 'human', '--dir', dir, '--json']);
  assert.equal(made.code, EXIT.ok);
  const { id } = JSON.parse(made.out);
  const shown = await runTracker(['show', id, '--dir', dir, '--json']);
  assert.equal(JSON.parse(shown.out).task.title, 'from the shell');

  const beads = scratch(t, 'cli-beads');
  mkdirSync(join(beads, '.beads'));
  const refused = await runTracker(['init', '--dir', beads]);
  assert.equal(refused.code, EXIT.refused);
  assert.match(refused.err, /Beads/);
});
