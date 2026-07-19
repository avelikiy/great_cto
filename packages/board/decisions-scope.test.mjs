// Decisions log must be scoped to the project that produced the decision (ADR-008).
//
// A gate title carries the project's own vocabulary — feature names, internal
// slugs, client names. Writing it under ~/.great_cto made it readable by agents
// working on every *other* project, and that bled a real private name across
// tenants. These tests pin the fix: writes land project-local, and the global
// file never gains a line again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-decisions-'));
// Redirect GREAT_CTO_DIR so the real ~/.great_cto is never touched by this test.
const fakeGlobal = path.join(tmpRoot, 'global-great-cto');
fs.mkdirSync(fakeGlobal, { recursive: true });
process.env.GREAT_CTO_DIR = fakeGlobal;

const { appendDecisionLog, readDecisionsLog } = await import('./lib/fleet.mjs');

function makeProject(name) {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
  return dir;
}

const globalLog = () => path.join(fakeGlobal, 'decisions.md');
const projectLog = (dir) => path.join(dir, '.great_cto', 'decisions.md');

test('a gate decision writes to the project log, never the global one', () => {
  const proj = makeProject('alpha');
  appendDecisionLog({
    ts: '2026-07-19T10:00:00.000Z',
    project: 'alpha',
    action: 'approve',
    id: 'GATE-1',
    title: 'gate:ship — Zephyrite billing rollout',
    reason: 'verified by CTO',
    cwd: proj,
  });

  const local = fs.readFileSync(projectLog(proj), 'utf8');
  assert.match(local, /GATE-1/, 'decision landed in the project log');
  assert.match(local, /Zephyrite billing rollout/);

  assert.equal(fs.existsSync(globalLog()), false,
    'the global decisions log must not be created at all');
});

test('a project-specific token never reaches the global log', () => {
  const proj = makeProject('beta');
  const secret = 'Quibblewick_Rust';   // stands in for a private client name
  appendDecisionLog({
    ts: '2026-07-19T11:00:00.000Z',
    project: 'beta',
    action: 'reject',
    id: 'GATE-2',
    title: `gate:arch — ${secret} migration`,
    reason: `blocked pending ${secret} legal review`,
    cwd: proj,
  });

  assert.match(fs.readFileSync(projectLog(proj), 'utf8'), new RegExp(secret));
  const globalText = fs.existsSync(globalLog()) ? fs.readFileSync(globalLog(), 'utf8') : '';
  assert.ok(!globalText.includes(secret),
    'the private token must never appear in the cross-project log');
});

test('without a project cwd the write is refused, not redirected to global', () => {
  appendDecisionLog({
    ts: '2026-07-19T12:00:00.000Z',
    project: 'orphan',
    action: 'approve',
    id: 'GATE-3',
    title: 'gate:ship — orphaned decision',
    reason: '',
    // cwd deliberately omitted
  });
  const globalText = fs.existsSync(globalLog()) ? fs.readFileSync(globalLog(), 'utf8') : '';
  assert.ok(!globalText.includes('GATE-3'),
    'a scope-less decision must be dropped rather than written globally');
});

test('reads are scoped too — one project never sees another project\'s decisions', () => {
  const a = makeProject('gamma');
  const b = makeProject('delta');
  appendDecisionLog({ ts: '2026-07-19T13:00:00.000Z', project: 'gamma',
    action: 'approve', id: 'G-1', title: 'gamma only', reason: '', cwd: a });
  appendDecisionLog({ ts: '2026-07-19T13:05:00.000Z', project: 'delta',
    action: 'approve', id: 'D-1', title: 'delta only', reason: '', cwd: b });

  const fromA = readDecisionsLog(20, a).map(d => d.id);
  const fromB = readDecisionsLog(20, b).map(d => d.id);
  assert.deepEqual(fromA, ['G-1']);
  assert.deepEqual(fromB, ['D-1']);
});

test('the project log round-trips through the reader', () => {
  const proj = makeProject('epsilon');
  appendDecisionLog({ ts: '2026-07-19T14:00:00.000Z', project: 'epsilon',
    action: 'approve', id: 'E-9', title: 'gate:plan — pipeline', reason: 'looks right', cwd: proj });
  const [d] = readDecisionsLog(20, proj);
  assert.equal(d.id, 'E-9');
  assert.equal(d.verdict, 'APPROVED');
  assert.equal(d.project, 'epsilon');
  assert.equal(d.reason, 'looks right');
});
