// tests/lib/gate-check.test.mjs — unit tests for strict-mode gate check (governance Phase 2)
//
// Run: node --test tests/lib/gate-check.test.mjs

import { test } from 'node:test';
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
