import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const server = process.env.TEST_BOARD_SERVER || fileURLToPath(new URL('./server.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/fake-bd-controlled.mjs', import.meta.url));
async function waitFor(fn) {
  const end = performance.now() + 5000;
  while (!fn() && performance.now() < end) await new Promise(r => setTimeout(r, 25));
  assert.ok(fn(), 'fixture did not reach its handshake before fixed deadline');
}
test('cold task HTTP read waits for real data while version and HTML still answer', { timeout: 15000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-http-cold-'));
  const cwd = path.join(root, 'selected'), other = path.join(root, 'other');
  const state = path.join(root, 'state');
  for (const dir of [cwd, other]) {
    fs.mkdirSync(path.join(dir, '.beads'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.great_cto'));
    fs.writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), 'archetype: devtools\n');
  }
  fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, 'projects.json'), JSON.stringify({ projects: [
    { slug: 'selected', path: cwd }, { slug: 'other', path: other }
  ] }));
  const socket = net.createServer();socket.listen(0, '127.0.0.1');await once(socket, 'listening');
  const port = socket.address().port;await new Promise(r => socket.close(r));
  fs.writeFileSync(path.join(root, 'selected.release'), 'release');
  const child = spawn(process.execPath, [server, '--no-open', '--port', String(port)], {
    cwd, env: { ...process.env, GREAT_CTO_HOME: state, GREAT_CTO_DISCOVERY_ROOT: root,
      GREAT_CTO_BD_BIN: fixture, FAKE_BD_CONTROL_ROOT: root, FAKE_BD_CONTROL_MODE: 'hold', GREAT_CTO_NO_UPDATE_CHECK: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';child.stdout.on('data', d => output += d);child.stderr.on('data', d => output += d);
  let pending;
  try {
    await waitFor(() => /task cache warmed/.test(output));
    let settled = false;
    pending = fetch(`http://127.0.0.1:${port}/api/tasks?project=other`, { signal: AbortSignal.timeout(10000) })
      .then(async r => ({ status: r.status, tasks: await r.json() })).finally(() => { settled = true; });
    // Observe the actual read subprocess before asking unrelated HTTP endpoints.
    await waitFor(() => fs.existsSync(path.join(root, 'other.started')));
    assert.equal(settled, false);
    const inboxResponse = await fetch(`http://127.0.0.1:${port}/api/inbox`, { signal: AbortSignal.timeout(1500) });
    assert.equal(inboxResponse.status, 200);
    const inbox = await inboxResponse.json();
    assert.deepEqual(inbox.elsewhere.unreadable, ['other']);
    assert.equal(inbox.elsewhere.p0, 0, 'pending project is excluded, not asserted empty');
    for (const route of ['/api/version', '/']) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(1500) });
      assert.equal(res.status, 200);
      await res.text();
    }
    assert.equal(fs.existsSync(path.join(root, 'other.release')), false);
    fs.writeFileSync(path.join(root, 'other.release'), 'release');
    const result = await pending;
    assert.equal(result.status, 200);
    assert.equal(result.tasks[0].id, 'FIXTURE-1');
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    fs.writeFileSync(path.join(root, 'other.release'), 'release');
    if (pending) await pending.catch(() => {});
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 1000);await exited;clearTimeout(kill);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
