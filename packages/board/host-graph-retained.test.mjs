import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bindNativeGraph, unbindNativeGraph, observeNativeGraphHook, nativeGraphObservations } from '../../scripts/lib/host-graph-bindings.mjs';
import { getHostGraphPage } from './lib/work.mjs';

// The board's GET /api/host-graph is a thin wrapper over getHostGraphPage.
test('after unbind the page endpoint serves retained history without enrolling or recording', t => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'gcto-board-retained-'))), root = join(tmp, 'project'); mkdirSync(root);
  const stores = { GREAT_CTO_GRAPH_BINDINGS_DIR: join(tmp, 'bindings'), GREAT_CTO_HOST_GRAPHS_DIR: join(tmp, 'journals') };
  const previous = Object.fromEntries(Object.keys(stores).map(k => [k, process.env[k]]));
  Object.assign(process.env, stores);
  t.after(() => {
    for (const [k, v] of Object.entries(previous)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    rmSync(tmp, { recursive: true, force: true });
  });
  const host = 'claude-code', sessionId = randomUUID();
  const ingest = (hook_event_name, extra = {}) => observeNativeGraphHook({ root, host, event: { session_id: sessionId, hook_event_name, tool_use_id: 'tool-1', tool_name: 'Read', ...extra } });
  bindNativeGraph({ root, host, sessionId, sourceVersion: '2.1.292' });
  ingest('PreToolUse'); ingest('PostToolUse');
  const live = getHostGraphPage(root, { host, sessionId });
  assert.equal(live.enrolled, true); assert.equal(live.retained, false); assert.equal(live.nodes.length, 2);

  unbindNativeGraph({ root, host, sessionId });
  const kept = getHostGraphPage(root, { host, sessionId });
  assert.equal(kept.retained, true); assert.equal(kept.enrolled, false);
  assert.deepEqual(kept.nodes, live.nodes);
  assert.equal(ingest('PreToolUse').state, 'not-enrolled');
  assert.equal(getHostGraphPage(root, { host, sessionId }).total, live.total, 'reading history never resumes recording');
  assert.deepEqual(nativeGraphObservations(root), [], 'a retained session is not an enrolled session');

  assert.throws(() => getHostGraphPage(root, { host, sessionId: randomUUID() }), /not enrolled/);
});
