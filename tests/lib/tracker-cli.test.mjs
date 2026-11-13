/**
 * `tracker` from a shell: the exit code is the contract.
 *
 * A shell caller branches on `$?`. `scripts/bd-create-if-new.sh` shows what
 * happens without one: a failed search reads as "no duplicate" and a duplicate is
 * created. So 3 (absent) and 4 (unread) are pinned here as different numbers,
 * through the real program, with a `bd` the test controls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const TRACKER = join(ROOT, 'scripts', 'tracker.mjs');
const NPM_CLI = join(ROOT, 'packages', 'cli', 'index.mjs');

function project(t, stubBody) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tracker-cli-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, '.beads'));
  const bin = join(dir, 'bd-stub');
  writeFileSync(bin, `#!/bin/sh\n${stubBody}\n`);
  chmodSync(bin, 0o755);
  return { dir, bin };
}
function tracker(p, args, entry = [TRACKER]) {
  return spawnSync(process.execPath, [...entry, ...args, '--dir', p.dir], {
    encoding: 'utf8', timeout: 30000, env: { ...process.env, GREAT_CTO_BD_BIN: p.bin, GREAT_CTO_NO_UPDATE_CHECK: '1' },
  });
}

const ONE = '{"id":"x-1","title":"one task","status":"open","priority":2,"labels":["alpha"],"created_at":"2026-11-11T00:00:00Z"}';
const ANSWERS = `
case "$*" in
  *"show nope"*) echo '{"error":"no issues found matching the provided IDs"}'; exit 1 ;;
  *"update nope"*) echo 'Error resolving nope: no issue found matching "nope"' >&2; exit 1 ;;
  *show*) echo '[${ONE}]' ;;
  *list*) echo '[${ONE}]' ;;
  *create*) echo '{"id":"x-2"}' ;;
  *update*|*close*|*dep*) echo '[]' ;;
esac`;
const BROKEN = 'echo "Error: failed to open database: LOCK" >&2; exit 1';

test('0: reads and writes that worked', (t) => {
  const p = project(t, ANSWERS);
  const list = tracker(p, ['list', '--json']);
  assert.equal(list.status, 0, list.stderr);
  const parsed = JSON.parse(list.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.count, 1);
  assert.equal(parsed.tasks[0].id, 'x-1');

  assert.match(tracker(p, ['show', 'x-1']).stdout, /x-1 {2}open/);
  const created = tracker(p, ['create', 'a new task', '--actor', 'agent:pm', '--label', 'a', '--label', 'b', '--priority', '1']);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(created.stdout.trim(), 'x-2', 'plain output of create is the id, so a script can capture it');
  assert.equal(tracker(p, ['move', 'x-1', 'blocked', '--actor', 'human', '--reason', 'waiting']).status, 0);
  assert.equal(tracker(p, ['close', 'x-1', '--actor', 'human']).status, 0);
  assert.equal(tracker(p, ['link', 'x-1', '--depends-on', 'x-2', '--actor', 'human']).status, 0);
  assert.equal(tracker(p, ['note', 'x-1', 'text', '--actor', 'system:hook']).status, 0);
});

test('0 with an empty list says the store WAS read', (t) => {
  const p = project(t, ANSWERS);
  const r = tracker(p, ['find-open', '--text', 'no such words']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no tasks match \(the store was read\)/);
});

test('2: usage — nothing reaches the store', (t) => {
  // A stub that would fail the test if it were ever run.
  const p = project(t, `echo ran > "${'$'}(dirname "$0")/ran"; echo '[]'`);
  for (const args of [
    [], ['bogus'], ['show'], ['move', 'x-1', 'blocked'], ['move', 'x-1', 'nonsense', '--actor', 'human'],
    ['create', 'title'], ['create', 'title', '--actor', 'me'], ['list', '--status', 'backlog'], ['list', '--wat'],
    ['link', 'x-1', '--actor', 'human'], ['create', 'title', '--actor', 'human', '--priority', 'high'],
  ]) {
    const r = tracker(p, args);
    assert.equal(r.status, 2, `${JSON.stringify(args)} → ${r.status} ${r.stderr}`);
  }
  assert.equal(existsSync(join(p.dir, 'ran')), false, 'a usage error must not start bd');
});

test('3: absent — the store answered and the task is not there', (t) => {
  const p = project(t, ANSWERS);
  const show = tracker(p, ['show', 'nope', '--json']);
  assert.equal(show.status, 3);
  assert.equal(JSON.parse(show.stdout).error, 'absent');
  assert.equal(tracker(p, ['move', 'nope', 'blocked', '--actor', 'human']).status, 3);
});

test('4: unread — never 3, never 0 with an empty list', (t) => {
  const p = project(t, BROKEN);
  for (const args of [['list'], ['show', 'x-1'], ['find-open', '--text', 'cve']]) {
    const r = tracker(p, args);
    assert.equal(r.status, 4, `${args.join(' ')} → ${r.status}`);
    assert.match(r.stderr, /NOT READ/);
    assert.equal(r.stdout, '', 'no task list is printed for a failed read');
  }
  const json = tracker(p, ['list', '--json']);
  assert.equal(json.status, 4);
  assert.deepEqual({ ok: JSON.parse(json.stdout).ok, error: JSON.parse(json.stdout).error, cause: JSON.parse(json.stdout).cause },
    { ok: false, error: 'unread', cause: 'store_refused' });
});

test('4: a project with no task source at all', (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'tracker-cli-none-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [TRACKER, 'list', '--dir', dir], { encoding: 'utf8' });
  assert.equal(r.status, 4);
  assert.match(r.stderr, /NOT READ — no task source/);
});

test('5: refused — the store answered and said no to a write', (t) => {
  const p = project(t, 'echo "Error: invalid state" >&2; exit 1');
  assert.equal(tracker(p, ['move', 'x-1', 'blocked', '--actor', 'human']).status, 5);
});

test('great-cto tracker reaches the same program', (t) => {
  if (!existsSync(join(ROOT, 'packages', 'cli', 'dist', 'tracker.js'))) {
    return t.skip('packages/cli is not built — not checked, not passed');
  }
  const p = project(t, ANSWERS);
  const r = tracker(p, ['show', 'nope'], [NPM_CLI, 'tracker']);
  assert.equal(r.status, 3, r.stderr);
  const ok = tracker(p, ['list', '--json'], [NPM_CLI, 'tracker']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).count, 1, 'stdout is exactly the JSON — no update hint mixed in');
});
