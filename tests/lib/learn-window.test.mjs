// learn-window: reflect on a long session in windows, not only on its tail.
//
// 2026-10-01: the session-end learner read the last 8 MB of a 270 MB session —
// 3% of it — and added nothing. With `learn_every_n` set, every N main-session
// tool calls start the learner on the part of the transcript written since the
// previous window, so the whole session is read once, in pieces.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tick, learnEvery, windowStart, forget } from '../../scripts/lib/learn-window.mjs';

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'learn-window-')); made.push(d); return d; };

function setup({ every = 3, autoLearn = true } = {}) {
  const home = tmp();
  mkdirSync(join(home, '.great_cto'));
  writeFileSync(join(home, '.great_cto', 'config.json'), JSON.stringify({ auto_learn: autoLearn, learn_every_n: every }));
  const transcript = join(tmp(), 't.jsonl');
  writeFileSync(transcript, 'x'.repeat(100));
  const spawned = [];
  const opts = { cwd: tmp(), stateDir: tmp(), home, env: {}, now: 1_000, spawn: (o) => spawned.push(o) };
  return { opts, transcript, spawned, payload: { session_id: 'sess-1', transcript_path: transcript } };
}

test('off unless learn_every_n is set — the default costs nothing', () => {
  const s = setup({ every: 0 });
  for (let i = 0; i < 10; i++) assert.equal(tick(s.payload, s.opts).action, 'off');
  assert.equal(s.spawned.length, 0);
});

test('off when auto-learn is off, whatever learn_every_n says', () => {
  const s = setup({ autoLearn: false });
  for (let i = 0; i < 5; i++) tick(s.payload, s.opts);
  assert.equal(s.spawned.length, 0);
});

test('every N calls the learner starts on the window since the last one', () => {
  const s = setup({ every: 3 });
  assert.equal(tick(s.payload, s.opts).action, 'count');
  assert.equal(tick(s.payload, s.opts).action, 'count');
  assert.equal(tick(s.payload, s.opts).action, 'spawn');
  assert.deepEqual(s.spawned.map((o) => o.fromOffset), [0]);

  appendFileSync(s.transcript, 'y'.repeat(50));
  const later = { ...s.opts, now: 1_000 + 20 * 60_000 };   // the first run has finished
  tick(s.payload, later); tick(s.payload, later);
  assert.equal(tick(s.payload, later).action, 'spawn');
  assert.deepEqual(s.spawned.map((o) => o.fromOffset), [0, 100], 'the second window starts where the first ended');
});

test('a window does not start while the previous run may still be going', () => {
  const s = setup({ every: 1 });
  assert.equal(tick(s.payload, s.opts).action, 'spawn');
  assert.equal(tick(s.payload, { ...s.opts, now: 1_000 + 60_000 }).action, 'busy');
  assert.equal(s.spawned.length, 1);
});

test('subagent calls are not the main session and are not counted', () => {
  const s = setup({ every: 1 });
  assert.equal(tick({ ...s.payload, agent_id: 'a1' }, s.opts).action, 'subagent');
  assert.equal(s.spawned.length, 0);
});

test('session end reads only what no window has read, then forgets the session', () => {
  const s = setup({ every: 1 });
  tick(s.payload, s.opts);
  assert.equal(windowStart('sess-1', s.opts), 100);
  forget('sess-1', s.opts);
  assert.equal(windowStart('sess-1', s.opts), 0);
});

test('learn_every_n comes from the environment first, then the config file', () => {
  const s = setup({ every: 7 });
  assert.equal(learnEvery({ env: {}, home: s.opts.home }), 7);
  assert.equal(learnEvery({ env: { GREAT_CTO_LEARN_EVERY_N: '40' }, home: s.opts.home }), 40);
  assert.equal(learnEvery({ env: { GREAT_CTO_LEARN_EVERY_N: '0' }, home: s.opts.home }), 0);
});
