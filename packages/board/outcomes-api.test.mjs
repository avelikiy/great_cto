import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEvidence } from '../../scripts/lib/evidence-ledger.mjs';
import { appendOutcome } from '../../scripts/lib/outcome-eval.mjs';
import { dispatch } from './lib/routes.mjs';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'gcto-outcome-api-'));
  mkdirSync(join(root, '.great_cto'));
  writeFileSync(join(root, '.great_cto', 'PROJECT.md'), 'slug: outcome-api\n');
  return root;
}

async function call(root) {
  const headers = {}; let body = '';
  const req = { method: 'GET', headers: {}, on() {} };
  const res = { setHeader(k, v) { headers[k] = v; }, writeHead(_s, h) { Object.assign(headers, h || {}); }, end(v = '') { body += v; }, write() {}, on() {} };
  assert.equal(await dispatch(req, res, new URL('http://board/api/outcomes'), root), true);
  return { headers, body: JSON.parse(body) };
}

test('/api/outcomes reports sample size and insufficient_data without false green', async () => {
  const root = project();
  try {
    appendEvidence(root, { eventType: 'pipeline.run.completed', projectId: 'outcome-api', runId: 'run-1', host: 'codex', idempotencyKey: 'run-1:done', state: 'completed' });
    appendOutcome(root, { projectId: 'outcome-api', runId: 'run-1', outcome: 'accepted', host: 'codex', model: 'gpt-5' });
    const result = await call(root);
    assert.equal(result.body.state, 'insufficient_data');
    assert.deepEqual(result.body.coverage, { eligible: 1, linked: 1, ratio: 1 });
    assert.equal(result.body.metrics.sample_size, 1);
    assert.equal(result.body.mutation.applied, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('/api/outcomes exposes unreadable ledger health', async () => {
  const root = project();
  try {
    writeFileSync(join(root, '.great_cto', 'outcomes.jsonl'), 'torn\n');
    const result = await call(root);
    assert.equal(result.body.state, 'unreadable');
    assert.ok(result.headers['X-Board-Degraded']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Ledger UI names sample size, insufficient_data and no automatic policy mutation', () => {
  const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="outcome-feedback"/);
  assert.match(html, /Sample size/);
  assert.match(html, /insufficient_data/);
  assert.match(html, /Recommendations never apply themselves/);
  assert.doesNotMatch(html, /`\/api\/scores\$\{pqs\(\)\}&limit=/, 'score URL cannot start its query string with &');
});
