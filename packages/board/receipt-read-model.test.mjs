import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { receiptReadModel, invalidateReceipt, clearReceipts } from './lib/receipt-read-model.mjs';

const turn = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => clearReceipts());

test('receipt request never waits for repository work', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const first = receiptReadModel('/repo', { runner: () => pending });
  assert.equal(first.state, 'computing');
  assert.equal(first.projection.freshness, 'loading');
  release({ state: 'matches', agent: 'reviewer' });
  await turn(); await turn();
  const ready = receiptReadModel('/repo', { runner: () => assert.fail('fresh receipt must be reused') });
  assert.equal(ready.state, 'matches');
  assert.equal(ready.projection.freshness, 'current');
  assert.equal(ready.projection.revision, 1);
});

test('expired receipt returns last-good stale while refresh runs', async () => {
  receiptReadModel('/repo', { runner: async () => ({ state: 'matches' }), ttlMs: 1000 });
  await turn(); await turn();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const stale = receiptReadModel('/repo', { runner: () => pending, ttlMs: 0 });
  assert.equal(stale.state, 'matches');
  assert.equal(stale.projection.freshness, 'stale');
  release({ state: 'differs', changed: ['a.mjs'] });
  await turn(); await turn();
  const fresh = receiptReadModel('/repo', { runner: async () => null, ttlMs: 1000 });
  assert.equal(fresh.state, 'differs');
  assert.deepEqual(fresh.changed, ['a.mjs']);
});

test('worker failure is explicit unreadable evidence', async () => {
  receiptReadModel('/repo', { runner: async () => { throw new Error('git unavailable'); } });
  await turn(); await turn();
  const failed = receiptReadModel('/repo', { runner: async () => null });
  assert.equal(failed.state, 'unreadable');
  assert.equal(failed.projection.freshness, 'unreadable');
  assert.match(failed.why, /git unavailable/);
});

test('repository change during hashing forces a second receipt computation', async () => {
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const runner = async () => (++calls === 1 ? first : { state: 'matches', generation: 2 });
  receiptReadModel('/race', { runner });
  await turn();
  invalidateReceipt('/race');
  releaseFirst({ state: 'matches', generation: 1 });
  await turn(); await turn(); await turn();
  const current = receiptReadModel('/race', { runner });
  assert.equal(calls, 2);
  assert.equal(current.projection.freshness, 'current');
  assert.equal(current.generation, 2);
});
