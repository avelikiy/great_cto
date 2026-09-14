import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { materializeSnapshot, invalidateSnapshot, clearSnapshots } from './lib/read-model.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const turn = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => clearSnapshots());

test('cold snapshot answers loading immediately and materialises a revision in background', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const first = materializeSnapshot('/p', async () => pending);
  assert.deepEqual(first, { state: 'loading', stale: true, revision: 0, generated_at: null, data: null });

  await turn();
  release({ tasks: [{ id: 'A' }] });
  await turn();
  const current = materializeSnapshot('/p', () => assert.fail('current snapshot must not rebuild'));
  assert.equal(current.state, 'current');
  assert.equal(current.stale, false);
  assert.equal(current.revision, 1);
  assert.deepEqual(current.data.tasks, [{ id: 'A' }]);
});

test('invalidated snapshot serves last-good as stale until the next revision lands', async () => {
  materializeSnapshot('/p', async () => ({ value: 1 }));
  await turn(); await turn();
  invalidateSnapshot('/p');
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const stale = materializeSnapshot('/p', async () => pending);
  assert.equal(stale.state, 'stale');
  assert.equal(stale.data.value, 1);
  release({ value: 2 });
  await turn(); await turn();
  const current = materializeSnapshot('/p', () => null);
  assert.equal(current.state, 'current');
  assert.equal(current.revision, 2);
  assert.equal(current.data.value, 2);
});

test('failed refresh preserves last-good and exposes the failure', async () => {
  materializeSnapshot('/p', async () => ({ value: 1 }));
  await turn(); await turn();
  invalidateSnapshot('/p');
  materializeSnapshot('/p', async () => { throw new Error('projection broke'); });
  await turn(); await turn();
  const stale = materializeSnapshot('/p', async () => ({ value: 2 }));
  assert.equal(stale.state, 'stale');
  assert.equal(stale.data.value, 1);
  assert.match(stale.why, /projection broke/);
});

test('process restart serves persisted last-good immediately and marks it stale', async () => {
  const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-snapshot-'));
  materializeSnapshot('/persisted-project', async () => ({ tasks: [{ id: 'A' }] }), { persistDir });
  await turn(); await turn();
  clearSnapshots(); // simulate a new Board process; disk survives

  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const restored = materializeSnapshot('/persisted-project', () => pending, { persistDir });
  assert.equal(restored.state, 'stale');
  assert.equal(restored.stale, true);
  assert.deepEqual(restored.data.tasks, [{ id: 'A' }]);
  release({ tasks: [{ id: 'B' }] });
  await turn(); await turn();
  assert.deepEqual(materializeSnapshot('/persisted-project', () => null, { persistDir }).data.tasks, [{ id: 'B' }]);
});

test('invalidation during a build cannot publish that build as current', async () => {
  let releaseFirst;
  const first = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const builder = async () => (++calls === 1 ? first : { value: 'after-change' });
  materializeSnapshot('/race', builder);
  await turn();
  invalidateSnapshot('/race');
  releaseFirst({ value: 'before-change' });
  await turn(); await turn(); await turn();
  const current = materializeSnapshot('/race', builder);
  assert.equal(calls, 2, 'an invalidated in-flight build is followed by a fresh build');
  assert.equal(current.state, 'current');
  assert.equal(current.data.value, 'after-change');
});
