import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function waitFor(fn) {
  const due = performance.now() + 5000;
  while (!fn() && performance.now() < due) await new Promise(r => setTimeout(r, 25));
  assert.ok(fn(), 'fixed watcher/read handshake deadline');
}
test('registered Beads watcher waits off-loop for fresh tasks and shares the resulting projections', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-watcher-read-'));
  const cwd = path.join(root, 'project'), state = path.join(root, 'state');
  fs.mkdirSync(path.join(cwd, '.beads'), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.great_cto'));
  fs.writeFileSync(path.join(cwd, '.great_cto', 'PROJECT.md'), 'archetype: devtools\n');
  fs.mkdirSync(state);
  const registry = path.join(state, 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: 'project', path: cwd }] }));
  const vars = { GREAT_CTO_HOME: state, GREAT_CTO_PROJECTS_FILE: registry, GREAT_CTO_DISCOVERY_ROOT: root,
    GREAT_CTO_BD_BIN: fileURLToPath(new URL('./fixtures/fake-bd-controlled.mjs', import.meta.url)),
    FAKE_BD_CONTROL_ROOT: root, FAKE_BD_CONTROL_MODE: 'hold' };
  const old = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  const originalWatch = fs.watch, callbacks = new Map();
  // Capture real registrations, then drive the actual callback deterministically.
  // OS fs.watch timing is not the property under test; the read child is real.
  fs.watch = (target, ...args) => { callbacks.set(String(target), args.at(-1));return { unref() {} }; };
  const { watchBeads } = await import('./lib/watchers.mjs');
  const { bdCache, sseClients } = await import('./lib/state.mjs');
  t.after(() => {
    fs.watch = originalWatch;sseClients.clear();bdCache.clear();
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const frames = [];
  sseClients.add({ _gctoCwd: cwd, write: msg => frames.push(msg) });
  bdCache.set(cwd, { ts: Date.now(), data: [{ id: 'OLD-1', title: 'Old', status: 'open' }] });
  watchBeads();fs.watch = originalWatch;
  const onChange = callbacks.get(path.join(cwd, '.beads'));
  assert.equal(typeof onChange, 'function', 'registered selected project directory');
  onChange('change', 'manifest');
  try {
    await waitFor(() => fs.existsSync(path.join(root, 'project.started')));
    assert.deepEqual(frames, [], 'no premature stale projection');
  } finally {
    fs.writeFileSync(path.join(root, 'project.release'), 'release');
  }
  await waitFor(() => frames.length > 0);
  assert.equal(frames.length, 1);
  assert.match(frames[0], /FIXTURE-1/);
  assert.match(frames[0], /event: pipeline\n/);
  assert.match(frames[0], /event: inbox\n/);
  assert.doesNotMatch(frames[0], /OLD-1/);
});
