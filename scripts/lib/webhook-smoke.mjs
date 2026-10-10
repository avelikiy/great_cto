// Test harness only. Refuse incompatible artifacts before any CLI mutation.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { once } from 'node:events';

export async function runWebhookSmoke({ cliPath, signature = 'valid' }) {
  assert.ok(['valid', 'invalid'].includes(signature), 'unknown signature fixture');
  const cli = realpathSync(resolve(cliPath));
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'great-cto-webhook-smoke-')));
  const state = join(root, 'state');
  // Do not inherit NODE_OPTIONS, insecure mode, telemetry, or update settings.
  // HOME/CODEX_HOME are not repurposed. Only dedicated state is overridden.
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C', TZ: 'UTC',
    GREAT_CTO_HOME: state, GREAT_CTO_UPDATE_CHECK_NO_SPAWN: '1',
    CI: '1', DO_NOT_TRACK: '1',
  };
  let child, exitPromise;
  const command = args => {
    const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
    assert.equal(r.status, 0, `fixture CLI failed: ${r.stderr}`);
    return r;
  };
  try {
    const dist = join(dirname(cli), 'dist');
    const url = name => pathToFileURL(join(dist, name)).href;
    const preflight = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const c = await import(${JSON.stringify(url('webhook-config.js'))});
      const d = await import(${JSON.stringify(url('webhook-dispatch.js'))});
      const s = await import(${JSON.stringify(url('serve.js'))});
      console.log(JSON.stringify([c.getConfigPath(),d.getDlqPath(),s.getEventsLogPath()]));
    `], { cwd: root, env, encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
    let paths;
    try { paths = JSON.parse(preflight.stdout); } catch { /* refuse */ }
    const expected = ['webhooks.json', 'webhook-dlq.log', 'webhook-events.log'].map(name => join(state, name));
    if (preflight.status !== 0 || JSON.stringify(paths) !== JSON.stringify(expected)) {
      const error = new Error('NOT CHECKED: artifact lacks isolated webhook config/events/DLQ support; no mutation or server launch');
      error.code = 'WEBHOOK_SMOKE_ISOLATION_UNSUPPORTED';
      throw error;
    }
    command(['webhook', 'add-incoming', 'github', '--secret', 'fixture-secret']);
    const config = JSON.parse(readFileSync(expected[0], 'utf8'));
    assert.deepEqual(config.outgoing, [], 'fixture must not contain outgoing hooks');
    child = spawn(process.execPath, [cli, 'serve', '--port', '0'], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
    exitPromise = once(child, 'exit');
    let log = '', timer;
    const port = await new Promise((resolveReady, reject) => {
      timer = setTimeout(() => reject(new Error('fixture receiver readiness timeout')), 10000);
      child.once('error', reject);
      child.once('exit', () => reject(new Error('fixture receiver exited before readiness')));
      child.stderr.on('data', chunk => {
        log += chunk;
        if (log.length > 65536) return reject(new Error('fixture receiver output limit'));
        const match = log.match(/http:\/\/localhost:(\d+)/);
        if (match && Number(match[1]) > 0) resolveReady(Number(match[1]));
      });
    }).finally(() => clearTimeout(timer));
    const urlBase = `http://127.0.0.1:${port}`;
    const payload = JSON.stringify({ action: 'opened', number: 1, repository: { full_name: 'fixture/repo' } });
    const digest = signature === 'valid' ? createHmac('sha256', 'fixture-secret').update(payload).digest('hex') : 'bad';
    const response = await fetch(`${urlBase}/webhook/github`, {
      method: 'POST', signal: AbortSignal.timeout(3000), body: payload,
      headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'pull_request', 'X-Hub-Signature-256': `sha256=${digest}` },
    });
    assert.equal(response.status, signature === 'valid' ? 200 : 401);
    const body = await response.json();
    if (signature === 'valid') assert.equal(body.dispatched_to, 0);
    const events = await (await fetch(`${urlBase}/events`, { signal: AbortSignal.timeout(3000) })).json();
    assert.equal(events.events.length, signature === 'valid' ? 1 : 0);
    const dlq = await (await fetch(`${urlBase}/dlq`, { signal: AbortSignal.timeout(3000) })).json();
    assert.deepEqual(dlq, { dlq: [] });
    return { signature, status: response.status, dispatchedTo: signature === 'valid' ? body.dispatched_to : null, isolated: true };
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      let timer;
      const stopped = await Promise.race([exitPromise.then(() => true), new Promise(r => { timer = setTimeout(() => r(false), 2000); })]);
      clearTimeout(timer);
      if (!stopped) {
        // Only the child launched above, never a port owner or process group.
        child.kill('SIGKILL');
        await exitPromise;
        rmSync(root, { recursive: true, force: true });
        throw new Error('fixture receiver required forced cleanup; smoke not passed');
      }
    }
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runWebhookSmoke({ cliPath: process.argv[2], signature: process.argv[3] });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.code === 'WEBHOOK_SMOKE_ISOLATION_UNSUPPORTED' ? 77 : 1;
  }
}
