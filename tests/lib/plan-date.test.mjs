// The property under test: a plan's date must not move when its file is touched.
//
// That is the whole defect. mtime is a fact about the filesystem, and `git
// clone` writes every file at clone time — so on a fresh checkout thirteen
// distinct plan dates collapsed into one, the 30-day cost window selected every
// plan ever written, and the board reported the project's entire history as the
// last month. Nobody reads that as suspicious, which is why it survived.
//
// So the tests below do not check "is the date right" against a fixed string.
// They change the timestamp and assert the answer does not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { planDate, datePlans, frontMatterDate, fileNameDate, gitAddedIndex } from '../../packages/board/lib/plan-date.mjs';

const LONG_AGO = new Date('2001-01-01T00:00:00Z');
const dir = () => {
  const root = mkdtempSync(join(tmpdir(), 'gcto-plandate-'));
  mkdirSync(join(root, 'docs', 'plans'), { recursive: true });
  return root;
};
const plan = (root, name, body = '# plan\n') => {
  const p = join(root, 'docs/plans', name);
  writeFileSync(p, body);
  return p;
};

test('a date in the filename survives the file being touched', () => {
  const root = dir();
  const p = plan(root, 'PLAN-2026-08-17-gate-fail-closed.md');
  const before = planDate(p, { root });
  utimesSync(p, LONG_AGO, LONG_AGO);
  const after = planDate(p, { root });
  assert.equal(before.date, '2026-08-17');
  assert.deepEqual(after, before, 'touching the file must not move the plan');
  assert.equal(after.source, 'filename');
  assert.equal(after.reliable, true);
});

test('front-matter wins over the filename — it is the one an author can correct', () => {
  const root = dir();
  const p = plan(root, 'PLAN-2026-08-17-x.md', '---\ndate: 2026-01-02\n---\n\n# plan\n');
  const r = planDate(p, { root });
  assert.equal(r.date, '2026-01-02');
  assert.equal(r.source, 'front-matter');
});

test('with no date anywhere, git says when the plan appeared', () => {
  const root = dir();
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: root });
  } catch { return; }                       // no git here: the fallback below is what runs
  const p = plan(root, 'PLAN-undated.md');
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'add'], { cwd: root, env: { ...process.env, GIT_AUTHOR_DATE: '2026-03-04T10:00:00Z', GIT_COMMITTER_DATE: '2026-03-04T10:00:00Z' } });

  utimesSync(p, LONG_AGO, LONG_AGO);        // mtime says 2001; git says 2026-03-04
  const r = planDate(p, { root, gitIndex: gitAddedIndex(root, 'docs/plans') });
  assert.equal(r.date, '2026-03-04', 'git, not the timestamp');
  assert.equal(r.source, 'git');
});

test('with no source at all the date is still returned, and marked unreliable', () => {
  const root = dir();                        // not a git repo, no date in the name
  const p = plan(root, 'PLAN-undated.md');
  utimesSync(p, LONG_AGO, LONG_AGO);
  const r = planDate(p, { root });
  assert.equal(r.source, 'mtime');
  assert.equal(r.reliable, false, 'a filesystem timestamp must not pass as measured');
  assert.equal(r.date, '2001-01-01', 'still dated — dropping it would silently shrink the window');
});

test('datePlans counts how many fell back to a timestamp', () => {
  const root = dir();
  const a = plan(root, 'PLAN-2026-08-17-known.md');
  const b = plan(root, 'PLAN-unknown.md');
  const r = datePlans([a, b], { root });
  assert.equal(r.total, 2);
  assert.equal(r.unreliable, 1, 'the caller must be able to say how much of the figure is guessed');
});

test('the whole directory dates identically before and after a mass touch', () => {
  const root = dir();
  const files = ['PLAN-2026-05-14-a.md', 'PLAN-2026-06-18-b.md', 'PLAN-2026-08-17-c.md']
    .map((n) => plan(root, n));
  const before = datePlans(files, { root });
  for (const f of files) utimesSync(f, LONG_AGO, LONG_AGO);   // what `git clone` does, in one line
  const after = datePlans(files, { root });
  assert.deepEqual([...after.dates.values()], [...before.dates.values()]);
  assert.equal(new Set([...after.dates.values()].map((d) => d.date)).size, 3,
    'three plans, three dates — not one');
});

test('parsers do not invent dates', () => {
  assert.equal(frontMatterDate('# no front matter\ndate: 2026-01-01'), null);
  assert.equal(fileNameDate('PLAN-no-date-here.md'), null);
  assert.equal(gitAddedIndex('/nonexistent-path-for-this-test', 'docs/plans').size, 0);
});
