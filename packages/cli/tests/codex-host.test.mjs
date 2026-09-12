import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexControllerCandidates, runCodexHost } from '../dist/codex-host.js';

test('Codex host bridge prefers the bundled runtime and forwards argv without a shell', () => {
  const calls = [];
  const code = runCodexHost(['status', '11111111-1111-4111-8111-111111111111'], {
    exists: path => path.includes('/board/scripts/codex-pipeline.mjs'),
    spawn: (bin, args, options) => { calls.push({ bin, args, options }); return { status: 7 }; },
  });
  assert.equal(code, 7); assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, process.execPath);
  assert.deepEqual(calls[0].args.slice(-2), ['status', '11111111-1111-4111-8111-111111111111']);
  assert.equal(calls[0].options.stdio, 'inherit');
});

test('Codex host bridge has a repo fallback for development checkouts', () => {
  const candidates = codexControllerCandidates();
  assert.match(candidates[0], /board\/scripts\/codex-pipeline\.mjs$/);
  assert.match(candidates[1], /scripts\/codex-pipeline\.mjs$/);
});

test('a missing packaged runtime fails instead of reporting a launch', () => {
  assert.equal(runCodexHost(['doctor'], { exists: () => false, spawn: () => { throw Error('must not run'); } }), 2);
});
