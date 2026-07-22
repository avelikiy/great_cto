// A stopped agent hands over a reviewable evidence bundle, not a bare status
// flip. buildHandoff assembles that bundle from already-gathered inputs; the
// pure shape is what's pinned here (gathering from disk/git is exercised by the
// CLI on the real repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoff } from '../scripts/handoff-package.mjs';

test('a full package renders every section', () => {
  const md = buildHandoff({
    reason: 'blocked', feature: 'signal-service', at: '2026-07-19T10:00:00Z',
    changedFiles: ['src/a.ts', 'src/b.ts'], diffStat: ' src/a.ts | 4 ++\n src/b.ts | 2 +-',
    tests: { ran: true, passed: 40, total: 42, failed: 2 },
    verdicts: [
      { ts: '2026-07-19T09:00:00Z', agent: 'senior-dev', verdict: 'DONE', note: 'first pass' },
      { ts: '2026-07-19T09:30:00Z', agent: 'qa-engineer', verdict: 'FAIL', note: '2 failing' },
    ],
    costUsd: 12.5, attempts: 2,
  });
  assert.match(md, /# HANDOFF — signal-service/);
  assert.match(md, /\*\*Stopped:\*\* blocked/);
  assert.match(md, /`src\/a\.ts`/);
  assert.match(md, /40\/42/);
  assert.match(md, /2 failing/);
  assert.match(md, /qa-engineer.*FAIL/);
  assert.match(md, /\$12\.50/);
  assert.match(md, /Self-fix attempts before stopping: \*\*2\*\*/);
  assert.match(md, /For the reviewer/);
});

test('unmeasured tests are reported as unverified, never as a pass', () => {
  const md = buildHandoff({
    reason: 'spec-objection', feature: 'x',
    tests: { ran: false, reason: 'suite did not report' },
  });
  assert.match(md, /not measured/);
  assert.match(md, /correctness as unverified/i);
  assert.doesNotMatch(md, /\d+\/\d+ passing/);
});

test('a stop before any write says so, does not fabricate a diff', () => {
  const md = buildHandoff({ reason: 'cost-cap', feature: 'y', changedFiles: [] });
  assert.match(md, /No file changes recorded/);
});

test('no verdicts yet is stated, not left blank', () => {
  const md = buildHandoff({ reason: 'blocked', feature: 'z', verdicts: [] });
  assert.match(md, /No verdicts recorded/);
});

test('missing cost is explicit', () => {
  const md = buildHandoff({ reason: 'blocked', feature: 'z', costUsd: null });
  assert.match(md, /Cost: not recorded/);
});

test('the stop reason and feature always appear in the header', () => {
  const md = buildHandoff({ reason: 'attempt-limit', feature: 'auth-flow' });
  assert.match(md, /# HANDOFF — auth-flow/);
  assert.match(md, /attempt-limit/);
});

test('a long verdict note is truncated, not dumped whole', () => {
  const long = 'x'.repeat(400);
  const md = buildHandoff({ reason: 'blocked', feature: 'f', verdicts: [{ ts: 't', agent: 'a', verdict: 'DONE', note: long }] });
  const noteLine = md.split('\n').find((l) => l.includes('DONE'));
  assert.ok(noteLine.length < 200, 'note capped');
});

test('the package never states more than 12 verdict lines', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ts: `t${i}`, agent: 'a', verdict: 'DONE' }));
  const md = buildHandoff({ reason: 'blocked', feature: 'f', verdicts: many });
  const lines = md.split('\n').filter((l) => /→ DONE/.test(l));
  assert.ok(lines.length <= 12, `capped to 12, got ${lines.length}`);
});
