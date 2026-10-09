// What the agents concluded and what reviews found, across projects. The ways
// this goes wrong quietly: a word nobody classifies read as a pass, one verdict
// counted twice because it sits in a project log and the global layer, and a
// project whose Beads could not be read shown as a project with no bugs.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { outcomeOf, verdictAgent, agentOutcomes, bugFindings, outcomes } from '../../scripts/lib/outcomes.mjs';

const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-')); made.push(d); return d; };
const NOW = Date.parse('2026-10-07T12:00:00Z');
const v = (ts, agent, verdict, extra = {}) => JSON.stringify({ v: 1, ts, agent, verdict, ...extra });

test('project outcomes exclude foreign and unattributed global verdicts and read only selected Beads', async () => {
  const root = tmp(), globalDir = path.join(root, 'global');
  const projects = ['alpha', 'beta'].map(name => ({ name, path: path.join(root, name) }));
  fs.mkdirSync(globalDir);
  for (const p of projects) {
    fs.mkdirSync(path.join(p.path, '.great_cto', 'verdicts'), { recursive: true });
    fs.mkdirSync(path.join(p.path, '.beads'));
    fs.writeFileSync(path.join(p.path, '.great_cto', 'verdicts', 'senior-dev.log'), v('2026-10-06T10:00:00Z', 'senior-dev', p.name === 'alpha' ? 'PASS' : 'FAIL'));
  }
  fs.writeFileSync(path.join(globalDir, 'reviewer.log'), [
    v('2026-10-06T11:00:00Z', 'code-reviewer', 'PASS', { project: 'alpha' }),
    v('2026-10-06T12:00:00Z', 'code-reviewer', 'FAIL', { project: 'beta' }),
    v('2026-10-06T13:00:00Z', 'code-reviewer', 'FAIL'),
  ].join('\n'));
  const asked = [];
  const report = await outcomes({ projects: [projects[0]], globalDir, now: NOW, projectScope: true, list: async cwd => { asked.push(cwd); return { ok: true, data: [] }; } });
  assert.equal(report.projects, 1);
  assert.deepEqual(asked, [projects[0].path]);
  assert.equal(report.agents.agents.reduce((n, a) => n + a.runs, 0), 2);
  assert.equal(report.agents.agents.reduce((n, a) => n + a.failed, 0), 0);
});

test('a verdict means pass, stopped, failed, skipped — or unknown, never a quiet pass', () => {
  for (const x of ['APPROVED', 'PASS', 'DONE', 'TASK_DONE']) assert.equal(outcomeOf(x), 'pass', x);
  for (const x of ['BLOCKED', 'REWORK', 'ESCALATED', 'REJECTED']) assert.equal(outcomeOf(x), 'stopped', x);
  assert.equal(outcomeOf('FAIL'), 'failed');
  assert.equal(outcomeOf('SKIPPED'), 'skipped');
  assert.equal(outcomeOf('WARN'), 'unknown');
  assert.equal(outcomeOf(''), 'unknown');
});

test('the agent behind a verdict, whatever the file or the prefix called it', () => {
  assert.equal(verdictAgent('great-cto:security-officer'), 'security-officer');
  assert.equal(verdictAgent('devops-2026-09-15-123328'), 'devops');
  assert.equal(verdictAgent('senior-dev'), 'senior-dev');
});

test('per agent across projects: in the window, once per line, roster only', () => {
  const root = tmp();
  const proj = path.join(root, 'acme');
  const global = path.join(root, 'global');
  fs.mkdirSync(path.join(proj, '.great_cto', 'verdicts'), { recursive: true });
  fs.mkdirSync(global, { recursive: true });
  const shared = v('2026-10-05T10:00:00Z', 'security-officer', 'BLOCKED', { project: 'acme', meta: { need: 'decision' } });
  fs.writeFileSync(path.join(proj, '.great_cto', 'verdicts', 'security-officer.log'), [
    shared,
    v('2026-10-06T10:00:00Z', 'great-cto:security-officer', 'APPROVED'),
    v('2026-10-06T11:00:00Z', 'security-officer', 'FAIL'),
    v('2026-06-01T10:00:00Z', 'security-officer', 'APPROVED'),           // outside 30 days
    'not a verdict at all',
  ].join('\n'));
  // The same line written to the global layer too: one run, not two.
  fs.writeFileSync(path.join(global, 'security-officer.log'), `${shared}\n`);
  fs.writeFileSync(path.join(proj, '.great_cto', 'verdicts', 'senior-dev.log'), [
    v('2026-10-06T09:00:00Z', 'senior-dev', 'TASK_DONE'),
    v('2026-10-06T09:30:00Z', 'senior-dev', 'WARN'),
  ].join('\n'));
  fs.writeFileSync(path.join(proj, '.great_cto', 'verdicts', 'gate.log'), v('2026-10-06T09:00:00Z', 'gate:ship', 'APPROVED'));
  const r = agentOutcomes({ projects: [{ name: 'acme', path: proj }], globalDir: global, days: 30, now: NOW, roster: ['security-officer', 'senior-dev'] });
  const so = r.agents.find((a) => a.agent === 'security-officer');
  assert.equal(so.runs, 3, 'the line in both logs is one run; the June one is outside the window');
  assert.deepEqual([so.pass, so.stopped, so.failed], [1, 1, 1]);
  assert.equal(so.needDecision, 1);
  assert.equal(Math.round(so.stopRate * 100), 67);
  const sd = r.agents.find((a) => a.agent === 'senior-dev');
  assert.deepEqual([sd.runs, sd.pass, sd.unknown], [2, 1, 1], 'WARN is counted as a run and as unknown, not as a pass');
  assert.equal(sd.stopRate, 0, 'the unknown one does not enter the rate');
  assert.deepEqual(r.other, { runs: 1, names: ['gate:ship'] }, 'a name outside the roster is reported, not mixed in');
});

test('bugs by priority: filed in the window, open now, time to close — and unread is not empty', async () => {
  const root = tmp();
  const a = path.join(root, 'a'); const b = path.join(root, 'b'); const c = path.join(root, 'c');
  for (const p of [a, b]) fs.mkdirSync(path.join(p, '.beads'), { recursive: true });
  fs.mkdirSync(c, { recursive: true });                                  // no Beads: not asked at all
  const asked = [];
  const list = async (cwd) => {
    asked.push(path.basename(cwd));
    if (cwd === b) return { ok: false, why: 'Error: no beads database found' };
    return { ok: true, data: [
      { priority: 0, status: 'open', created_at: '2026-10-06T10:00:00Z' },
      { priority: 0, status: 'closed', created_at: '2026-10-01T10:00:00Z', closed_at: '2026-10-01T12:00:00Z' },
      { priority: 1, status: 'closed', created_at: '2026-10-02T10:00:00Z', closed_at: '2026-10-04T10:00:00Z' },
      { priority: 2, status: 'in_progress', created_at: '2026-05-01T10:00:00Z' },   // old, still open
    ] };
  };
  const r = await bugFindings({ projects: [{ name: 'a', path: a }, { name: 'b', path: b }, { name: 'c', path: c }], days: 30, now: NOW, list });
  assert.deepEqual(asked, ['a', 'b']);
  assert.equal(r.filed.P0, 2);
  assert.equal(r.filed.P1, 1);
  assert.equal(r.filed.P2, 0, 'filed in May: outside the window');
  assert.equal(r.openNow.P0, 1);
  assert.equal(r.openNow.P2, 1, 'open now regardless of when it was filed');
  assert.deepEqual(r.daysToClose.P0, { median: 2 / 24, n: 1 });
  assert.deepEqual(r.daysToClose.P1, { median: 2, n: 1 });
  assert.deepEqual(r.unread, [{ project: 'b', why: 'Error: no beads database found' }]);
  assert.equal(r.projects.length, 1);
  assert.equal(r.projects[0].open.P0, 1);
});

test('runs that ended without a verdict are counted per agent, by how they ended', () => {
  const root = tmp();
  const proj = path.join(root, 'acme');
  fs.mkdirSync(path.join(proj, '.great_cto', 'verdicts'), { recursive: true });
  const ev = (ts, agent, outcome) => JSON.stringify({ v: 1, ts, kind: 'agent-stop', agent, outcome });
  fs.writeFileSync(path.join(proj, '.great_cto', 'events.jsonl'), [
    ev('2026-10-06T10:00:00Z', 'great-cto:code-reviewer', 'no-verdict-reported'),
    ev('2026-10-06T11:00:00Z', 'code-reviewer', 'no-verdict-cut-off'),
    ev('2026-10-06T12:00:00Z', 'code-reviewer', 'asked'),                 // sent back, not an ending
    ev('2026-10-06T12:30:00Z', 'code-reviewer', 'verdict'),
    ev('2026-06-01T12:00:00Z', 'code-reviewer', 'no-verdict-reported'),   // outside the window
    JSON.stringify({ v: 1, ts: '2026-10-06T12:00:00Z', kind: 'tool', tool: 'Bash' }),
  ].join('\n'));
  const r = agentOutcomes({ projects: [{ name: 'acme', path: proj }], globalDir: path.join(root, 'none'), days: 30, now: NOW, roster: ['code-reviewer'] });
  const cr = r.agents.find((a) => a.agent === 'code-reviewer');
  assert.ok(cr, 'an agent that recorded no verdict at all still appears');
  assert.equal(cr.runs, 0);
  assert.equal(cr.noVerdictTotal, 2);
  assert.deepEqual(cr.noVerdict, { reported: 1, 'cut-off': 1 });
});
