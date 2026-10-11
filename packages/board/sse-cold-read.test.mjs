import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const fixture = fileURLToPath(new URL('./fixtures/fake-bd-controlled.mjs', import.meta.url));
const entry = process.env.TEST_SSE_MODULE || fileURLToPath(new URL('./lib/sse.mjs', import.meta.url));
async function setup(t, mode = 'hold') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-sse-read-'));
  const cwd = path.join(root, 'project');
  fs.mkdirSync(path.join(cwd, '.beads'), { recursive: true });
  process.env.GREAT_CTO_BD_BIN = fixture;
  process.env.FAKE_BD_CONTROL_ROOT = root;
  process.env.FAKE_BD_CONTROL_MODE = mode;
  const mod = await import(pathToFileURL(entry).href);
  const { sseClients, bdCache } = await import(new URL('./state.mjs', pathToFileURL(entry)).href);
  t.after(() => {
    sseClients.clear();bdCache.clear();
    for (const key of ['GREAT_CTO_BD_BIN','FAKE_BD_CONTROL_ROOT','FAKE_BD_CONTROL_MODE']) delete process.env[key];
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, cwd, sseClients, ...mod };
}
async function waitFor(fn) {
  const due = performance.now() + 5000;
  while (!fn() && performance.now() < due) await new Promise(r => setTimeout(r, 25));
  assert.ok(fn(), 'fixed fixture handshake deadline');
}
test('cold write broadcast leaves the loop free and publishes actual tasks only after read release', async t => {
  const f = await setup(t);
  const frames = [];
  const client = { _gctoCwd: f.cwd, write: msg => frames.push(msg) };
  f.sseClients.add(client);
  let settled = false;
  const pending = f.broadcastTasks(f.cwd).finally(() => { settled = true; });
  try {
    await waitFor(() => fs.existsSync(path.join(f.root, 'project.started')));
    assert.equal(settled, false);
    assert.deepEqual(frames, []);
    assert.equal(fs.existsSync(path.join(f.root, 'project.release')), false);
  } finally {
    fs.writeFileSync(path.join(f.root, 'project.release'), 'release');
    await pending;
  }
  assert.equal(frames.length, 1);
  assert.match(frames[0], /event: tasks\n/);
  assert.match(frames[0], /FIXTURE-1/);
});
test('with no matching subscriber broadcast does not start Beads', async t => {
  const f = await setup(t);
  f.sseClients.add({ _gctoCwd: path.join(f.root, 'elsewhere'), write: () => assert.fail('wrong project') });
  assert.deepEqual(await f.broadcastTasks(f.cwd), { ok: true, subscribers: 0 });
  assert.equal(fs.existsSync(path.join(f.root, 'project.started')), false);
});
test('failed initialized read emits unavailable state, never an empty tasks frame', async t => {
  const f = await setup(t, 'fail');
  const frames = [];
  f.sseClients.add({ _gctoCwd: f.cwd, write: msg => frames.push(msg) });
  assert.deepEqual(await f.broadcastTasks(f.cwd), { ok: false, state: 'unreadable' });
  assert.equal(frames.length, 1);
  assert.match(frames[0], /event: task-read-state\n/);
  assert.match(frames[0], /unreadable/);
  assert.doesNotMatch(frames[0], /event: tasks\n/);
});
test('disconnected or project-switched subscribers do not receive an in-flight snapshot', async t => {
  const f = await setup(t);
  const frames = [];
  const disconnected = { _gctoCwd: f.cwd, write: msg => frames.push(msg) };
  const switched = { _gctoCwd: f.cwd, write: msg => frames.push(msg) };
  f.sseClients.add(disconnected);f.sseClients.add(switched);
  const pending = f.broadcastTasks(f.cwd);
  try {
    await waitFor(() => fs.existsSync(path.join(f.root, 'project.started')));
    f.sseClients.delete(disconnected);
    switched._gctoCwd = path.join(f.root, 'another');
  } finally {
    fs.writeFileSync(path.join(f.root, 'project.release'), 'release');
    await pending;
  }
  assert.deepEqual(frames, []);
});
