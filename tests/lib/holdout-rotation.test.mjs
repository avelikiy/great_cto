// The improver never sees holdout failures. It does see the number, once per
// candidate, and a number is a channel: ten rounds of "0.61, 0.66, 0.59" is ten
// bits about a fixed set of cases, and a search process with ten bits about the
// answer is fitting the answer — slowly, through a straw, but fitting it.
//
// Rotation keeps the straw from draining the glass. Determinism is the guard,
// not a nicety: a rotation that can be re-rolled is a way to reshuffle until the
// number is favourable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotate, seededShuffle, seedForPrompt, rotationRecord, DEFAULT_FRACTION } from '../../scripts/lib/holdout-rotation.mjs';

const ids = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);

test('the same seed always rotates the same way', () => {
  const a = rotate({ tuning: ids(8, 't'), holdout: ids(8, 'h'), seed: 'abc' });
  const b = rotate({ tuning: ids(8, 't'), holdout: ids(8, 'h'), seed: 'abc' });
  assert.deepEqual(a.moved, b.moved);
  assert.deepEqual(a.holdout, b.holdout);
});

test('a different seed rotates differently', () => {
  const a = rotate({ tuning: ids(8, 't'), holdout: ids(8, 'h'), seed: 'abc' });
  const b = rotate({ tuning: ids(8, 't'), holdout: ids(8, 'h'), seed: 'xyz' });
  assert.notDeepEqual(a.moved.toTuning, b.moved.toTuning);
});

test('an unseeded rotation is refused, not improvised', () => {
  assert.throws(() => rotate({ tuning: ids(8, 't'), holdout: ids(8, 'h') }), /needs a seed/);
});

test('the exchange is equal, so the split sizes never drift', () => {
  // A holdout that shrinks makes every later interval wider, which reads as the
  // agent getting less certain when nothing about the agent changed.
  const before = { tuning: ids(12, 't'), holdout: ids(8, 'h') };
  const after = rotate({ ...before, seed: 's' });
  assert.equal(after.tuning.length, before.tuning.length);
  assert.equal(after.holdout.length, before.holdout.length);
});

test('no case is lost or duplicated', () => {
  const before = { tuning: ids(12, 't'), holdout: ids(8, 'h') };
  const after = rotate({ ...before, seed: 's' });
  const all = [...after.tuning, ...after.holdout].sort();
  assert.deepEqual(all, [...before.tuning, ...before.holdout].sort());
  assert.equal(new Set(all).size, all.length, 'and nothing appears twice');
});

test('cases actually cross over — the next candidate faces a different set', () => {
  const before = { tuning: ids(12, 't'), holdout: ids(8, 'h') };
  const after = rotate({ ...before, seed: 's' });
  assert.ok(after.moved.toHoldout.length > 0);
  assert.ok(after.moved.toHoldout.every((c) => c.startsWith('t')), 'tuning cases become holdout');
  assert.ok(after.moved.toTuning.every((c) => c.startsWith('h')), 'and holdout cases become tuning');
  assert.notDeepEqual(after.holdout.sort(), before.holdout.sort());
});

test('a set too small to rotate says so instead of making a gesture', () => {
  // Moving one case of four is not a rotation. Reporting it as one would be the
  // same defect as everything else here: a thing that did not happen looking
  // like a thing that did.
  const r = rotate({ tuning: ['t1'], holdout: ['h1', 'h2'], seed: 's' });
  assert.deepEqual(r.moved.toTuning, []);
  assert.match(r.why, /too small to rotate/);
});

test('it refuses when tuning cannot supply the exchange', () => {
  const r = rotate({ tuning: ['t1'], holdout: ids(8, 'h'), seed: 's' });
  assert.deepEqual(r.moved.toHoldout, [], 'an unequal exchange would shrink the holdout');
  assert.match(r.why, /too small/);
});

test('the seed comes from the prompt, so nobody chooses the roll', () => {
  const a = seedForPrompt('You are the architect.\n');
  const b = seedForPrompt('You are the architect.\n');
  const c = seedForPrompt('You are the architect. Be brief.\n');
  assert.equal(a, b, 'the same approval rotates the same way');
  assert.notEqual(a, c, 'a different approval rotates differently');
});

test('an empty prompt still yields a usable seed rather than throwing', () => {
  assert.ok(seedForPrompt('').length > 0);
  assert.ok(seedForPrompt(undefined).length > 0);
});

test('the record names what moved, because an unauditable rotation is no rotation', () => {
  const r = rotate({ tuning: ids(12, 't'), holdout: ids(8, 'h'), seed: 'deadbeef' });
  const line = rotationRecord(r, { at: '2026-08-11T12:00:00Z', agent: 'architect' });
  assert.match(line, /holdout-rotation/);
  assert.match(line, /seed=deadbeef/);
  assert.match(line, /agent=architect/);
  assert.match(line, /to-tuning: h/);
  assert.match(line, /to-holdout: t/);
});

test('the record of a refused rotation shows nothing moved', () => {
  const r = rotate({ tuning: ['t1'], holdout: ['h1'], seed: 's' });
  assert.match(rotationRecord(r, {}), /to-tuning: -/);
});

test('seededShuffle is a permutation, not a sample', () => {
  const src = ids(20, 'c');
  const out = seededShuffle(src, 'seed');
  assert.deepEqual(out.sort(), [...src].sort());
});

test('the default fraction moves a quarter', () => {
  const r = rotate({ tuning: ids(20, 't'), holdout: ids(20, 'h'), seed: 's' });
  assert.equal(r.moved.toTuning.length, Math.floor(20 * DEFAULT_FRACTION));
});
