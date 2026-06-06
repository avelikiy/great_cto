// tests/lib/gap-waves.test.mjs — unit tests for gap-closure wave planner (governance Phase 5)
//
// Run: node --test tests/lib/gap-waves.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGap, planWaves, applyPlan, interimExceptionsNeeded,
  validateRegister, progress, SEVERITY_RANK,
} from '../../scripts/lib/gap-waves.mjs';

const gap = (id, severity, extra = {}) => ({ id, gate: 'gate:ship', severity, summary: `${id} summary`, ...extra });

// ── normalizeGap ──────────────────────────────────────────────────────────────

test('normalizeGap: defaults severity=medium, status=open', () => {
  const g = normalizeGap({ id: 'G1', gate: 'gate:ship' });
  assert.equal(g.severity, 'medium');
  assert.equal(g.status, 'open');
  assert.equal(g.wave, null);
});

test('normalizeGap: unknown severity → medium', () => {
  assert.equal(normalizeGap({ id: 'G1', severity: 'spicy' }).severity, 'medium');
});

test('normalizeGap: closed status preserved, exception_id aliased', () => {
  const g = normalizeGap({ id: 'G1', status: 'CLOSED', exception_id: 'EXC-9' });
  assert.equal(g.status, 'closed');
  assert.equal(g.exception, 'EXC-9');
});

// ── planWaves ──────────────────────────────────────────────────────────────────

test('planWaves: all criticals land in wave 1, even beyond perWave', () => {
  const gaps = [gap('a', 'critical'), gap('b', 'critical'), gap('c', 'critical')];
  const plan = planWaves(gaps, { perWave: 2 });
  assert.equal(plan[0].wave, 1);
  assert.equal(plan[0].gaps.length, 3);
});

test('planWaves: non-critical gaps chunk by perWave', () => {
  const gaps = [gap('a', 'high'), gap('b', 'high'), gap('c', 'medium'), gap('d', 'low')];
  const plan = planWaves(gaps, { perWave: 2 });
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].gaps.map((g) => g.id), ['a', 'b']);
  assert.deepEqual(plan[1].gaps.map((g) => g.id), ['c', 'd']);
});

test('planWaves: criticals occupy wave 1, rest start at wave 2', () => {
  const gaps = [gap('crit', 'critical'), gap('h1', 'high'), gap('h2', 'high')];
  const plan = planWaves(gaps, { perWave: 5 });
  assert.equal(plan[0].wave, 1);
  assert.deepEqual(plan[0].gaps.map((g) => g.id), ['crit']);
  assert.equal(plan[1].wave, 2);
  assert.deepEqual(plan[1].gaps.map((g) => g.id), ['h1', 'h2']);
});

test('planWaves: closed gaps are not scheduled', () => {
  const gaps = [gap('a', 'high'), gap('b', 'high', { status: 'closed' })];
  const plan = planWaves(gaps, { perWave: 5 });
  assert.deepEqual(plan[0].gaps.map((g) => g.id), ['a']);
});

test('planWaves: severity ordering (high before low within a wave fill)', () => {
  const gaps = [gap('lo', 'low'), gap('hi', 'high'), gap('me', 'medium')];
  const plan = planWaves(gaps, { perWave: 5 });
  assert.deepEqual(plan[0].gaps.map((g) => g.id), ['hi', 'me', 'lo']);
});

test('planWaves: empty / all-closed → no waves', () => {
  assert.deepEqual(planWaves([], {}), []);
  assert.deepEqual(planWaves([gap('a', 'high', { status: 'closed' })], {}), []);
});

// ── applyPlan ──────────────────────────────────────────────────────────────────

test('applyPlan: stamps wave numbers back onto gaps', () => {
  const gaps = [gap('a', 'critical'), gap('b', 'high')];
  const stamped = applyPlan(gaps, planWaves(gaps, { perWave: 5 }));
  assert.equal(stamped.find((g) => g.id === 'a').wave, 1);
  assert.equal(stamped.find((g) => g.id === 'b').wave, 2);
});

// ── interimExceptionsNeeded ──────────────────────────────────────────────────────

test('interimExceptionsNeeded: deferred open gap without exception flagged', () => {
  const gaps = [gap('a', 'critical'), gap('b', 'high'), gap('c', 'high')];
  const stamped = applyPlan(gaps, planWaves(gaps, { perWave: 1 }));
  // wave1=a(crit), wave2=b, wave3=c. currentWave=1 → b and c are deferred, uncovered.
  const need = interimExceptionsNeeded(stamped, { currentWave: 1 });
  assert.deepEqual(need.map((g) => g.id).sort(), ['b', 'c']);
});

test('interimExceptionsNeeded: gap with an exception is covered', () => {
  const gaps = [gap('a', 'critical'), gap('b', 'high', { exception: 'EXC-1' })];
  const stamped = applyPlan(gaps, planWaves(gaps, { perWave: 5 }));
  assert.deepEqual(interimExceptionsNeeded(stamped, { currentWave: 1 }), []);
});

test('interimExceptionsNeeded: current-wave gaps need no exception', () => {
  const gaps = [gap('a', 'high'), gap('b', 'high')];
  const stamped = applyPlan(gaps, planWaves(gaps, { perWave: 5 })); // both wave 1
  assert.deepEqual(interimExceptionsNeeded(stamped, { currentWave: 1 }), []);
});

test('interimExceptionsNeeded: advancing currentWave reduces the deferred set', () => {
  const gaps = [gap('a', 'high'), gap('b', 'high')];
  const stamped = applyPlan(gaps, planWaves(gaps, { perWave: 1 })); // a=w1, b=w2
  assert.deepEqual(interimExceptionsNeeded(stamped, { currentWave: 1 }).map((g) => g.id), ['b']);
  assert.deepEqual(interimExceptionsNeeded(stamped, { currentWave: 2 }), []);
});

// ── validateRegister ──────────────────────────────────────────────────────────────

test('validateRegister: gap missing gate → invalid', () => {
  const r = validateRegister([{ id: 'a', severity: 'high' }], { currentWave: 1 });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /missing gate/);
});

test('validateRegister: uncovered deferred gap → invalid', () => {
  const gaps = [gap('a', 'critical'), gap('b', 'high')];
  const stamped = applyPlan(gaps, planWaves(gaps, { perWave: 5 }));
  // a=w1, b=w2; currentWave 1 → b uncovered
  const r = validateRegister(stamped, { currentWave: 1 });
  assert.equal(r.valid, false);
  assert.match(r.errors.join(' '), /would block/);
});

test('validateRegister: all deferred gaps covered → valid', () => {
  const gaps = [gap('a', 'critical'), gap('b', 'high', { exception: 'EXC-1' })];
  const stamped = applyPlan(gaps, planWaves(gaps, { perWave: 5 }));
  assert.equal(validateRegister(stamped, { currentWave: 1 }).valid, true);
});

// ── progress ──────────────────────────────────────────────────────────────────

test('progress: counts closed/open and per-wave', () => {
  const gaps = [
    gap('a', 'high', { wave: 1, status: 'closed' }),
    gap('b', 'high', { wave: 1 }),
    gap('c', 'low', { wave: 2 }),
  ];
  const p = progress(gaps);
  assert.equal(p.total, 3);
  assert.equal(p.closed, 1);
  assert.equal(p.open, 2);
  assert.deepEqual(p.byWave[1], { closed: 1, total: 2 });
  assert.deepEqual(p.byWave[2], { closed: 0, total: 1 });
});

test('SEVERITY_RANK orders critical < high < medium < low', () => {
  assert.ok(SEVERITY_RANK.critical < SEVERITY_RANK.high);
  assert.ok(SEVERITY_RANK.high < SEVERITY_RANK.medium);
  assert.ok(SEVERITY_RANK.medium < SEVERITY_RANK.low);
});
