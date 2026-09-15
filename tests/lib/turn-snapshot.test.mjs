// ADR-023 step 1: what each agent turn changed, kept as a git ref.
//
// A receipt answers "is this the tree that was reviewed?" — not "what did this
// turn change?". A turn snapshot is a commit under refs/great-cto/turns/<session>/<n>,
// built through a temporary index so the user's index and working tree are never
// touched, with the previous turn (or HEAD) as parent. These pin the properties
// measured in the ADR before any hook calls it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { snapshotTurn, listTurns, turnDiff, pruneTurns, TURN_REF_PREFIX } from '../../scripts/lib/turn-snapshot.mjs';

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-turns-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(root, 'app.js'), 'export const x = 1;\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  git('add', '.'); git('commit', '-q', '-m', 'init');
  return { root, git };
}

test('a snapshot leaves the index and working tree exactly as they were', (t) => {
  const { root, git } = repo(t);
  writeFileSync(join(root, 'app.js'), 'export const x = 2;\n');
  writeFileSync(join(root, 'staged.js'), 'staged\n');
  git('add', 'staged.js');
  const indexBefore = git('ls-files', '--stage');
  const statusBefore = git('status', '--porcelain');
  const r = snapshotTurn(root, { session: 's1' });
  assert.equal(r.state, 'recorded');
  assert.equal(git('ls-files', '--stage'), indexBefore, 'what the user staged is untouched');
  assert.equal(git('status', '--porcelain'), statusBefore, 'and so is the working tree');
});

test('a turn records new files, and its diff holds only that turn', (t) => {
  const { root, git } = repo(t);
  const t0 = snapshotTurn(root, { session: 's1' });
  writeFileSync(join(root, 'app.js'), 'export const x = 2;\n');
  writeFileSync(join(root, 'new.mjs'), 'export const y = 1;\n');
  const t1 = snapshotTurn(root, { session: 's1' });
  writeFileSync(join(root, 'app.js'), 'export const x = 3;\n');
  const t2 = snapshotTurn(root, { session: 's1' });
  assert.deepEqual([t0.turn, t1.turn, t2.turn], [0, 1, 2]);
  assert.equal(t1.ref, `${TURN_REF_PREFIX}s1/1`);
  assert.deepEqual(turnDiff(root, { session: 's1', turn: 1 }).paths.sort(), ['app.js', 'new.mjs']);
  assert.deepEqual(turnDiff(root, { session: 's1', turn: 2 }).paths, ['app.js'], 'turn 2 did not touch new.mjs');
  assert.equal(git('branch', '--list').trim(), '* master', 'not a branch');
});

test('the events log and gitignored files stay out of a snapshot', (t) => {
  const { root, git } = repo(t);
  mkdirSync(join(root, '.great_cto')); mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules', 'dep.js'), 'x\n');
  writeFileSync(join(root, '.great_cto', 'events.jsonl'), '{"kind":"stop"}\n');
  const r = snapshotTurn(root, { session: 's1' });
  const files = git('ls-tree', '-r', '--name-only', r.commit).split('\n').filter(Boolean);
  assert.ok(!files.some((f) => f.startsWith('node_modules/')), 'gitignored files are not snapshotted');
  assert.ok(!files.includes('.great_cto/events.jsonl'), 'the events log is not snapshotted');
  appendFileSync(join(root, '.great_cto', 'events.jsonl'), '{"kind":"stop"}\n');
  const next = snapshotTurn(root, { session: 's1' });
  assert.deepEqual(turnDiff(root, { session: 's1', turn: next.turn }).paths, [], 'a growing events log is not a change');
});

test('turns list in order per session, and pruning keeps the newest', (t) => {
  const { root } = repo(t);
  for (let i = 0; i < 5; i++) { writeFileSync(join(root, 'app.js'), `export const x = ${i};\n`); snapshotTurn(root, { session: 'a' }); }
  snapshotTurn(root, { session: 'b' });
  assert.deepEqual(listTurns(root, { session: 'a' }).map((x) => x.turn), [0, 1, 2, 3, 4]);
  assert.deepEqual(listTurns(root, { session: 'b' }).map((x) => x.turn), [0]);
  const pruned = pruneTurns(root, { session: 'a', keep: 2 });
  assert.deepEqual(pruned.deleted, [0, 1, 2]);
  assert.deepEqual(listTurns(root, { session: 'a' }).map((x) => x.turn), [3, 4]);
  assert.deepEqual(listTurns(root, { session: 'b' }).map((x) => x.turn), [0], 'another session is untouched');
});

test('a session name cannot escape its ref namespace', (t) => {
  const { root } = repo(t);
  for (const bad of ['../heads/main', 'a/b', '', 'x y', 'a..b']) {
    const r = snapshotTurn(root, { session: bad });
    assert.equal(r.state, 'refused', `session ${JSON.stringify(bad)} must be refused`);
  }
});

test('outside a git repository it says none, and never throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-turns-nogit-'));
  try {
    let r;
    assert.doesNotThrow(() => { r = snapshotTurn(dir, { session: 's1' }); });
    assert.equal(r.state, 'none');
    assert.ok(r.why);
    assert.deepEqual(listTurns(dir, { session: 's1' }), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('GREAT_CTO_DISABLE_TURNS=1 records nothing, and says so', (t) => {
  const { root } = repo(t);
  const r = snapshotTurn(root, { session: 's1', env: { GREAT_CTO_DISABLE_TURNS: '1' } });
  assert.equal(r.state, 'disabled');
  assert.deepEqual(listTurns(root, { session: 's1' }), []);
});
