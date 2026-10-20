import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
  // Assembled: token-shaped literals read as leaked credentials to secret scanners.
  const gateSecret = ['gate', 'secret'].join('-'), releaseSecret = ['release', 'secret'].join('-');
  writeFileSync(join(store, `${id}.json`), JSON.stringify({ version: 1, id, root, prompt: 'secret task', status: 'awaiting-release',
    queue: ['devops'], results: { 'senior-dev': {} }, attempts: [], pending: { role: 'devops', token: gateSecret, gates: ['ship'] },
    release: { adapter: 'github-release', status: 'awaiting-approval', token: releaseSecret, artifactDigest: 'abc',
      target: { repository: 'acme/widget', tag: 'v1', targetCommitish: 'a'.repeat(40), releaseRoot: '/private/release' }, path: '/private/published',
      artifacts: [{ path: 'dist/a', base64: 'c2VjcmV0' }], activation: 'none', rollback: 'superseding-release' } }));
  const result = listCodexRuns({ root, store });
  assert.equal(result.state, 'ok'); assert.equal(result.runs.length, 1);
  const encoded = JSON.stringify(result);
  for (const forbidden of ['secret task', 'gate-secret', 'release-secret', 'c2VjcmV0', '/private/release', '/private/published']) assert.equal(encoded.includes(forbidden), false);
  assert.equal(encoded.includes(root), false);
  assert.equal(encoded.includes(store), false);
  assert.equal(result.runs[0].project, 'project');
  assert.equal(result.runs[0].controllerDispatch.workerCalls, null);
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
  const projected = projectCodexState({ id: 'x', version: 1, root: '/p', status: 'ready', results: {},
    hostRoutes: { qa: 'claude-code' },
    wave: { id: 'w', roles: ['qa'], hosts: { qa: 'claude-code' }, status: 'fetched',
      responses: { qa: { finalText: 'secret proposal bytes' } }, context: { text: 'secret context' } },
    attempts: [{ id: 'a', role: 'pm', host: 'claude-code', secret: 'no' }] });
  assert.equal(JSON.stringify(projected).includes('secret'), false);
  assert.equal(projected.project, 'p');
  assert.equal(projected.attempts[0].host, 'claude-code');
  assert.equal(projected.wave.status, 'fetched');
});

test('run projection exposes only invocation aggregates, never raw dispatch records', () => {
  const state = { id: 'x', version: 1, root: '/p', status: 'ready', dispatchEvidence: {
    version: 1, completeHistory: true, records: [{ id: 'private-call-id', host: 'codex', role: 'qa', kind: 'worker',
      startedAt: '2026-10-02T00:00:00.000Z', finishedAt: '2026-10-02T00:00:00.010Z', outcome: 'returned',
      incidentalField: 'private-payload' }] } };
  const projected = projectCodexState(state);
  assert.equal(projected.controllerDispatch.activeMs, 10);
  assert.equal(projected.controllerDispatch.workerCalls, 1);
  assert.equal(projected.controllerDispatch.actualCostUsd, null);
  for (const value of ['private-call-id', 'private-payload', 'startedAt']) assert.ok(!JSON.stringify(projected).includes(value));
});

test('actual CLI status reads telemetry aggregates without dispatch or approval mutation', t => {
  const { root, store } = fixture(t), id = '66666666-6666-4666-8666-666666666666';
  const path = join(store, `${id}.json`);
  const raw = JSON.stringify({ version: 1, id, root, status: 'ready', results: {}, approvals: [], queue: [],
    dispatchEvidence: { version: 1, completeHistory: true, records: [] } });
  writeFileSync(path, raw, { mode: 0o600 });
  const cli = fileURLToPath(new URL('../../scripts/codex-pipeline.mjs', import.meta.url));
  const result = JSON.parse(execFileSync(process.execPath, [cli, 'status', id], {
    encoding: 'utf8', env: { ...process.env, GREAT_CTO_CODEX_RUNS_DIR: store }, timeout: 10000 }));
  assert.equal(result.controllerDispatch.workerCalls, 0);
  assert.equal(result.controllerDispatch.activeMs, 0);
  assert.equal(result.controllerDispatch.actualCostUsd, null);
  assert.equal(result.status, 'ready');
  assert.equal(readFileSync(path, 'utf8'), raw, 'read-only status leaves state bytes unchanged');
});

// A run whose project directory was deleted is READ fine; it just belongs to no
// project that exists. Counting it as unreadable put "project membership is
// unknown" on every board for four test runs from /tmp, deleted weeks earlier.
test('a run whose root no longer exists is orphaned, not unreadable, and not this project', async () => {
  const { mkdtempSync, mkdirSync: mk, writeFileSync: wf, rmSync: rm } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: j } = await import('node:path');
  const { listCodexRuns } = await import('../../scripts/lib/codex-host-state.mjs');
  const base = mkdtempSync(j(tmpdir(), 'codex-orphan-'));
  try {
    const store = j(base, 'runs'); mk(store);
    const here = j(base, 'here'); mk(here);
    const gone = j(base, 'gone');
    const id = (n) => `0000000${n}-0000-0000-0000-000000000000`;
    wf(j(store, `${id(1)}.json`), JSON.stringify({ id: id(1), version: 1, root: here, status: 'done' }));
    wf(j(store, `${id(2)}.json`), JSON.stringify({ id: id(2), version: 1, root: gone, status: 'done' }));
    wf(j(store, `${id(3)}.json`), '{not json');
    const r = listCodexRuns({ root: here, store });
    assert.equal(r.runs.length, 1);
    assert.equal(r.orphaned, 1, 'the deleted-root run is counted as orphaned');
    assert.equal(r.unreadable, 1, 'only the corrupt file is unreadable');
    assert.equal(r.state, 'degraded', 'a corrupt file still degrades the read');
    rm(j(store, `${id(3)}.json`));
    const clean = listCodexRuns({ root: here, store });
    assert.equal(clean.state, 'ok', 'an orphaned run alone does not degrade the read');
    assert.equal(clean.unreadable, 0);
  } finally { rm(base, { recursive: true, force: true }); }
});
