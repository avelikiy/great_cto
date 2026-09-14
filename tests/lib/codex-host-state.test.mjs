import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listCodexRuns, projectCodexState, codexHostDoctor } from '../../scripts/lib/codex-host-state.mjs';

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'codex-state-test-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project'), other = join(base, 'other'), store = join(base, 'runs'), pluginRoot = join(base, 'plugin');
  mkdirSync(root); mkdirSync(other); mkdirSync(store, { mode: 0o700 }); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[product-owner]\n');
  return { base, root, other, store, pluginRoot };
}

test('Codex run projection excludes prompts, approval tokens and artifact bytes', t => {
  const { root, store } = fixture(t), id = '11111111-1111-4111-8111-111111111111';
  writeFileSync(join(store, `${id}.json`), JSON.stringify({ version: 1, id, root, prompt: 'secret task', status: 'awaiting-release',
    queue: ['devops'], results: { 'senior-dev': {} }, attempts: [], pending: { role: 'devops', token: 'gate-secret', gates: ['ship'] },
    release: { adapter: 'github-release', status: 'awaiting-approval', token: 'release-secret', artifactDigest: 'abc',
      target: { repository: 'acme/widget', tag: 'v1', targetCommitish: 'a'.repeat(40), releaseRoot: '/private/release' }, path: '/private/published',
      artifacts: [{ path: 'dist/a', base64: 'c2VjcmV0' }], activation: 'none', rollback: 'superseding-release' } }));
  const result = listCodexRuns({ root, store });
  assert.equal(result.state, 'ok'); assert.equal(result.runs.length, 1);
  const encoded = JSON.stringify(result);
  for (const forbidden of ['secret task', 'gate-secret', 'release-secret', 'c2VjcmV0', '/private/release', '/private/published']) assert.equal(encoded.includes(forbidden), false);
  assert.equal(encoded.includes(root), false);
  assert.equal(encoded.includes(store), false);
  assert.equal(result.runs[0].project, 'project');
  assert.deepEqual(result.runs[0].rolesCompleted, ['senior-dev']);
});

test('run listing filters by exact project and reports corrupt state', t => {
  const { root, other, store } = fixture(t);
  writeFileSync(join(store, '22222222-2222-4222-8222-222222222222.json'), JSON.stringify({ version: 1, id: '22222222-2222-4222-8222-222222222222', root, status: 'done' }));
  writeFileSync(join(store, '33333333-3333-4333-8333-333333333333.json'), JSON.stringify({ version: 1, id: '33333333-3333-4333-8333-333333333333', root: other, status: 'done' }));
  writeFileSync(join(store, '44444444-4444-4444-8444-444444444444.json'), '{bad');
  const result = listCodexRuns({ root, store });
  assert.equal(result.state, 'degraded'); assert.equal(result.unreadable, 1); assert.equal(result.runs.length, 1);
});

test('doctor distinguishes required readiness from optional adapter availability', t => {
  const { store, pluginRoot } = fixture(t);
  const run = (bin) => ({ status: bin === 'docker' ? 1 : 0, stdout: bin === 'gh' ? 'github.example' : '', stderr: '' });
  const result = codexHostDoctor({ pluginRoot, store, run, codex: { state: 'available', version: '1.0.0', auth: 'chatgpt', model: null, why: '' } });
  assert.equal(result.state, 'ready'); assert.equal(result.checks.docker.state, 'unavailable'); assert.equal(result.checks.github.state, 'available');
  chmodSync(store, 0o755);
  assert.equal(codexHostDoctor({ pluginRoot, store, run, codex: result.checks.codex }).state, 'blocked');
  chmodSync(store, 0o700);
  const stateFile = join(store, '55555555-5555-4555-8555-555555555555.json');
  writeFileSync(stateFile, '{}', { mode: 0o644 });
  assert.equal(codexHostDoctor({ pluginRoot, store, run, codex: result.checks.codex }).state, 'blocked');
});

test('projectCodexState keeps only bounded operational evidence', () => {
  const projected = projectCodexState({ id: 'x', version: 1, root: '/p', status: 'ready', results: {}, attempts: [{ id: 'a', role: 'pm', secret: 'no' }] });
  assert.equal(JSON.stringify(projected).includes('secret'), false);
  assert.equal(projected.project, 'p');
});
