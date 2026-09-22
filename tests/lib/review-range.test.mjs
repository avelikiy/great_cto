// A re-review reads what changed since the last one, not the whole branch again.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { reviewRange, recordReview } from '../../scripts/lib/review-range.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'rev-range-'));
  made.push(d);
  const g = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' }).stdout.trim();
  g('init', '-q', '-b', 'feat'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('config', 'commit.gpgsign', 'false');
  writeFileSync(join(d, '.gitignore'), '.great_cto/\n');
  writeFileSync(join(d, 'a.js'), '1\n'); g('add', '.'); g('commit', '-qm', 'one');
  return { d, g };
}

test('no marker: full review, with the reason', () => {
  const { d } = repo();
  const r = reviewRange({ cwd: d });
  assert.equal(r.mode, 'full');
  assert.match(r.reason, /no review marker for feat/);
});

test('after a recorded review, only the new commits are the range; nothing new says so', () => {
  const { d, g } = repo();
  const rec = recordReview({ cwd: d, now: new Date('2026-09-22T10:00:00Z') });
  assert.equal(reviewRange({ cwd: d }).mode, 'nothing-new');
  writeFileSync(join(d, 'a.js'), '2\n'); g('commit', '-qam', 'fix');
  const r = reviewRange({ cwd: d });
  assert.equal(r.mode, 'incremental');
  assert.equal(r.range, `${rec.sha}..HEAD`);
  assert.equal(g('diff', '--name-only', r.range), 'a.js');
});

test('uncommitted changes are listed, so a review of the range does not miss them', () => {
  const { d } = repo();
  recordReview({ cwd: d });
  writeFileSync(join(d, 'b.js'), 'new\n');
  const r = reviewRange({ cwd: d });
  assert.equal(r.mode, 'incremental');
  assert.deepEqual(r.uncommitted, ['?? b.js']);
});

test('a rebased-away marker falls back to a full review instead of a wrong range', () => {
  const { d, g } = repo();
  writeFileSync(join(d, 'a.js'), '2\n'); g('commit', '-qam', 'two');
  recordReview({ cwd: d });
  g('reset', '-q', '--hard', 'HEAD~1');
  writeFileSync(join(d, 'a.js'), '3\n'); g('commit', '-qam', 'rewritten');
  const r = reviewRange({ cwd: d });
  assert.equal(r.mode, 'full');
  assert.match(r.reason, /no longer in this branch's history/);
});
