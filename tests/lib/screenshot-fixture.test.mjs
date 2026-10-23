import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFixture, buildShowcaseRecords, SAMPLE_TASK_ID, SAMPLE_RUN_ID } from '../../scripts/lib/screenshot-fixture.mjs';
import { listWorkTasks, publicWorkTask } from '../../scripts/lib/work-tasks.mjs';
import { listCodexRuns } from '../../scripts/lib/codex-host-state.mjs';
import { projectWork } from '../../packages/board/lib/work.mjs';

test('sample records use the real readers, explicit linkage and no executable approval', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-showcase-test-'));
  try {
    const root = path.join(tmp, 'acme-storefront'), home = path.join(tmp, 'home');
    fs.mkdirSync(root); fs.mkdirSync(home); buildFixture(root);
    const stores = buildShowcaseRecords(root, home);
    const listing = listWorkTasks(root, { store: stores.tasks });
    assert.equal(listing.state, 'ok'); assert.equal(listing.tasks.length, 1);
    const codex = listCodexRuns({ root, store: stores.runs });
    assert.equal(codex.state, 'ok'); assert.equal(codex.runs.length, 1);
    const snapshot = projectWork({ projectId: listing.tasks[0].projectId, codex, tasks: listing.tasks.map(publicWorkTask) });
    const entry = snapshot.entries.find(e => e.taskId === SAMPLE_TASK_ID);
    assert.equal(entry.runId, SAMPLE_RUN_ID);
    assert.match(entry.title, /^Sample project:/);
    assert.equal(entry.execution.nodes.length, 5);
    assert.deepEqual(new Set(entry.execution.nodes.map(n => n.host)), new Set(['codex', 'claude-code']));
    assert.equal(entry.execution.topology, 'unknown');
    assert.equal(entry.capabilities.some(c => c.enabled), false);
    assert.equal(entry.evidence.some(e => e.verifierReported), false);
    assert.equal(entry.evidenceSections.find(s => s.id === 'runtime').state, 'unknown');
    assert.equal(entry.evidenceSections.find(s => s.id === 'review').state, 'unknown');
    assert.match(fs.readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8'), /Sample project.*Synthetic design/);
    assert.equal(fs.statSync(path.join(stores.tasks, `${SAMPLE_TASK_ID}.json`)).mode & 0o077, 0);
    assert.equal(fs.statSync(stores.tasks).mode & 0o077, 0);
    assert.throws(() => buildShowcaseRecords(root, root), /outside/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
