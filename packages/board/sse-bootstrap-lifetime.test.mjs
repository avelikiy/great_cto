import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

async function waitFor(fn) {
  const due = performance.now() + 5000;
  while (!fn() && performance.now() < due) await new Promise(r => setTimeout(r, 25));
  assert.ok(fn(), 'fixed handshake deadline');
}
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-sse-bootstrap-'));
  const cwd = path.join(root, 'project');
  fs.mkdirSync(path.join(cwd, '.beads'), { recursive: true });
  const state = path.join(root, 'state');fs.mkdirSync(state);
  process.env.GREAT_CTO_HOME = state;
  process.env.GREAT_CTO_BD_BIN = fileURLToPath(new URL('./fixtures/fake-bd-controlled.mjs', import.meta.url));
  process.env.FAKE_BD_CONTROL_ROOT = root;
  process.env.FAKE_BD_CONTROL_MODE = 'hold';
  const { dispatch } = await import('./lib/routes.mjs');
  const beads = await import('./lib/beads.mjs');
  const { bdCache, sseClients } = await import('./lib/state.mjs');
  let response, completed = false, writes = 0;
  const server = http.createServer(async (req, res) => {
    response = res;
    const write = res.write.bind(res);res.write = (...args) => { writes++;return write(...args); };
    try { await dispatch(req, res, new URL(req.url, 'http://localhost'), cwd); }
    finally { completed = true; }
  });
  server.listen(0, '127.0.0.1');await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();await new Promise(r => server.close(r));
    sseClients.clear();bdCache.clear();
    for (const key of ['GREAT_CTO_HOME', 'GREAT_CTO_BD_BIN', 'FAKE_BD_CONTROL_ROOT', 'FAKE_BD_CONTROL_MODE']) delete process.env[key];
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, cwd, ...beads, bdCache, sseClients, port: server.address().port,
    response: () => response, completed: () => completed, writes: () => writes };
}
test('SSE reconnect preserves unreadable warm cache instead of claiming recovery', async t => {
  const f = await setup(t);
  fs.writeFileSync(path.join(f.root, 'project.release'), 'release');
  assert.equal((await f.getTasksAsync(f.cwd))[0].id, 'FIXTURE-1');
  process.env.FAKE_BD_CONTROL_MODE = 'fail';
  assert.equal((await f.warmTasksAsync(f.cwd)).ok, false);
  assert.ok(f.getReadDegradation(f.cwd));
  let request;
  try {
    const frame = await new Promise((resolve, reject) => {
      request = http.get({ host: '127.0.0.1', port: f.port, path: '/api/sse' }, res => {
        assert.equal(res.statusCode, 200);res.once('data', data => resolve(data.toString()));
      });
      request.on('error', reject);
    });
    assert.match(frame, /event: task-read-state/);
    assert.match(frame, /"state":"unreadable"/);
    assert.doesNotMatch(frame, /event: tasks\n/);
    assert.ok(f.getReadDegradation(f.cwd));
  } finally { request?.destroy(); }
  await waitFor(() => f.sseClients.size === 0);
});
test('real SSE socket closed during cold read never becomes a subscriber', async t => {
  const f = await setup(t);
  const request = http.get({ host: '127.0.0.1', port: f.port, path: '/api/sse' });
  request.on('error', () => {}); // expected client-side cancellation
  try {
    await waitFor(() => fs.existsSync(path.join(f.root, 'project.started')));
    request.destroy();
    await waitFor(() => f.response()?.destroyed);
  } finally { fs.writeFileSync(path.join(f.root, 'project.release'), 'release'); }
  await waitFor(f.completed);
  assert.equal(f.sseClients.size, 0);
  assert.equal(f.writes(), 0);
  assert.equal(f.response().headersSent, false);
});
