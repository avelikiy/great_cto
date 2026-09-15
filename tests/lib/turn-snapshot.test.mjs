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
import { snapshotTurn, listTurns, turnDiff, pruneTurns, pruneStaleSessions, listSessions, turnPatch, TURN_REF_PREFIX } from '../../scripts/lib/turn-snapshot.mjs';

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

// ── step 2: two hooks at once, and sessions that ended long ago ─────────────

test('turns taken at the same moment get distinct numbers — none overwrites another', async (t) => {
  // Stop and SubagentStop can fire together for one session. Without a create-only
  // ref update, both read "next is n" and the second silently replaces the first.
  const { root } = repo(t);
  const { spawn } = await import('node:child_process');
  const lib = new URL('../../scripts/lib/turn-snapshot.mjs', import.meta.url).pathname;
  const run = (i) => new Promise((res) => {
    writeFileSync(join(root, `f${i}.txt`), `${i}\n`);
    const p = spawn(process.execPath, ['--input-type=module', '-e',
      `import { snapshotTurn } from ${JSON.stringify(lib)}; const r = snapshotTurn(${JSON.stringify(root)}, { session: 'race', env: {} }); process.stdout.write(JSON.stringify(r));`]);
    let out = ''; p.stdout.on('data', (b) => { out += b; }); p.on('close', () => res(JSON.parse(out || '{}')));
  });
  const results = await Promise.all([0, 1, 2, 3, 4].map(run));
  assert.ok(results.every((r) => r.state === 'recorded'), JSON.stringify(results));
  const turns = listTurns(root, { session: 'race' });
  assert.equal(turns.length, 5, `five snapshots, five refs — got ${turns.map((x) => x.turn)}`);
  assert.equal(new Set(results.map((r) => r.turn)).size, 5, 'each call reports its own turn');
});

test('a session whose newest turn is older than the limit is removed; a recent one is kept', (t) => {
  const { root, git } = repo(t);
  snapshotTurn(root, { session: 'recent', env: {} });
  const tree = git('write-tree').trim();
  const old = execFileSync('git', ['commit-tree', tree, '-p', 'HEAD'], {
    cwd: root, encoding: 'utf8', input: 'old turn\n',
    env: { ...process.env, GIT_COMMITTER_DATE: '2026-08-01T00:00:00Z', GIT_AUTHOR_DATE: '2026-08-01T00:00:00Z' },
  }).trim();
  git('update-ref', `${TURN_REF_PREFIX}old/0`, old);
  git('update-ref', `${TURN_REF_PREFIX}old/1`, old);
  const r = pruneStaleSessions(root, { maxAgeDays: 14, now: Date.parse('2026-09-15T00:00:00Z') });
  assert.deepEqual(r.deleted, ['old']);
  assert.deepEqual(listTurns(root, { session: 'old' }), []);
  assert.equal(listTurns(root, { session: 'recent' }).length, 1, 'a session with a recent turn is untouched');
});

// ── reading turns for the board (ADR-023, board view) ──────────────────────

test('sessions list newest first, with how many turns and when the last one was', (t) => {
  const { root, git } = repo(t);
  const tree = git('write-tree').trim();
  const at = (iso) => execFileSync('git', ['commit-tree', tree, '-p', 'HEAD'], {
    cwd: root, encoding: 'utf8', input: 'turn\n',
    env: { ...process.env, GIT_COMMITTER_DATE: iso, GIT_AUTHOR_DATE: iso },
  }).trim();
  git('update-ref', `${TURN_REF_PREFIX}older/0`, at('2026-09-10T10:00:00Z'));
  git('update-ref', `${TURN_REF_PREFIX}newer/0`, at('2026-09-14T10:00:00Z'));
  git('update-ref', `${TURN_REF_PREFIX}newer/1`, at('2026-09-14T11:00:00Z'));
  const s = listSessions(root);
  assert.deepEqual(s.map((x) => x.session), ['newer', 'older']);
  assert.equal(s[0].turns, 2);
  assert.equal(s[0].newestTurn, 1);
  assert.equal(s[0].newestAt, Date.parse('2026-09-14T11:00:00Z'));
  assert.equal(listSessions(root, { limit: 1 }).length, 1);
});

test('a turn patch is that turn’s unified diff, with its paths', (t) => {
  const { root } = repo(t);
  snapshotTurn(root, { session: 's1', env: {} });
  writeFileSync(join(root, 'app.js'), 'export const x = 2;\n');
  writeFileSync(join(root, 'new.mjs'), 'export const y = 1;\n');
  snapshotTurn(root, { session: 's1', env: {} });
  const p = turnPatch(root, { session: 's1', turn: 1 });
  assert.equal(p.state, 'ok');
  assert.deepEqual(p.paths.sort(), ['app.js', 'new.mjs']);
  assert.match(p.patch, /^-export const x = 1;$/m);
  assert.match(p.patch, /^\+export const x = 2;$/m);
  assert.equal(p.truncated, false);
});

test('a large turn patch is cut at the cap and says so', (t) => {
  const { root } = repo(t);
  snapshotTurn(root, { session: 's1', env: {} });
  writeFileSync(join(root, 'big.txt'), 'line of text\n'.repeat(5000));
  snapshotTurn(root, { session: 's1', env: {} });
  const p = turnPatch(root, { session: 's1', turn: 1, maxBytes: 1000 });
  assert.equal(p.state, 'ok');
  assert.equal(p.truncated, true);
  assert.ok(Buffer.byteLength(p.patch) <= 1000, `patch is ${Buffer.byteLength(p.patch)} bytes`);
  assert.deepEqual(p.paths, ['big.txt'], 'the paths are complete even when the patch is cut');
});

test('a turn patch says which of invalid, none and ok it is', (t) => {
  const { root } = repo(t);
  snapshotTurn(root, { session: 's1', env: {} });
  assert.equal(turnPatch(root, { session: '../heads/main', turn: 0 }).state, 'invalid');
  assert.equal(turnPatch(root, { session: 's1', turn: -1 }).state, 'invalid');
  assert.equal(turnPatch(root, { session: 's1', turn: 1.5 }).state, 'invalid');
  assert.equal(turnPatch(root, { session: 's1', turn: 7 }).state, 'none');
  const nogit = mkdtempSync(join(tmpdir(), 'gcto-turns-nogit2-'));
  try {
    assert.equal(turnPatch(nogit, { session: 's1', turn: 0 }).state, 'none');
    assert.deepEqual(listSessions(nogit), []);
  } finally { rmSync(nogit, { recursive: true, force: true }); }
});
