// tests/lib/stall-triage.test.mjs — architect-loop R9 stall triage (slice).
// Run: node --test tests/lib/stall-triage.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStalled, triage } from '../../scripts/lib/stall-triage.mjs';

const NOW = 1_000_000_000_000;

test('isStalled: fresh output → live; old → stalled; never → stalled', () => {
  assert.equal(isStalled(NOW - 10_000, NOW, 60_000), false);
  assert.equal(isStalled(NOW - 120_000, NOW, 60_000), true);
  assert.equal(isStalled(undefined, NOW, 60_000), true);
  assert.equal(isStalled(NaN, NOW, 60_000), true);
});

test('triage: flags only stalled lanes', () => {
  const lanes = [
    { id: 'a', lastOutputMs: NOW - 5_000, filesChanged: 3 },     // live
    { id: 'b', lastOutputMs: NOW - 300_000, filesChanged: 1 },   // stalled
  ];
  const { stalled } = triage(lanes, NOW, 180_000);
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].id, 'b');
});

test('triage: kill narrowest first (fewest files), ties by longest idle', () => {
  const lanes = [
    { id: 'big', lastOutputMs: NOW - 400_000, filesChanged: 9 },
    { id: 'narrow', lastOutputMs: NOW - 200_000, filesChanged: 1 },
    { id: 'never', lastOutputMs: undefined, filesChanged: 1 },
  ];
  const { killOrder } = triage(lanes, NOW, 180_000);
  // both narrow(1) and never(1) before big(9); never has Infinity idle → first
  assert.deepEqual(killOrder.map(l => l.id), ['never', 'narrow', 'big']);
});

test('triage: nothing stalled → empty', () => {
  const { stalled, killOrder } = triage([{ id: 'a', lastOutputMs: NOW, filesChanged: 2 }], NOW, 60_000);
  assert.equal(stalled.length, 0);
  assert.equal(killOrder.length, 0);
});
