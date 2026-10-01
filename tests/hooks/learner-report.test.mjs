// learner-report: one line at session start saying what the session learner did
// last time. On 2026-10-01 it had run and added nothing for days ("lessons+0"),
// and nobody could see that without opening a dot-file. Idea from autoharness,
// which prints its previous run's landed/rejected line at session start.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reportLine } from '../../scripts/hooks/learner-report.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function project(marker) {
  const d = mkdtempSync(join(tmpdir(), 'learner-report-')); made.push(d);
  mkdirSync(join(d, '.great_cto'));
  if (marker !== undefined) writeFileSync(join(d, '.great_cto', '.last-auto-learn'), marker);
  return d;
}
const NOW = Date.parse('2026-10-02T09:00:00Z');

test('a run that added lessons is reported with the count', () => {
  const line = reportLine(project('2026-10-01T10:06:56.694Z done: lessons+2 digest=27msg/2agents/9fail/87concl\n'), NOW);
  assert.match(line, /learner, last run 2026-10-01 10:06 UTC: added 2 lessons/);
});

test('a run that added nothing says so, plainly', () => {
  const line = reportLine(project('2026-10-01T10:06:56.694Z done: lessons+0 digest=27msg/2agents/9fail\n'), NOW);
  assert.match(line, /added no lesson/);
});

test('a failed or skipped run is reported with its reason', () => {
  assert.match(reportLine(project('2026-10-01T10:00:00Z failed: exit=2 Error: budget exceeded digest=2msg\n'), NOW), /failed.*budget exceeded/);
  assert.match(reportLine(project('2026-10-01T10:00:00Z skipped: 0 operator message(s) — nothing to learn from\n'), NOW), /skipped.*nothing to learn from/);
});

test('silent when there is no record, or the record is older than a week', () => {
  assert.equal(reportLine(project(), NOW), null);
  assert.equal(reportLine(project('2026-09-01T10:00:00Z done: lessons+1\n'), NOW), null);
});

test('a run still in progress is not reported as a result', () => {
  assert.equal(reportLine(project('2026-10-02T08:59:00Z started: work (the runner rewrites this line with the outcome)\n'), NOW), null);
});
