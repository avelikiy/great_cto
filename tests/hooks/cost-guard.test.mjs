// Tests for scripts/hooks/cost-guard.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/cost-guard.mjs');

function run(prompt) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DISABLE_COST_GUARD: '' },
  });
  return { exit: r.status, stderr: r.stderr };
}

test('cheap prompt is silent', () => {
  const r = run('add a comment to foo.ts');
  assert.equal(r.exit, 0);
  assert.equal(r.stderr, '');
});

test('/start triggers cost warning', () => {
  const r = run('/start build me a fintech app');
  assert.equal(r.exit, 0);
  assert.match(r.stderr, /\$5-\$15/);
});

test('/audit triggers cost warning', () => {
  const r = run('/audit the entire codebase');
  assert.equal(r.exit, 0);
  assert.match(r.stderr, /\$3-\$10/);
});

test('"architect this" matches', () => {
  const r = run('please architect this new system');
  assert.equal(r.exit, 0);
  assert.match(r.stderr, /architect/);
});

test('opt-out env var works', () => {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ prompt: '/start neobank' }),
    encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DISABLE_COST_GUARD: '1' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('empty stdin passes silently', () => {
  const r = spawnSync('node', [HOOK], { input: '', encoding: 'utf8' });
  assert.equal(r.status, 0);
});
