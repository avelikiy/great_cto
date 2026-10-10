import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const configUrl = new URL('../dist/webhook-config.js', import.meta.url).href;
const dispatchUrl = new URL('../dist/webhook-dispatch.js', import.meta.url).href;
const serveUrl = new URL('../dist/serve.js', import.meta.url).href;
const cliPath = new URL('../index.mjs', import.meta.url);

// Stub only the child process's builtin home lookup. Never change HOME or touch
// the operator's state. The ambient fixture contains a live-trigger-shaped hook.
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'great-cto-webhook-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ambient = join(root, 'ambient');
  mkdirSync(join(ambient, '.great_cto'), { recursive: true });
  const config = join(ambient, '.great_cto', 'webhooks.json');
  const bytes = JSON.stringify({ incoming: [], outgoing: [{
    name: 'ambient-do-not-send', url: 'http://127.0.0.1:1/',
    format: 'generic', triggers: ['pr.opened'],
  }] });
  writeFileSync(config, bytes);
  writeFileSync(`${config}.gctest-bak`, 'preexisting backup');
  const prefix = `import os from 'node:os'; import {syncBuiltinESMExports} from 'node:module';
    os.homedir = () => ${JSON.stringify(ambient)}; syncBuiltinESMExports();`;
  const hmacKey = randomBytes(32).toString('hex');
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C', TZ: 'UTC', CI: '1', DO_NOT_TRACK: '1',
    GREAT_CTO_HOME: join(root, 'isolated'), GREAT_CTO_UPDATE_CHECK_NO_SPAWN: '1', GREAT_CTO_FIXTURE_HMAC_KEY: hmacKey };
  const unchanged = () => {
    assert.equal(readFileSync(config, 'utf8'), bytes);
    assert.equal(readFileSync(`${config}.gctest-bak`, 'utf8'), 'preexisting backup');
    assert.equal(existsSync(join(ambient, '.great_cto', 'webhook-events.log')), false);
    assert.equal(existsSync(join(ambient, '.great_cto', 'webhook-dlq.log')), false);
  };
  return { root, ambient, prefix, env, unchanged, hmacKey };
}

test('webhook config and DLQ use the dedicated namespace, not ambient hooks', t => {
  const f = fixture(t);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `${f.prefix}
    process.umask(0);
    const c = await import(${JSON.stringify(configUrl)});
    const d = await import(${JSON.stringify(dispatchUrl)});
    c.addIncoming({name:'github',secret:process.env.GREAT_CTO_FIXTURE_HMAC_KEY});
    console.log(JSON.stringify({config:c.getConfigPath(), dlq:d.getDlqPath(), fired:d.dispatch({name:'pr.opened',title:'fixture'}).fired, value:c.loadConfig()}));
  `], { env: f.env, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.config, join(f.env.GREAT_CTO_HOME, 'webhooks.json'));
  assert.equal(result.dlq, join(f.env.GREAT_CTO_HOME, 'webhook-dlq.log'));
  assert.equal(result.fired, 0);
  assert.deepEqual(result.value.outgoing, []);
  assert.equal(result.value.incoming[0].name, 'github');
  assert.equal(statSync(result.config).mode & 0o777, 0o600);
  assert.equal(statSync(f.env.GREAT_CTO_HOME).mode & 0o777, 0o700);
  f.unchanged();
});

test('unset and empty namespace preserve the normal default', t => {
  const f = fixture(t);
  for (const value of [undefined, '']) {
    const env = { ...f.env };
    if (value === undefined) delete env.GREAT_CTO_HOME;
    else env.GREAT_CTO_HOME = value;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `${f.prefix}
      const c = await import(${JSON.stringify(configUrl)});
      const d = await import(${JSON.stringify(dispatchUrl)});
      console.log(JSON.stringify([c.getConfigPath(), d.getDlqPath()]));
    `], { env, encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [join(f.ambient, '.great_cto', 'webhooks.json'), join(f.ambient, '.great_cto', 'webhook-dlq.log')]);
  }
  f.unchanged();
});

test('corrupt webhook config refuses mutations without replacing original bytes', t => {
  const f = fixture(t), file = join(f.env.GREAT_CTO_HOME, 'webhooks.json');
  mkdirSync(f.env.GREAT_CTO_HOME, { recursive: true });
  for (const bytes of ['{broken', 'null', '{"incoming":{}}']) {
    writeFileSync(file, bytes);
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const c = await import(${JSON.stringify(configUrl)});
      c.addIncoming({name:'new'});
    `], { env: f.env, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(file, 'utf8'), bytes);
  }
  f.unchanged();
});

test('actual CLI add/list/remove use the dedicated config namespace', t => {
  const f = fixture(t);
  const run = args => {
    const r = spawnSync(process.execPath, [cliPath.pathname, 'webhook', ...args], {
      env: f.env, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout + r.stderr;
  };
  run(['add-incoming', 'github', '--secret', f.hmacKey]);
  assert.ok(run(['list']).includes(join(f.env.GREAT_CTO_HOME, 'webhooks.json')));
  const file = join(f.env.GREAT_CTO_HOME, 'webhooks.json');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).incoming[0].name, 'github');
  run(['remove', 'github']);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { incoming: [], outgoing: [] });
  f.unchanged();
});

test('failed fixture deliveries write only the isolated DLQ', t => {
  const f = fixture(t);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `${f.prefix}
    process.umask(0);
    const c = await import(${JSON.stringify(configUrl)});
    const d = await import(${JSON.stringify(dispatchUrl)});
    globalThis.fetch = async () => { throw new Error('fixture refusal'); };
    globalThis.setTimeout = callback => { queueMicrotask(callback); return 0; };
    c.addOutgoing({name:'fixture',url:'http://127.0.0.1:1/',format:'generic',triggers:['pr.opened']});
    d.dispatch({name:'pr.opened',title:'fixture'});
  `], { env: f.env, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(statSync(join(f.env.GREAT_CTO_HOME, 'webhook-dlq.log')).mode & 0o777, 0o600);
  const entry = JSON.parse(readFileSync(join(f.env.GREAT_CTO_HOME, 'webhook-dlq.log'), 'utf8'));
  assert.equal(entry.hook, 'fixture');
  assert.equal(entry.error, 'fixture refusal');
  f.unchanged();
});

test('all CLI state consumers refuse relative namespaces before filesystem writes', t => {
  const f = fixture(t);
  for (const name of ['webhook-config.js', 'webhook-dispatch.js', 'serve.js', 'task-queue.js', 'worker.js', 'update-check.js']) {
    const url = new URL(`../dist/${name}`, import.meta.url).href;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const m = await import(${JSON.stringify(url)});
      if (m.cachePath) m.cachePath();
    `], { cwd: f.root, env: { ...f.env, GREAT_CTO_HOME: 'relative-state' }, encoding: 'utf8', timeout: 5000 });
    assert.notEqual(r.status, 0, name);
    assert.match(r.stderr, /GREAT_CTO_HOME must be an absolute/, name);
    assert.equal(existsSync(join(f.root, 'relative-state')), false);
  }
  f.unchanged();
});

test('real HTTP signature refusal and acceptance cannot dispatch ambient hooks', { timeout: 15000 }, async t => {
  const f = fixture(t);
  const child = spawn(process.execPath, ['--input-type=module', '-e', `${f.prefix}
    const c = await import(${JSON.stringify(configUrl)});
    c.addIncoming({name:'github',secret:process.env.GREAT_CTO_FIXTURE_HMAC_KEY});
    const {runServe} = await import(${JSON.stringify(serveUrl)});
    process.exit(await runServe({port:0,noLog:false,insecure:false}));
  `], { env: f.env, stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = once(child, 'exit');
  let log = '';
  const ready = new Promise((resolve, reject) => {
    child.stderr.on('data', chunk => {
      log += chunk;
      const match = log.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`receiver exited before readiness: ${log}`)));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
  });
  const port = await ready;
  assert.ok(port > 0);
  const url = `http://127.0.0.1:${port}`;
  const body = JSON.stringify({action:'opened',number:1,repository:{full_name:'fixture/repo'}});
  const headers = {'Content-Type':'application/json','X-GitHub-Event':'pull_request','X-Hub-Signature-256':'sha256=bad'};
  assert.equal((await fetch(`${url}/webhook/github`, {method:'POST',headers,body})).status, 401);
  assert.deepEqual(await (await fetch(`${url}/events`)).json(), {events:[]});
  headers['X-Hub-Signature-256'] = `sha256=${createHmac('sha256',f.hmacKey).update(body).digest('hex')}`;
  const response = await fetch(`${url}/webhook/github`, {method:'POST',headers,body});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).dispatched_to, 0);
  const events = await (await fetch(`${url}/events`)).json();
  assert.equal(events.events.length, 1);
  assert.equal(events.events[0].action_taken, 'logged');
  assert.equal(existsSync(join(f.env.GREAT_CTO_HOME, 'webhook-events.log')), true);
  assert.deepEqual(await (await fetch(`${url}/dlq`)).json(), {dlq:[]});
  f.unchanged();
});
