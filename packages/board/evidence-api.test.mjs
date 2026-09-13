import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendEvidence } from '../../scripts/lib/evidence-ledger.mjs';
import { evidenceProjection, projectEvidenceRows } from '../../scripts/lib/evidence-projection.mjs';
import { dispatch } from './lib/routes.mjs';

const project = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-ev-api-'));
  fs.mkdirSync(path.join(root, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(root, '.great_cto', 'PROJECT.md'), 'slug: evidence-fixture\n');
  return root;
};
const clean = (root) => fs.rmSync(root, { recursive: true, force: true });

function event(overrides = {}) {
  return {
    v: 1,
    event_id: overrides.event_id || `evt_${String(overrides.n || 1).padStart(32, '0')}`,
    event_type: overrides.event_type || 'pipeline.run.created',
    occurred_at: overrides.occurred_at || '2026-09-13T10:00:00.000Z',
    project_id: 'evidence-fixture', run_id: overrides.run_id || 'run-1',
    stage_id: overrides.stage_id ?? null, attempt: overrides.attempt ?? null,
    host: overrides.host ?? 'codex', agent: overrides.agent ?? null,
    gate_id: null, parent_event_id: null,
    idempotency_key: overrides.idempotency_key || `key-${overrides.n || 1}`,
    state: overrides.state || 'pending', reason: overrides.reason ?? null,
    diff_sha: overrides.diff_sha ?? null, artifact_sha: overrides.artifact_sha ?? null, details: overrides.details || {},
  };
}

test('projection deterministically reconstructs runs, stages and resolved gates', () => {
  const rows = [
    event({ n: 6, event_type: 'pipeline.run.completed', state: 'completed', occurred_at: '2026-09-13T10:00:06.000Z' }),
    event({ n: 2, event_type: 'pipeline.stage.started', stage_id: 'architect', agent: 'architect', attempt: 1, state: 'running', occurred_at: '2026-09-13T10:00:02.000Z' }),
    event({ n: 1 }),
    event({ n: 3, event_type: 'pipeline.stage.completed', stage_id: 'architect', agent: 'architect', attempt: 1, state: 'passed', artifact_sha: 'a'.repeat(64), occurred_at: '2026-09-13T10:00:03.000Z' }),
    event({ n: 4, event_type: 'pipeline.gate.pending', stage_id: 'architect', agent: 'architect', state: 'pending', details: { gates: ['gate:arch'] }, occurred_at: '2026-09-13T10:00:04.000Z' }),
    event({ n: 5, event_type: 'pipeline.gate.approved', stage_id: 'architect', agent: 'architect', state: 'passed', details: { gates: ['gate:arch'] }, occurred_at: '2026-09-13T10:00:05.000Z' }),
  ];
  const p = projectEvidenceRows(rows, { limit: 3 });
  assert.equal(p.state, 'some');
  assert.equal(p.summary.events, 6);
  assert.equal(p.summary.pipeline_runs, 1);
  assert.equal(p.summary.pending_gates, 0);
  assert.equal(p.runs[0].state, 'completed');
  assert.equal(p.runs[0].stages[0].stage_id, 'architect');
  assert.equal(p.runs[0].stages[0].state, 'passed');
  assert.equal(p.runs[0].gates[0].state, 'passed');
  assert.equal(p.decisions[0].state, 'passed');
  assert.equal(p.harnesses[0].host, 'codex');
  assert.equal(p.fleet[0].agent, 'architect');
  assert.equal(p.receipts[0].artifact_sha, 'a'.repeat(64));
  assert.match(p.revision, /^[a-f0-9]{64}$/);
  assert.equal(p.provenance.schema_version, 1);
  assert.equal(projectEvidenceRows([...rows].reverse()).revision, p.revision, 'revision is replay-order independent');
  assert.equal(p.events.length, 3);
  assert.equal(p.events.at(-1).event_type, 'pipeline.run.completed');
});

test('explicit uncertain evidence degrades the projection without becoming empty', () => {
  const p = projectEvidenceRows([event({ state: 'unknown', reason: 'host status unavailable' })]);
  assert.equal(p.state, 'degraded');
  assert.equal(p.summary.uncertain, 1);
  assert.match(p.degraded[0], /host status unavailable/);
});

test('reader keeps absent, readable and corrupt ledgers distinct', () => {
  const root = project();
  try {
    assert.equal(evidenceProjection(root).state, 'none');
    appendEvidence(root, {
      eventType: 'pipeline.run.created', projectId: 'evidence-fixture', runId: 'run-1', host: 'codex',
      idempotencyKey: 'run-1:created', state: 'pending', details: {},
    });
    fs.mkdirSync(path.join(root, '.great_cto', 'verdicts'));
    fs.writeFileSync(path.join(root, '.great_cto', 'verdicts', 'architect.log'),
      '{"v":1,"ts":"2026-09-13T10:00:00Z","agent":"architect","verdict":"APPROVED","project":"evidence-fixture"}\n');
    fs.writeFileSync(path.join(root, '.great_cto', 'pipeline-runs.jsonl'),
      '{"v":1,"ts":"2026-09-13T10:00:00Z","agent":"architect","outcome":"dispatch"}\n');
    const readable = evidenceProjection(root);
    assert.equal(readable.state, 'degraded');
    assert.equal(readable.migration.state, 'mismatch');
    assert.equal(readable.migration.sources.verdicts.legacy_only, 1);
    assert.equal(readable.migration.sources.dispatcher.legacy_only, 1);
    fs.appendFileSync(path.join(root, '.great_cto', 'evidence-ledger.jsonl'), 'torn\n');
    const broken = evidenceProjection(root);
    assert.equal(broken.state, 'unreadable');
    assert.deepEqual(broken.events, [], 'partial rows cannot claim a projection');
    assert.deepEqual(broken.runs, []);
  } finally { clean(root); }
});

test('/api/evidence returns the project-scoped projection and degradation header', async () => {
  const root = project();
  const call = async () => {
    const headers = {}; let body = '';
    const req = { method: 'GET', headers: {}, on() {} };
    const res = {
      setHeader(k, v) { headers[k] = v; },
      writeHead(_status, h) { Object.assign(headers, h || {}); },
      end(value = '') { body += value; }, write() {}, on() {},
    };
    const url = new URL('http://board/api/evidence?limit=20');
    assert.equal(await dispatch(req, res, url, root), true);
    return { headers, body: JSON.parse(body) };
  };
  try {
    assert.equal((await call()).body.state, 'none');
    fs.writeFileSync(path.join(root, '.great_cto', 'evidence-ledger.jsonl'), 'torn\n');
    const broken = await call();
    assert.equal(broken.body.state, 'unreadable');
    assert.ok(broken.headers['X-Board-Degraded']);
  } finally { clean(root); }
});
