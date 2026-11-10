// ADR-047 section 3: a workspace's board refuses a taken port. Deferring is right
// on 3141 and wrong here, where the board already listening is another workspace's.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-port-'));
const blocker = net.createServer();
await new Promise((ok) => { blocker.listen(0, '127.0.0.1', ok); });
const { port } = blocker.address();
after(() => { blocker.close(); fs.rmSync(home, { recursive: true, force: true }); });

function start(extra) {
  const env = { ...process.env, HOME: home, GREAT_CTO_HOST: '127.0.0.1', ...extra };
  delete env.GREAT_CTO_WORKSPACE_PORT;
  Object.assign(env, extra);
  const child = spawn(process.execPath, [SERVER, '--port', String(port), '--no-open'], { cwd: home, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  return new Promise((ok) => { child.on('exit', (code) => ok({ code, stderr })); });
}

test('under a workspace port a taken port is a failure, with the reason', async () => {
  const r = await start({ GREAT_CTO_WORKSPACE_PORT: String(port) });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Not attaching to another board/);
});

test('outside a workspace it still defers, as the main board always has', async () => {
  assert.equal((await start({})).code, 0);
});
