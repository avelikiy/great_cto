/**
 * "No gate exists" and "I could not ask" are different answers.
 *
 * `readGateBeads` returns `[]` on any failure, and `[]` makes every gate read as
 * `absent`, whose reason is "no gate:ship bead exists — the question has not
 * been asked". The DIRECTION of that is right and deliberate: absent is not
 * approved, so the pipeline waits. Nothing rides past a gate because beads was
 * unreachable, and that must stay true.
 *
 * What is wrong is the sentence. When `bd` times out the question may well have
 * been asked and answered; we simply could not hear it. A human reading "the
 * question has not been asked" goes and raises a second gate bead, or concludes
 * the gate was never required.
 *
 * And the cap made it likely rather than theoretical: `readGateBeads` allowed
 * bd 4000ms while this repository has measured bd taking up to 8700ms under the
 * parallelism its own test suite creates. Under load every gate read as absent,
 * so an APPROVED gate would stop the pipeline and ask to be created.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateState, readGateBeads } from '../../scripts/lib/gate-state.mjs';

test('a gate nobody raised is absent', () => {
  const r = gateState('gate:ship', []);
  assert.equal(r.state, 'absent');
  assert.match(r.why, /has not been asked|no gate/i);
});

test('a gate we could not read is UNREADABLE, and says so', () => {
  // The distinction this file exists for.
  const r = gateState('gate:ship', { unreadable: true, why: 'bd timed out' });
  assert.equal(r.state, 'unreadable');
  assert.match(r.why, /could not|unreadable|timed out/i);
  assert.doesNotMatch(r.why, /has not been asked/,
    'an unreadable store must not claim the gate was never raised');
});

test('unreadable is NOT approved — the pipeline still waits', () => {
  // The safety property. If this ever flips, a beads outage becomes an
  // auto-approval of every human gate in the pipeline.
  const r = gateState('gate:ship', { unreadable: true, why: 'bd timed out' });
  assert.notEqual(r.state, 'approved');
});

test('readGateBeads reports unreadable instead of an empty list', () => {
  // A cwd with no beads store at all: bd fails, and the caller must be able to
  // tell that from a store that answered "no gates".
  const r = readGateBeads({ cwd: '/nonexistent-project-xyz', timeoutMs: 3000 });
  assert.ok(r && typeof r === 'object', 'expected a result object');
  assert.equal(r.unreadable, true, 'a failed read must be marked unreadable');
});

test('the gate read allows bd as long as bd has been measured to take', () => {
  // 4000ms against a measured 8700ms worst case. Under `node --test` this made
  // "gate approved" unreadable by construction, and the pipeline would stop and
  // ask for a gate that already existed and was already approved.
  const src = readFileSync(new URL('../../scripts/lib/gate-state.mjs', import.meta.url), 'utf8');
  const m = src.match(/timeoutMs\s*=\s*(\d+)/);
  assert.ok(m, 'expected a default timeout in readGateBeads');
  assert.ok(Number(m[1]) > 8700,
    `gate read timeout ${m[1]}ms is below the 8700ms this repo measured for bd under its own parallelism`);
});
