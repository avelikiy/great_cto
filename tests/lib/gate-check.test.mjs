// tests/lib/gate-check.test.mjs — unit tests for strict-mode gate check (governance Phase 2)
//
// Run: node --test tests/lib/gate-check.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTask, covers, evaluateGate, BLOCKING_STATES } from '../../scripts/lib/gate-check.mjs';
import { create } from '../../scripts/lib/exceptions.mjs';

const NOW = '2026-06-06T00:00:00Z';

// ── normalizeTask ─────────────────────────────────────────────────────────────

test('normalizeTask: status blocked → state blocked', () => {
  assert.equal(normalizeTask({ id: 'a', status: 'blocked' }).state, 'blocked');
});

test('normalizeTask: open status + failed label → state failed', () => {
  assert.equal(normalizeTask({ id: 'a', status: 'open', labels: ['x', 'failed'] }).state, 'failed');
});

test('normalizeTask: state: label prefix stripped', () => {
  assert.equal(normalizeTask({ id: 'a', status: 'open', labels: ['state:unverified'] }).state, 'unverified');
});

test('normalizeTask: clean open task → state open (not blocking)', () => {
  const t = normalizeTask({ id: 'a', status: 'open', labels: ['feature'] });
  assert.equal(t.state, 'open');
  assert.equal(BLOCKING_STATES.has(t.state), false);
});

// ── covers ────────────────────────────────────────────────────────────────────

test('covers: valid exception for exact gate + matching scope', () => {
  const exc = create({ gate: 'gate:ship', scope: 'UC-003', reason: 'r', now: NOW });
  assert.equal(covers(exc, 'gate:ship', 'UC-003', NOW), true);
  assert.equal(covers(exc, 'gate:qa', 'UC-003', NOW), false);   // wrong gate
  assert.equal(covers(exc, 'gate:ship', 'UC-999', NOW), false); // wrong scope
});

test('covers: wildcard gate + empty scope covers anything', () => {
  const exc = create({ gate: '*', reason: 'blanket', now: NOW });
  assert.equal(covers(exc, 'gate:ship', 'UC-1', NOW), true);
});

test('covers: expired exception does not cover', () => {
  const exc = create({ gate: 'gate:ship', reason: 'r', expiresInDays: 1, now: NOW });
  assert.equal(covers(exc, 'gate:ship', 'UC-1', '2026-07-01T00:00:00Z'), false);
});

// ── evaluateGate ──────────────────────────────────────────────────────────────

const T = (id, state) => ({ id, title: id, state });

test('evaluateGate: passes when no blocking tasks', () => {
  const r = evaluateGate([T('a', 'open'), T('b', 'in_progress')], [], { gate: 'gate:ship' });
  assert.equal(r.pass, true);
  assert.equal(r.blocking.length, 0);
});

test('evaluateGate: a single BLOCKED task blocks the gate', () => {
  const r = evaluateGate([T('a', 'open'), T('b', 'blocked')], [], { gate: 'gate:ship' });
  assert.equal(r.pass, false);
  assert.equal(r.blocking.length, 1);
  assert.equal(r.blocking[0].id, 'b');
});

test('evaluateGate: terminal-fail states all block (failed/unverified/not_run)', () => {
  const tasks = [T('a', 'failed'), T('b', 'unverified'), T('c', 'not_run')];
  const r = evaluateGate(tasks, [], { gate: 'gate:ship' });
  assert.equal(r.pass, false);
  assert.equal(r.blocking.length, 3);
});

test('evaluateGate: a signed exception sanctions a blocked task (logged, not silent)', () => {
  const exc = create({ gate: 'gate:ship', scope: 'b', reason: 'external blocker', now: NOW });
  const r = evaluateGate([T('a', 'open'), T('b', 'blocked')], [exc], { gate: 'gate:ship', now: NOW });
  assert.equal(r.pass, true);
  assert.equal(r.blocking.length, 0);
  assert.equal(r.covered.length, 1);
  assert.equal(r.covered[0].exception, exc.id);
});

test('evaluateGate: exception for a different gate does not sanction', () => {
  const exc = create({ gate: 'gate:qa', scope: 'b', reason: 'r', now: NOW });
  const r = evaluateGate([T('b', 'blocked')], [exc], { gate: 'gate:ship', now: NOW });
  assert.equal(r.pass, false);
  assert.equal(r.blocking.length, 1);
});

test('evaluateGate: one blocked + one covered → still blocked by the uncovered one', () => {
  const exc = create({ gate: 'gate:ship', scope: 'covered', reason: 'r', now: NOW });
  const r = evaluateGate([T('covered', 'blocked'), T('uncovered', 'failed')], [exc], { gate: 'gate:ship', now: NOW });
  assert.equal(r.pass, false);
  assert.equal(r.blocking.length, 1);
  assert.equal(r.blocking[0].id, 'uncovered');
  assert.equal(r.covered.length, 1);
});

// ── required domain reviewers (PLAN-2026-09-21-required-reviewers) ─────────────
// pci-reviewer was needed by 7 of 22 projects and ran once; nothing required it.
// gate:ship now refuses while a reviewer the project's archetype, packs or
// compliance imply has no verdict, unless a signed exception names it.
import { evaluateReviewers } from '../../scripts/lib/gate-check.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const status = (...rs) => ({ state: 'read', reviewers: rs.map(([agent, verdict]) => ({ agent, why: `archetype x`, verdict })) });

test('evaluateReviewers: a required reviewer with no verdict blocks gate:ship', () => {
  const r = evaluateReviewers(status(['pci-reviewer', false], ['voice-ai-reviewer', true]), [], { gate: 'gate:ship', now: NOW });
  assert.equal(r.pass, false);
  assert.deepEqual(r.blocking.map((b) => b.agent), ['pci-reviewer']);
});

test('evaluateReviewers: an exception scoped reviewer:<agent> sanctions it, and says so', () => {
  const exc = create({ gate: 'gate:ship', scope: 'reviewer:pci-reviewer', reason: 'no card data in this release', now: NOW });
  const r = evaluateReviewers(status(['pci-reviewer', false]), [exc], { gate: 'gate:ship', now: NOW });
  assert.equal(r.pass, true);
  assert.equal(r.covered[0].exception, exc.id);
});

test('evaluateReviewers: only gate:ship asks for reviewers', () => {
  assert.equal(evaluateReviewers(status(['pci-reviewer', false]), [], { gate: 'gate:plan', now: NOW }).pass, true);
});

test('evaluateReviewers: no PROJECT.md requires nothing', () => {
  assert.equal(evaluateReviewers({ state: 'no-project', reviewers: [] }, [], { gate: 'gate:ship', now: NOW }).pass, true);
});

const GATE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'lib', 'gate-check.mjs');
const madeDirs = [];
after(() => { for (const d of madeDirs) rmSync(d, { recursive: true, force: true }); });
function project(md, verdicts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-rev-'));
  madeDirs.push(dir);
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), md);
  for (const [a, line] of Object.entries(verdicts)) writeFileSync(join(dir, '.great_cto', 'verdicts', `${a}.log`), `${line}\n`);
  return dir;
}

test('CLI: without Beads the reviewer check still runs — a missing bd is not a pass', () => {
  const dir = project('primary: commerce\n');
  const r = spawnSync(process.execPath, [GATE, 'gate:ship'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /pci-reviewer/);
  assert.match(r.stdout, /archetype commerce/);
});

test('CLI: with every required verdict present, gate:ship passes the reviewer check', () => {
  // QA and security are required for gate:ship too (ship-evidence.mjs), so a
  // project that passes carries them as well as the domain reviewer.
  const dir = project('primary: commerce\n', {
    'pci-reviewer': '2026-09-01 pci-reviewer APPROVED',
    'qa-engineer': '2026-09-02T00:00:00Z qa-engineer PASS',
    'security-officer': '2026-09-02T01:00:00Z security-officer APPROVED',
  });
  const r = spawnSync(process.execPath, [GATE, 'gate:ship'], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
