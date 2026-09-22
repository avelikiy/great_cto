// merge-preflight answers "may this lane merge, and cleanly?" without touching
// the tree, the index or a ref — refusing where "help" (stash, checkout) would
// take another session's uncommitted work with it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mergePreflight, exitFor } from '../../scripts/lib/merge-preflight.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'merge-pre-'));
  made.push(d);
  const g = (...a) => { const r = spawnSync('git', a, { cwd: d, encoding: 'utf8' }); assert.equal(r.status, 0, `${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('config', 'commit.gpgsign', 'false');
  writeFileSync(join(d, 'a.txt'), 'base\n'); writeFileSync(join(d, 'b.txt'), 'base\n');
  g('add', '.'); g('commit', '-qm', 'base');
  return { d, g };
}
const snapshot = (g) => [g('rev-parse', 'HEAD'), g('status', '--porcelain'), g('for-each-ref'), g('stash', 'list')].join('|');

test('a lane that changed its own file merges clean, and nothing is touched', () => {
  const { d, g } = repo();
  g('checkout', '-qb', 'lane'); writeFileSync(join(d, 'b.txt'), 'lane\n'); g('commit', '-qam', 'lane');
  g('checkout', '-q', 'main'); writeFileSync(join(d, 'a.txt'), 'main\n'); g('commit', '-qam', 'main');
  const before = snapshot(g);
  const r = mergePreflight({ cwd: d, branch: 'lane' });
  assert.equal(r.state, 'clean'); assert.equal(r.ahead, 1); assert.match(r.tree, /^[0-9a-f]{40}$/);
  assert.equal(snapshot(g), before, 'no ref, index, tree or stash changed');
  assert.equal(exitFor(r.state), 0);
});

test('a conflict names the files', () => {
  const { d, g } = repo();
  g('checkout', '-qb', 'lane'); writeFileSync(join(d, 'a.txt'), 'lane\n'); g('commit', '-qam', 'lane');
  g('checkout', '-q', 'main'); writeFileSync(join(d, 'a.txt'), 'main\n'); g('commit', '-qam', 'main');
  const r = mergePreflight({ cwd: d, branch: 'lane' });
  assert.equal(r.state, 'conflict');
  assert.deepEqual(r.conflicts, ['a.txt']);
  assert.equal(exitFor(r.state), 1);
});

test('an empty branch is nothing-to-merge, not success', () => {
  const { g, d } = repo();
  g('branch', 'lane');
  assert.equal(mergePreflight({ cwd: d, branch: 'lane' }).state, 'nothing-to-merge');
});

test("a checkout with another session's uncommitted edit is refused — the edit survives", () => {
  const { d, g } = repo();
  g('checkout', '-qb', 'lane'); writeFileSync(join(d, 'b.txt'), 'lane\n'); g('commit', '-qam', 'lane'); g('checkout', '-q', 'main');
  writeFileSync(join(d, 'a.txt'), 'someone else is editing this\n');
  const r = mergePreflight({ cwd: d, branch: 'lane' });
  assert.equal(r.state, 'refused-dirty');
  assert.match(r.detail, /never stash/);
  assert.equal(readFileSync(join(d, 'a.txt'), 'utf8'), 'someone else is editing this\n');
  assert.equal(g('stash', 'list'), '');
});

test('a checkout on another branch is refused, not switched', () => {
  const { d, g } = repo();
  g('checkout', '-qb', 'lane'); writeFileSync(join(d, 'b.txt'), 'lane\n'); g('commit', '-qam', 'lane');
  const r = mergePreflight({ cwd: d, branch: 'lane' });
  assert.equal(r.state, 'refused-not-on-base');
  assert.equal(g('symbolic-ref', '--short', 'HEAD'), 'lane');
});

test('a ref that does not resolve is not-checked (exit 3), never clean', () => {
  const { d } = repo();
  const r = mergePreflight({ cwd: d, branch: 'no-such-branch' });
  assert.equal(r.state, 'not-checked');
  assert.equal(exitFor(r.state), 3);
  const cli = spawnSync(process.execPath, [resolve('scripts/lib/merge-preflight.mjs'), 'no-such-branch', '--cwd', d], { encoding: 'utf8' });
  assert.equal(cli.status, 3);
});
