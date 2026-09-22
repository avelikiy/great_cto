// gate:ship reads what the verdicts SAY, not only that they exist.
//
// Across 16 projects with verdicts: a BLOCKED from healthcare-reviewer was never
// cleared and the task it blocked was closed an hour later; 11 had no QA verdict;
// great_cto's last QA predated its last ship by three weeks. gate-check passed all
// of them — it read task states and whether domain reviewers had run, never a verdict.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalAgent, verdictKind, latestVerdicts, shipBlockers, lastCodeChange } from '../../scripts/lib/ship-evidence.mjs';
import { evaluateShipEvidence } from '../../scripts/lib/gate-check.mjs';
import { create } from '../../scripts/lib/exceptions.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
function project(logs = {}) {
  const d = mkdtempSync(join(tmpdir(), 'ship-ev-'));
  made.push(d);
  mkdirSync(join(d, '.great_cto', 'verdicts'), { recursive: true });
  for (const [f, text] of Object.entries(logs)) writeFileSync(join(d, '.great_cto', 'verdicts', f), text);
  return d;
}
const v1 = (ts, agent, verdict) => `${JSON.stringify({ v: 1, ts, agent, verdict })}\n`;
const agents = (b) => b.map((x) => x.agent).sort();

test('one agent logged under four names is one agent', () => {
  for (const n of ['great-cto:code-reviewer', 'great_cto:code-reviewer', 'code-reviewer.log']) assert.equal(canonicalAgent(n), 'code-reviewer');
  assert.equal(canonicalAgent('qa.log'), 'qa-engineer');
  assert.equal(canonicalAgent('security'), 'security-officer');
});

test('verdict values in every dialect seen are classified', () => {
  assert.equal(verdictKind('BLOCKED'), 'negative');
  assert.equal(verdictKind('REWORK'), 'negative');
  assert.equal(verdictKind('APPROVED_WITH_DEFERRED_CRITICALS'), 'negative', 'an approval that names open criticals is not a pass');
  assert.equal(verdictKind('APPROVED WITH FOLLOW-UPS'), 'positive');
  assert.equal(verdictKind('PASS'), 'positive');
  assert.equal(verdictKind('SPEC-OBJECTION'), 'neutral');
});

test('a BLOCKED nobody cleared blocks gate:ship; a later pass from the same agent clears it', () => {
  const blocked = project({
    'healthcare-reviewer.log': v1('2026-09-17T09:11:00Z', 'healthcare-reviewer', 'BLOCKED'),
    'qa-engineer.log': v1('2026-09-20T10:00:00Z', 'qa-engineer', 'PASS'),
    'security-officer.log': v1('2026-09-20T11:00:00Z', 'security-officer', 'APPROVED'),
  });
  assert.deepEqual(agents(shipBlockers(latestVerdicts(blocked), null)), ['healthcare-reviewer']);

  const cleared = project({
    'healthcare-reviewer.log': v1('2026-09-17T09:11:00Z', 'healthcare-reviewer', 'BLOCKED') + v1('2026-09-18T09:00:00Z', 'healthcare-reviewer', 'APPROVED'),
    'qa-engineer.log': v1('2026-09-20T10:00:00Z', 'qa-engineer', 'PASS'),
    'security-officer.log': v1('2026-09-20T11:00:00Z', 'security-officer', 'APPROVED'),
  });
  assert.deepEqual(shipBlockers(latestVerdicts(cleared), null), []);
});

test('no QA and no security verdict: both are named', () => {
  const b = shipBlockers(latestVerdicts(project({ 'architect.log': v1('2026-07-10T00:00:00Z', 'architect', 'APPROVED') })), null);
  assert.deepEqual(agents(b), ['qa-engineer', 'security-officer']);
  assert.match(b[0].why, /no verdict/);
});

test('a QA verdict older than the last code change is stale', () => {
  const latest = latestVerdicts(project({
    'qa-engineer.log': v1('2026-08-17T00:00:00Z', 'qa-engineer', 'PASS'),
    'security-officer.log': v1('2026-09-06T00:00:00Z', 'security-officer', 'APPROVED'),
  }));
  const b = shipBlockers(latest, '2026-09-05T12:00:00+02:00');
  assert.deepEqual(agents(b), ['qa-engineer']);
  assert.match(b[0].why, /predates the last code change/);
  const both = shipBlockers(latest, '2026-09-10T00:00:00Z');
  assert.deepEqual(agents(both), ['qa-engineer', 'security-officer'], 'a security verdict from before the change is stale too');
  assert.deepEqual(agents(shipBlockers(latest, '2026-09-10T00:00:00Z', { as: 'security-officer' })), ['qa-engineer'], 'but not to the agent writing it now');
  assert.deepEqual(shipBlockers(latest, '2026-08-01T00:00:00Z'), [], 'a QA after the change is fresh');
});

test('the agent writing its own verdict is not blocked by its own absence or its last BLOCKED', () => {
  const latest = latestVerdicts(project({
    'security-officer.log': v1('2026-09-01T00:00:00Z', 'security-officer', 'BLOCKED'),
    'qa-engineer.log': v1('2026-09-20T00:00:00Z', 'qa-engineer', 'PASS'),
  }));
  assert.deepEqual(agents(shipBlockers(latest, null)), ['security-officer']);
  assert.deepEqual(shipBlockers(latest, null, { as: 'great-cto:security-officer' }), []);
});

test('legacy space-dialect logs and gate:*.log are read correctly', () => {
  const latest = latestVerdicts(project({
    'qa.log': '2026-07-12T15:47:00Z PASS ready-for-security-review\n',
    'gate:ship.log': '2026-09-06T00:00:00Z APPROVED\n',
  }));
  assert.equal(latest.get('qa-engineer').verdict, 'PASS');
  assert.equal(latest.has('gate:ship'), false, 'a gate decision is not an agent verdict');
});

test('a signed exception naming reviewer:<agent> waives that blocker only', () => {
  const NOW = '2026-09-21T00:00:00Z';
  const exc = create({ gate: 'gate:ship', scope: 'reviewer:qa-engineer', reason: 'QA env down; manual smoke recorded', now: NOW });
  const blockers = [{ agent: 'qa-engineer', why: 'stale' }, { agent: 'healthcare-reviewer', why: 'BLOCKED' }];
  const r = evaluateShipEvidence(blockers, [exc], { gate: 'gate:ship', now: NOW });
  assert.equal(r.pass, false);
  assert.deepEqual(r.covered.map((c) => c.agent), ['qa-engineer']);
  assert.deepEqual(r.blocking.map((c) => c.agent), ['healthcare-reviewer']);
  assert.equal(evaluateShipEvidence(blockers, [], { gate: 'gate:plan' }).pass, true, 'only gate:ship reads this');
});

test('lastCodeChange ignores commits that touched only docs and pipeline records', () => {
  const d = project();
  const git = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: a.at(-1) === 'code' ? '2026-09-01T00:00:00Z' : '2026-09-10T00:00:00Z', GIT_COMMITTER_DATE: a.at(-1) === 'code' ? '2026-09-01T00:00:00Z' : '2026-09-10T00:00:00Z' } });
  git('init', '-q');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(d, 'app.js'), '1'); git('add', 'app.js'); git('commit', '-qm', 'code');
  mkdirSync(join(d, 'docs')); writeFileSync(join(d, 'docs', 'x.md'), 'x'); writeFileSync(join(d, '.great_cto', 'verdicts', 'qa-engineer.log'), 'x');
  git('add', '-A'); git('commit', '-qm', 'docs');
  assert.match(lastCodeChange(d), /^2026-09-01/);
});

test('the CLI refuses gate:ship over an open BLOCKED, and --as lets the agent itself through', () => {
  const d = project({
    'security-officer.log': v1('2026-09-01T00:00:00Z', 'security-officer', 'BLOCKED'),
    'qa-engineer.log': v1('2099-01-01T00:00:00Z', 'qa-engineer', 'PASS'),
  });
  const home = join(d, '.home'); mkdirSync(home);
  const cli = resolve('scripts/lib/gate-check.mjs');
  const env = { ...process.env, HOME: home, PATH: '/usr/bin:/bin' }; // no bd: task check skipped, file checks run
  const plain = spawnSync(process.execPath, [cli, 'gate:ship'], { cwd: d, encoding: 'utf8', env });
  assert.equal(plain.status, 1, plain.stdout);
  assert.match(plain.stdout, /security-officer — latest verdict BLOCKED/);
  const self = spawnSync(process.execPath, [cli, 'gate:ship', '--as', 'security-officer'], { cwd: d, encoding: 'utf8', env });
  assert.equal(self.status, 0, self.stdout);
});
