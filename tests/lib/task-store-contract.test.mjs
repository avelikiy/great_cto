/**
 * The task store contract: one suite, three ways in.
 *
 *   1. a real store in a temporary project — `bd` (projects on Beads) and the
 *      built-in `.great_cto/tasks.db` (new projects), held to the same tests
 *   2. a `.great_cto/tasks.md` project      — the supported bd-less source
 *   3. a `bd` that fails, hangs or prints garbage
 *
 * The third is the reason the module exists. Two shipping scripts already turn a
 * failed read into "nothing there" (`bd-create-if-new.sh` then creates a duplicate),
 * so every failure here must surface as TaskReadFailed / TaskWriteUnknown with a
 * cause, and never as an empty list, null or `absent`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openTaskStore, initTaskStore, STATUSES, TaskReadFailed, TaskWriteFailed, TaskWriteUnknown, TaskUsageError,
} from '../../scripts/lib/task-store.mjs';
import { sqliteAvailable } from '../../scripts/lib/task-backend-sqlite.mjs';

const scratch = (name) => realpathSync(mkdtempSync(join(tmpdir(), `task-store-${name}-`)));

/** A stub `bd`: a shell script whose behaviour the test chooses. */
function stubBd(dir, body) {
  const p = join(dir, 'bd-stub');
  writeFileSync(p, `#!/bin/sh\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

function beadsProject(t) {
  const project = scratch('bd');
  t.after(() => rmSync(project, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q', '.'], { cwd: project });
  const init = spawnSync('bd', ['init'], { cwd: project, encoding: 'utf8', timeout: 60000 });
  if (init.error?.code === 'ENOENT') { t.skip('bd is not installed — not checked, not passed'); return null; }
  if (init.status !== 0) {
    t.skip(`bd init failed — not checked, not passed: ${(init.stderr || init.stdout || '').trim().slice(0, 160)}`);
    return null;
  }
  return project;
}

// ── 1. A real store: bd, and the built-in SQLite file ─────────────────────────

function sqliteProject(t) {
  if (!sqliteAvailable()) { t.skip(`node:sqlite is absent in ${process.version} — not checked, not passed`); return null; }
  const project = scratch('sqlite');
  t.after(() => rmSync(project, { recursive: true, force: true }));
  initTaskStore(project);
  return project;
}

const projectFor = (kind, t) => (kind === 'beads' ? beadsProject(t) : sqliteProject(t));

for (const kind of ['beads', 'sqlite']) {

  test(`${kind}: create, read back, move, note, link, close`, async (t) => {
    const project = projectFor(kind, t);
    if (!project) return;
    const store = openTaskStore(project);
    assert.equal(store.backend, kind);

    const a = await store.create({ title: 'contract: first', type: 'task', priority: 1, labels: ['alpha', 'phase:qa'], description: 'body text', actor: 'agent:qa-engineer' });
    assert.match(a.id, /\S+-\S+/);
    const b = await store.create({ title: 'contract: second', actor: 'human' });

    const got = await store.get(a.id);
    assert.equal(got.state, 'found');
    assert.equal(got.task.title, 'contract: first');
    assert.equal(got.task.status, 'open');
    assert.equal(got.task.priority, 1);
    assert.deepEqual([...got.task.labels].sort(), ['alpha', 'phase:qa']);
    assert.equal(got.task.description, 'body text');
    assert.equal(got.task.is_gate, false);

    assert.deepEqual(await store.get('nope-zzzz'), { state: 'absent' }, 'a task that is not there is absent, not an error');

    const moved = await store.move(a.id, 'in_progress', { actor: 'agent:senior-dev', reason: 'claimed' });
    assert.equal(moved.to, 'in_progress');
    await store.move(a.id, 'blocked', { actor: 'agent:senior-dev', reason: 'waiting for a key' });
    await store.note(a.id, 'a second note', { actor: 'human' });
    const afterNotes = (await store.get(a.id)).task;
    assert.equal(afterNotes.status, 'blocked');
    // Notes are appended. `bd update --notes` REPLACES them, which is how a gate
    // approved with a reason loses whatever was written on it before.
    assert.match(afterNotes.notes, /claimed/);
    assert.match(afterNotes.notes, /waiting for a key/);
    assert.match(afterNotes.notes, /a second note/);
    assert.match(afterNotes.notes, /agent:senior-dev/, 'the declared actor is in the store');

    await store.link(b.id, a.id, { actor: 'human' });

    const open = await store.list();
    assert.equal(open.state, 'read');
    assert.deepEqual(open.tasks.map((x) => x.id).sort(), [a.id, b.id].sort());
    assert.deepEqual((await store.list({ label: 'alpha' })).tasks.map((x) => x.id), [a.id]);
    assert.deepEqual((await store.list({ status: 'blocked' })).tasks.map((x) => x.id), [a.id]);
    assert.deepEqual((await store.findOpen({ text: 'SECOND' })).tasks.map((x) => x.id), [b.id]);

    await store.close(a.id, { actor: 'agent:qa-engineer', reason: 'verified' });
    assert.equal((await store.get(a.id)).task.status, 'closed');
    assert.deepEqual((await store.list()).tasks.map((x) => x.id), [b.id], 'closed tasks leave the default list');
    assert.equal((await store.list({ includeClosed: true })).tasks.length, 2);
    assert.deepEqual((await store.findOpen({ text: 'first' })).tasks, [], 'an empty answer after a real read is a real empty');
  });

  test(`${kind}: a gate is recognised; deferred is a status, not "backlog"`, async (t) => {
    const project = projectFor(kind, t);
    if (!project) return;
    const store = openTaskStore(project);
    const g = await store.create({ title: 'gate:plan — approve the plan', labels: ['gate'], type: 'decision', actor: 'agent:architect' });
    const d = await store.create({ title: 'later', actor: 'human' });
    await store.move(d.id, 'deferred', { actor: 'human', reason: 'not this month' });
    assert.equal((await store.get(g.id)).task.is_gate, true);
    assert.equal((await store.get(d.id)).task.status, 'deferred');
  });

  test(`${kind}: writes to a missing task fail as absent, and usage errors are refused before the store runs`, async (t) => {
    const project = projectFor(kind, t);
    if (!project) return;
    const store = openTaskStore(project);
    await assert.rejects(() => store.move('nope-zzzz', 'blocked', { actor: 'human' }),
      (e) => e instanceof TaskWriteFailed && e.code === 'absent');
    const a = await store.create({ title: 'usage', actor: 'human' });
    await assert.rejects(() => store.move(a.id, 'bogus', { actor: 'human' }), TaskUsageError);
    await assert.rejects(() => store.move(a.id, 'blocked', {}), TaskUsageError, 'a write without an actor is refused');
    await assert.rejects(() => store.move(a.id, 'blocked', { actor: 'somebody' }), TaskUsageError, 'the actor has a shape');
    await assert.rejects(() => store.create({ title: '  ', actor: 'human' }), TaskUsageError);
    assert.equal((await store.get(a.id)).task.status, 'open', 'a refused write changed nothing');
  });
}

test('the status vocabulary is the five the store really holds', () => {
  assert.deepEqual([...STATUSES].sort(), ['blocked', 'closed', 'deferred', 'in_progress', 'open']);
});

// ── 2. tasks.md ──────────────────────────────────────────────────────────────

test('tasks.md: list, get, absent, status write; unsupported writes say so', async (t) => {
  const project = scratch('md');
  t.after(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(join(project, '.great_cto'));
  writeFileSync(join(project, '.great_cto', 'tasks.md'), [
    '# Tasks', '',
    '| id | title | status | owner |',
    '|----|-------|--------|-------|',
    '| T-1 | Write the parser | open | senior-dev |',
    '| T-2 | gate:plan — approve | open | cto |',
    '| T-3 | Old thing | done | qa |',
    '',
  ].join('\n'));
  const store = openTaskStore(project);
  assert.equal(store.backend, 'tasks-md');

  const all = await store.list({ includeClosed: true });
  assert.equal(all.state, 'read');
  assert.deepEqual(all.tasks.map((x) => x.id).sort(), ['T-1', 'T-2', 'T-3']);
  assert.deepEqual((await store.list()).tasks.map((x) => x.id).sort(), ['T-1', 'T-2']);

  const one = await store.get('T-1');
  assert.equal(one.state, 'found');
  assert.equal(one.task.status, 'open');
  assert.deepEqual(await store.get('T-9'), { state: 'absent' });

  await store.move('T-1', 'in_progress', { actor: 'agent:senior-dev' });
  assert.match(readFileSync(join(project, '.great_cto', 'tasks.md'), 'utf8'), /\| T-1 \| Write the parser \| in_progress \|/);
  assert.equal((await store.get('T-1')).task.status, 'in_progress');

  await assert.rejects(() => store.create({ title: 'new', actor: 'human' }),
    (e) => e instanceof TaskWriteFailed && e.code === 'unsupported' && /tasks-md/.test(e.message));
  await assert.rejects(() => store.move('T-9', 'blocked', { actor: 'human' }),
    (e) => e instanceof TaskWriteFailed && e.code === 'absent');
});

test('a project with no task source is unread, not empty', () => {
  const project = scratch('none');
  try {
    assert.throws(() => openTaskStore(project), (e) => e instanceof TaskReadFailed && e.code === 'not_initialized');
  } finally { rmSync(project, { recursive: true, force: true }); }
});

// ── 3. A bd that does not answer ─────────────────────────────────────────────

function failingStore(t, body, opts = {}) {
  const project = scratch('stub');
  t.after(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(join(project, '.beads'));
  return openTaskStore(project, { bin: stubBd(project, body), ...opts });
}

test('unread: bd exits non-zero with a complaint', async (t) => {
  const store = failingStore(t, 'echo "Error: failed to open database: LOCK" >&2; exit 1');
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'store_refused' && /LOCK/.test(e.message));
  await assert.rejects(() => store.get('x-1'), (e) => e instanceof TaskReadFailed && e.code === 'store_refused',
    'a refused read of one task is not "absent"');
  await assert.rejects(() => store.findOpen({ text: 'cve' }), TaskReadFailed,
    'the duplicate check must not conclude "no duplicate" from a failed search');
});

test('unread: bd prints something that is not JSON', async (t) => {
  const store = failingStore(t, 'echo "warning: something"; echo "not json at all"; exit 0');
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'bad_output');
});

test('unread: bd answers with a JSON error object instead of a list', async (t) => {
  const store = failingStore(t, `echo '{"error":"database is locked","schema_version":1}'; exit 0`);
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'store_refused' && /locked/.test(e.message));
});

test('unread: bd is not installed', async (t) => {
  const project = scratch('enoent');
  t.after(() => rmSync(project, { recursive: true, force: true }));
  mkdirSync(join(project, '.beads'));
  const store = openTaskStore(project, { bin: join(project, 'no-such-bd') });
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'not_installed');
});

test('unread: bd says there is no database', async (t) => {
  const store = failingStore(t, 'echo "Error: no beads database found" >&2; exit 1');
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'not_initialized');
});

test('a hung read is a timeout, and the hung process is killed', async (t) => {
  const store = failingStore(t, 'exec sleep 30', { timeoutMs: 400 });
  const started = Date.now();
  await assert.rejects(() => store.list(), (e) => e instanceof TaskReadFailed && e.code === 'timeout');
  assert.ok(Date.now() - started < 5000, 'SIGKILL, not a wait for the child to finish');
});

test('a hung write is unknown — never retried blindly, never reported as done', async (t) => {
  // Every call hangs, so the look-back read cannot confirm anything either.
  const store = failingStore(t, 'exec sleep 30', { timeoutMs: 400 });
  await assert.rejects(() => store.create({ title: 'maybe landed', actor: 'human' }), TaskWriteUnknown);
  await assert.rejects(() => store.move('x-1', 'blocked', { actor: 'human' }), TaskWriteUnknown);
});

test('a write that timed out but landed is reported as landed, once', async (t) => {
  // The stub hangs on `create` and `update`, but answers reads as if the write
  // had gone through — the case a blind retry turns into a duplicate.
  const now = new Date().toISOString();
  const body = `
case "$*" in
  *create*|*update*) exec sleep 30 ;;
  *show*) echo '[{"id":"x-1","title":"landed anyway","status":"blocked","priority":2,"labels":[],"created_at":"${now}","updated_at":"${now}"}]' ;;
  *list*) echo '[{"id":"x-1","title":"landed anyway","status":"open","priority":2,"labels":[],"created_at":"${now}","updated_at":"${now}"}]' ;;
esac`;
  const store = failingStore(t, body, { timeoutMs: 400 });
  const created = await store.create({ title: 'landed anyway', actor: 'human' });
  assert.deepEqual(created, { id: 'x-1', recovered: true });
  const moved = await store.move('x-1', 'blocked', { actor: 'human' });
  assert.deepEqual(moved, { id: 'x-1', to: 'blocked', recovered: true });
});
