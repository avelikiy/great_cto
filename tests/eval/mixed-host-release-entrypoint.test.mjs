import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const entry = resolve(import.meta.dirname, 'mixed-host-release-live.mjs');
const image = 'node@sha256:' + 'a'.repeat(64);

test('full-graph harness refuses unpinned image before creating or starting a fixture', () => {
  const r = spawnSync(process.execPath, [entry], { env: { ...process.env, GREAT_CTO_LIVE_DOCKER_IMAGE: 'node:latest' }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /must be a pinned/);
});

test('full-graph harness refuses extra runtime arguments before any host dispatch', () => {
  const r = spawnSync(process.execPath, [entry, '.', 'extra'], { env: { ...process.env, GREAT_CTO_LIVE_DOCKER_IMAGE: image }, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Usage: mixed-host-release-live/);
});
