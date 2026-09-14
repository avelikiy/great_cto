import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'index.html'), 'utf8');
const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, 'lib', 'routes.mjs'), 'utf8');
const snapshotProcess = fs.readFileSync(path.join(here, 'lib', 'snapshot-process.mjs'), 'utf8');
const receiptModel = fs.readFileSync(path.join(here, 'lib', 'receipt-read-model.mjs'), 'utf8');
const init = html.match(/async function init\(\) \{[\s\S]*?\n\}/)?.[0] || '';

test('initial data plane uses one bootstrap request instead of endpoint fan-out', () => {
  assert.match(init, /\/api\/bootstrap/);
  for (const endpoint of ['tasks', 'metrics', 'share', 'projects', 'inbox', 'receipt']) {
    assert.doesNotMatch(init, new RegExp(`/api/${endpoint}`), `${endpoint} must not be fetched independently during init`);
  }
});

test('non-default destinations are not preloaded during Decisions boot', () => {
  for (const loader of ['loadMemory', 'refreshDocsCount', 'refreshCost', 'refreshPipeline', 'refreshLogs', 'refreshAgentsInstalled']) {
    assert.doesNotMatch(init, new RegExp(`${loader}\\(\\)`), `${loader} belongs to its destination, not initial paint`);
  }
});

test('receipt computation is process-isolated and UI knows the computing state', () => {
  assert.match(receiptModel, /spawn\(process\.execPath/);
  assert.match(snapshotProcess, /fork\(WORKER/);
  assert.match(routes, /runSnapshotWorker\(cwd\)/);
  assert.match(html, /rc\.state === 'computing'/);
  assert.match(html, /d\.state === 'computing'/);
});
