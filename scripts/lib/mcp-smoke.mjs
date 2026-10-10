// Actual trusted CLI transport fixture. No tools/call or OS sandbox claim.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createOwnedPhaseFixture } from './owned-phase-fixture.mjs';

export async function runMcpSmoke({ cliPath }) {
  const cli = realpathSync(resolve(cliPath));
  const fixture = createOwnedPhaseFixture(), home = join(fixture.root, 'fixture-home');
  mkdirSync(home, { mode: 0o700 });
  const records = join(fixture.root, 'calls.json');
  writeFileSync(records, '[]');
  let child, closed, stream, reader, cleanupSafe = true;
  const env = { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC', CI: '1', DO_NOT_TRACK: '1',
    GREAT_CTO_HOME: join(fixture.root, 'state'), GREAT_CTO_UPDATE_CHECK_NO_SPAWN: '1' };
  try {
    child = spawn(process.execPath, ['--input-type=module', '-e', `
      import os from 'node:os';import cp from 'node:child_process';
      import http from 'node:http';import https from 'node:https';
      import {syncBuiltinESMExports} from 'node:module';import{readFileSync,writeFileSync}from'node:fs';
      const records=${JSON.stringify(records)};
      const refuse=kind=>{const r=JSON.parse(readFileSync(records,'utf8'));r.push(kind);writeFileSync(records,JSON.stringify(r));throw Error('MCP fixture refused '+kind);};
      os.homedir=()=>${JSON.stringify(home)};
      cp.spawn=cp.spawnSync=cp.exec=cp.execFile=cp.execSync=cp.execFileSync=cp.fork=()=>refuse('subprocess');
      globalThis.fetch=async()=>refuse('outbound network');http.get=http.request=https.get=https.request=()=>refuse('outbound network');
      const create=http.createServer;
      http.createServer=(...args)=>{
        const s=create(...args), listen=s.listen;
        s.listen=(...bind)=>{if(bind[0]!==0||bind[1]!=='127.0.0.1')return refuse('non-ephemeral loopback bind');return listen.apply(s,bind);};
        s.once('listening',()=>{const a=s.address();process.send({kind:'owned-http-listener',port:a.port,address:a.address});});return s;
      };
      syncBuiltinESMExports();
      process.argv=[process.execPath,${JSON.stringify(cli)},'mcp','--sse','--port','0'];
      await import(${JSON.stringify(pathToFileURL(cli).href)});
    `], { cwd: fixture.root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    closed = new Promise(resolveClose => child.once('close', resolveClose));
    let output = '', timer;
    const listener = await new Promise((ready, reject) => {
      timer = setTimeout(() => reject(new Error('MCP owned listener readiness timeout')), 10000);
      child.once('error', reject);
      child.once('close', () => reject(new Error(`MCP exited before owned listener: ${output.slice(-1000)}`)));
      child.once('message', ready);
      for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => {
        output += chunk; if (output.length > 65536) reject(new Error('MCP output limit'));
      });
    }).finally(() => clearTimeout(timer));
    assert.equal(listener.kind, 'owned-http-listener');
    assert.equal(listener.address, '127.0.0.1');
    assert.ok(Number.isInteger(listener.port) && listener.port > 0 && listener.port <= 65535);
    const base = `http://127.0.0.1:${listener.port}`;
    const health = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3000) });
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true); assert.equal(body.transport, 'sse'); assert.equal(body.sessions, 0);
    assert.match(body.version, /^\d+\.\d+\.\d+/);
    stream = new AbortController();
    const headerDeadline = setTimeout(() => stream.abort(), 3000);
    let response;
    try { response = await fetch(`${base}/sse`, { signal: stream.signal }); }
    finally { clearTimeout(headerDeadline); }
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/event-stream/);
    reader = response.body.getReader();
    let buffer = '';
    const event = async () => {
      let deadline;
      try {
        return await Promise.race([(async () => {
          while (!buffer.includes('\n\n')) {
            const chunk = await reader.read(); assert.equal(chunk.done, false, 'SSE must remain open');
            buffer += new TextDecoder().decode(chunk.value);
            assert.ok(buffer.length <= 65536, 'SSE buffer limit');
          }
          const at = buffer.indexOf('\n\n'), packet = buffer.slice(0, at); buffer = buffer.slice(at + 2);
          return packet;
        })(), new Promise((_, reject) => { deadline = setTimeout(() => { stream.abort(); reject(new Error('MCP SSE event timeout')); }, 3000); })]);
      } finally { clearTimeout(deadline); }
    };
    const endpoint = await event();
    assert.match(endpoint, /^event: endpoint\ndata: \/message\?sessionId=[a-zA-Z0-9-]+$/);
    const path = endpoint.split('\ndata: ')[1];
    const rpc = async (id, method, params = {}) => {
      const sent = await fetch(`${base}${path}`, { method: 'POST', signal: AbortSignal.timeout(3000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
      assert.equal(sent.status, 202);
      const packet = await event(); assert.ok(packet.startsWith('event: message\ndata: '));
      const reply = JSON.parse(packet.slice('event: message\ndata: '.length));
      assert.equal(reply.id, id); assert.equal(reply.jsonrpc, '2.0'); assert.equal(reply.error, undefined);
      return reply.result;
    };
    const init = await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } });
    assert.equal(init.protocolVersion, '2024-11-05'); assert.equal(init.serverInfo.name, 'great-cto');
    const inventory = await rpc(2, 'tools/list');
    assert.equal(inventory.tools.length, 7);
    assert.ok(inventory.tools.some(tool => tool.name === 'detect_archetype'));
    assert.deepEqual(JSON.parse(readFileSync(records, 'utf8')), [], 'unexpected process/network attempt');
    return { ownedListenerVerified: true, transport: 'sse', protocolVersion: init.protocolVersion,
      toolsListed: inventory.tools.length, toolCalls: 0, providerCalls: 0 };
  } finally {
    stream?.abort();
    if (reader) await reader.cancel().catch(() => {});
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); let timer;
      const stopped = await Promise.race([closed.then(() => true), new Promise(r => { timer = setTimeout(() => r(false), 2000); })]);
      clearTimeout(timer);
      if (!stopped) {
        child.kill('SIGKILL'); cleanupSafe = false;
        let forcedTimer;
        await Promise.race([closed, new Promise(r => { forcedTimer = setTimeout(r, 2000); })]);
        clearTimeout(forcedTimer);
        throw new Error(`MCP fixture required forced cleanup; root retained: ${fixture.root}`);
      }
    }
    if (cleanupSafe) fixture.cleanup();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runMcpSmoke({ cliPath: process.argv[2] }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
