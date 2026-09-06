// Places where the board answered a question it had not asked.
//
// Each of these shipped, and each is the same defect wearing different clothes:
// a value that was never measured rendered as a measured value, in the colour
// that means "fine". Found by mapping the board against its own API on
// 2026-09-06.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getAgentsFleet } from '../../packages/board/lib/fleet.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const board = readFileSync(path.join(ROOT, 'packages/board/public/index.html'), 'utf8');

test('an unrun security scan is not a passing one', () => {
  // `m.security?.blocked ?? 0` with `cls: … ? 'red' : 'green'` painted a GREEN
  // ZERO for a project that has never been scanned. Green means safe. Nobody
  // had established that.
  assert.doesNotMatch(board, /m\.security\?\.blocked \?\? 0/,
    'the security tile must not default a missing measurement to zero');
  assert.match(board, /no security scan has run — this is not a clean result/,
    'and it must say so where a reader can see it');
  // No colour when unmeasured: green claims safe, red claims unsafe, and
  // neither is known.
  assert.match(board, /cls: m\.security\?\.blocked == null \? '' :/);
});

test('rework rounds distinguish "none" from "not computable"', () => {
  assert.doesNotMatch(board, /acc\.rework_rounds \?\? 0/);
  assert.match(board, /rework cannot be counted/);
});

test('the live indicator ships connecting, not connected', () => {
  // The markup used to assert "live · synced just now" before any connection
  // existed — true only after the SSE handshake, and never corrected if neither
  // handler fired.
  assert.doesNotMatch(board, /<span id="live-label">live · synced just now<\/span>/,
    'the shipped markup must not claim a sync that has not happened');
  assert.match(board, /class="live-dot connecting"/);
  assert.match(board, /<span id="live-label">connecting…<\/span>/);
  assert.match(board, /\.live-dot\.connecting\s*\{/, 'and the third state has a rule of its own');
});

test('the fleet reports tool posture, which it never used to read', () => {
  const fleet = getAgentsFleet(ROOT);
  assert.ok(fleet.agents.length > 60, 'the fleet loaded');
  for (const a of fleet.agents) {
    assert.ok(a.posture, `${a.slug} carries a posture`);
    assert.ok(['expensive', 'routine', 'unclassified', 'undeclared', 'unreadable'].includes(a.posture.state),
      `${a.slug} posture state is one of the five: got ${a.posture.state}`);
    if (a.posture.state === 'expensive') assert.ok(a.posture.expensive.length, `${a.slug} names what is expensive`);
  }
});

test('a model that was never pinned is not reported as sonnet', () => {
  // `model: modelM?.[1]?.trim() || 'sonnet'` made "pinned to sonnet",
  // "declares no model" and "the file could not be read" one string.
  const fleet = getAgentsFleet(ROOT);
  for (const a of fleet.agents) {
    assert.ok(['pinned', 'undeclared', 'unreadable'].includes(a.model_state), `${a.slug}: ${a.model_state}`);
    if (a.model_state === 'pinned') assert.ok(a.model, `${a.slug} pinned → a model name`);
    else assert.equal(a.model, null, `${a.slug} not pinned → null, never a default`);
  }
});

test('the per-agent savings ratio says it is a ratio, not a measurement', () => {
  // Both sides of it are runs x a constant x a rate, so it is the rate ratio for
  // every agent that ran at all. metrics.mjs nulls its equivalent for this
  // reason; the fleet shipped it as a per-agent number.
  const fleet = getAgentsFleet(ROOT);
  for (const a of fleet.agents) {
    if (a.savings_x == null) assert.equal(a.savings_source, null);
    else assert.equal(a.savings_source, 'ratio', `${a.slug} labels its savings as derived`);
  }
});

test('the stuck detector reads a field that exists', () => {
  const raw = readFileSync(path.join(ROOT, 'packages/board/lib/routes.mjs'), 'utf8');
  // Comments are stripped before the search. The first version of this guard
  // failed on the comment that EXPLAINS the bug — the same trap that produced a
  // phantom `.why-` class in the CSS scanner the same day: a scanner that reads
  // prose as code finds the thing it was told to look for, in the explanation of
  // why it is gone.
  const routes = raw.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  // `t.startedAt` is produced by no code path in this repository, so every row
  // got age_h null and the filter removed all of them: the panel reported
  // "nothing is stuck" about a question it never asked.
  assert.doesNotMatch(routes, /t\.startedAt/, 'startedAt is not a field a task has');
  assert.match(routes, /t\.updated_at \|\| t\.created_at/);
  // A task whose age cannot be determined is counted, not silently dropped.
  assert.match(routes, /stuck_unmeasurable/);
  assert.match(routes, /stuck_in_progress/);
});
