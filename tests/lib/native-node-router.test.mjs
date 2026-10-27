import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { ROUTER_TOOLS, ROUTER_INFO, MAX_WIRE_BYTES, nativeRouterConfig, createNativeRouter, serveNativeRouter, writeRouterReply } from '../../mcp-servers/llm-router/server-native.mjs';
const entry = fileURLToPath(new URL('../../mcp-servers/llm-router/server-native.mjs', import.meta.url));
const frozen = JSON.parse(readFileSync(new URL('../fixtures/native-node-router-wire.json', import.meta.url)));
const key = 'fixture-router-key';
const env = { OPENROUTER_API_KEY: key };
const call = (name, args = {}, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const content = r => r.result.content[0].text;
const provider = (text = 'fixture answer', usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }) => ({ choices: [{ message: { content: text } }], usage });
async function server(t, handler) {
 const sockets = new Set(); const s = createServer(handler); s.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
 await new Promise((yes, no) => { s.once('error', no); s.listen(0, '127.0.0.1', yes); });
 t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(r => s.close(r)); });
 return 'http://127.0.0.1:' + s.address().port;
}
async function child(t, input, { home, cwd = home, environment = {} } = {}) {
 const root = home || mkdtempSync(join(tmpdir(), 'native-router-test-'));
 if (!home) t.after(() => rmSync(root, { recursive: true, force: true }));
 const p = spawn(process.execPath, [entry], { cwd: cwd || root, env: { PATH: '/usr/bin:/bin', HOME: root, ...environment }, stdio: ['pipe', 'pipe', 'pipe'] });
 let out = '', err = ''; p.stdout.on('data', x => { out += x; }); p.stderr.on('data', x => { err += x; });
 const complete = new Promise((yes, no) => { p.once('error', no); p.once('close', code => yes({ code, out, err })); });
 t.after(() => { if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); });
 p.stdin.end(input); return complete;
}

test('names, schemas and protocol metadata match the frozen legacy wire source', () => {
 assert.deepEqual(ROUTER_TOOLS.map(({ name, inputSchema }) => ({ name, inputSchema })), frozen.tools.map(({ name, inputSchema }) => ({ name, inputSchema }))); assert.deepEqual(ROUTER_INFO, frozen.serverInfo);
 const source = readFileSync(new URL('../../mcp-servers/llm-router/server.py', import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'), frozen.sourceSha256);
});
test('id0, notifications, unknown method and startup do not contact a provider', async () => {
 const router = createNativeRouter({ fetchImpl: () => { throw Error('unexpected provider call'); } });
 const reply = await router.handle({ id: 0, method: 'initialize' }); assert.equal(reply.id, 0); assert.equal(reply.result.protocolVersion, frozen.protocolVersion);
 assert.equal(await router.handle({ method: 'tools/list' }), null);
 assert.deepEqual((await router.handle({ id: 2, method: 'tools/list' })).result.tools.map(({ name, inputSchema }) => ({ name, inputSchema })), frozen.tools.map(({ name, inputSchema }) => ({ name, inputSchema }))); 
 assert.equal((await router.handle({ id: 3, method: 'unknown' })).error.code, -32000);
 assert.equal(JSON.parse(content(await router.handle(call('router_status')))).configured, false);
 assert.match(content(await router.handle(call('ask_kimi', { task: 'inert' }))), /OPENROUTER_API_KEY not set/);
});
test('env-only mode does not expose credential tails', async () => {
 const r = await createNativeRouter({ environment: env }).handle(call('router_status'));
 assert.deepEqual(JSON.parse(content(r)), { configured: true, model: 'moonshotai/kimi-k2-0905', mode: 'native-env-only' });
 assert(!JSON.stringify(r).includes(key)); assert(!JSON.stringify(r).includes(key.slice(-6)));
});
test('real stdio drains output larger than8192bytes and ignores project/home dotenv authority', { timeout: 15000 }, async t => {
 const root = mkdtempSync(join(tmpdir(), 'native-router-dotenv-')); t.after(() => rmSync(root, { recursive: true, force: true }));
 mkdirSync(join(root, '.great_cto')); writeFileSync(join(root, '.env.local'), 'OPENROUTER_API_KEY=fixture-project-key\n'); writeFileSync(join(root, '.great_cto/secrets.env'), 'OPENROUTER_API_KEY=fixture-home-key\n');
 const requests = [{ id: 0, method: 'initialize' }, ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, method: 'tools/list' })), call('router_status', {}, 22), call('ask_kimi', { task: 'inert' }, 23)];
 const reply = await child(t, requests.map(x => JSON.stringify(x)).join('\n') + '\n', { home: root }); assert.equal(reply.code, 0, reply.err); assert(reply.out.length > 8192);
 const rows = reply.out.trim().split('\n').map(x => JSON.parse(x)); assert.equal(rows.length, requests.length); assert.equal(rows[0].id, 0);
 assert.equal(JSON.parse(content(rows.at(-2))).configured, false); assert.match(content(rows.at(-1)), /OPENROUTER_API_KEY not set/);
 assert.equal(readFileSync(join(root, '.env.local'), 'utf8'), 'OPENROUTER_API_KEY=fixture-project-key\n'); assert(!reply.out.includes('fixture-home-key'));
});
test('config values are validated without blocking startup or leaking values', async () => {
 for (const patch of [{ GREAT_CTO_ROUTER_MAX_TOKENS: '-1' }, { GREAT_CTO_ROUTER_MAX_TOKENS: '1048577' }, { GREAT_CTO_ROUTER_TIMEOUT: '0' }, { GREAT_CTO_ROUTER_TIMEOUT: '181' }, { GREAT_CTO_ROUTER_TEMPERATURE: 'NaN' }, { OPENROUTER_API_KEY: 'short' }, { OPENROUTER_API_KEY: 'non-ascii-🔑-fixture' }]) {
  const router = createNativeRouter({ environment: { ...env, ...patch } }); assert((await router.handle({ id: 0, method: 'initialize' })).result);
  assert.equal((await router.handle(call('router_status'))).error.message, 'router configuration refused');
 }
 assert.deepEqual(nativeRouterConfig({}), { key: '', model: 'moonshotai/kimi-k2-0905', maxTokens: 4096, temperature: 0, timeoutMs: 60000 });
});
test('invalid tool arguments and oversized requests refuse before transport', async () => {
 let calls = 0; const router = createNativeRouter({ environment: env, fetchImpl: () => { calls++; throw Error('unexpected'); } });
 for (const args of [{}, { task: ' ' }, { task: 7 }, { task: 'x', context: 7 }, { task: 'x', system: {} }, { task: 'x'.repeat(MAX_WIRE_BYTES) }]) assert.match(content(await router.handle(call('ask_kimi', args))), /fallback/);
 assert.equal(calls, 0);
});
test('local HTTP success preserves request shape, redacts keys and emits content-free usage', { timeout: 15000 }, async t => {
 let observed, record; const endpoint = await server(t, (req, res) => { let raw = ''; req.on('data', x => raw += x); req.on('end', () => { observed = { method: req.method, auth: req.headers.authorization, body: JSON.parse(raw) }; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(provider('answer ' + key))); }); });
 const router = createNativeRouter({ environment: env, fetchImpl: (url, options) => { assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions'); return fetch(endpoint, options); }, recordUsage: row => { record = row; } });
 const r = await router.handle(call('ask_kimi', { task: 'question', context: 'private fixture context' }));
 assert.match(content(r), /tokens=5/); assert.match(content(r), /answer \[redacted\]/); assert(!JSON.stringify(r).includes(key));
 assert.equal(observed.method, 'POST'); assert.equal(observed.auth, 'Bearer ' + key); assert.equal(observed.body.temperature, 0); assert.equal(observed.body.max_tokens, 4096);
 assert.equal(observed.body.messages[1].content, 'question\n\n--- CONTEXT ---\nprivate fixture context'); assert.equal(record.total_tokens, 5);
 assert(!JSON.stringify(record).includes('question')); assert(!JSON.stringify(record).includes(key)); assert.equal(r.result._meta.usageAccounting, 'callback-completed-not-attested');
});
test('provider HTTP error bodies never reach caller or usage callback', async () => {
 let callbacks = 0; const router = createNativeRouter({ environment: env, fetchImpl: async () => new Response('private body ' + key, { status: 401 }), recordUsage: () => { callbacks++; } });
 const r = await router.handle(call('ask_kimi', { task: 'inert' })); assert.match(content(r), /provider HTTP 401/); assert(!JSON.stringify(r).includes(key)); assert(!JSON.stringify(r).includes('private body')); assert.equal(callbacks, 0);
});
test('invalid JSON, content and usage are refused without success text', async () => {
 const values = ['not-json', JSON.stringify({ choices: [] }), JSON.stringify(provider('untrusted', { total_tokens: 'bad' })), JSON.stringify(provider('untrusted', { prompt_tokens: 1, completion_tokens: 2, total_tokens: 99 }))];
 for (const raw of values) { const r = await createNativeRouter({ environment: env, fetchImpl: async () => new Response(raw) }).handle(call('ask_kimi', { task: 'inert' })); assert.match(content(r), /fallback/); assert(!content(r).includes('untrusted')); }
});
test('missing usage remains unknown, never fabricated zero', async () => {
 const r = await createNativeRouter({ environment: env, fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })) }).handle(call('ask_kimi', { task: 'inert' }));
 assert.deepEqual(r.result._meta.usage, { prompt_tokens: null, completion_tokens: null, total_tokens: null }); assert.match(content(r), /tokens=\?/);
});
test('oversize provider body refuses success and cancels the reader', async () => {
 let cancelled = false;
 const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_WIRE_BYTES + 1)); }, cancel() { cancelled = true; } });
 const r = await createNativeRouter({ environment: env, fetchImpl: async () => new Response(body) }).handle(call('ask_kimi', { task: 'inert' })); assert.match(content(r), /fallback/); assert(cancelled);
});
test('actual timeout propagates AbortSignal and closes the local request socket', { timeout: 10000 }, async t => {
 let received; const ready = new Promise(resolve => { received = resolve; }); let closed; const gone = new Promise(resolve => { closed = resolve; }); let signal, calls = 0;
 const endpoint = await server(t, req => { req.on('close', closed); received(); });
 const router = createNativeRouter({ environment: { ...env, GREAT_CTO_ROUTER_TIMEOUT: '1' }, fetchImpl: (url, options) => { signal = options.signal; calls++; return fetch(endpoint, options); } });
 const result = router.handle(call('ask_kimi', { task: 'inert' })); await ready; const r = await result; assert(signal.aborted); assert.match(content(r), /deadline exceeded/); assert.equal(calls, 1); await gone;
});
test('already aborted request never dispatches transport', async () => {
 const control = new AbortController(); control.abort(); let calls = 0;
 const r = await createNativeRouter({ environment: env, fetchImpl: () => { calls++; } }).handle(call('ask_kimi', { task: 'inert' }), { signal: control.signal });
 assert.match(content(r), /request aborted/); assert.equal(calls, 0); assert.equal(r.result._meta.usage, null);
});
test('late usage callback cannot return success and preserves known usage', async () => {
 let clock = 0, callbacks = 0;
 const r = await createNativeRouter({ environment: env, now: () => clock, fetchImpl: async () => new Response(JSON.stringify(provider('must not return'))), recordUsage: () => { callbacks++; clock = 60001; } }).handle(call('ask_kimi', { task: 'inert' }));
 assert.match(content(r), /deadline exceeded/); assert(!content(r).includes('must not return')); assert.equal(r.result._meta.usage.total_tokens, 5); assert.equal(callbacks, 1);
});
test('usage callback failure is content-free and keeps measured usage', async () => {
 const r = await createNativeRouter({ environment: env, fetchImpl: async () => new Response(JSON.stringify(provider())), recordUsage: () => { throw Error(key); } }).handle(call('ask_kimi', { task: 'inert' }));
 assert.match(content(r), /usage evidence callback failed/); assert(!JSON.stringify(r).includes(key)); assert.equal(r.result._meta.usage.total_tokens, 5);
});
test('wire limits and malformed lines cannot trigger a provider request', async () => {
 const out = []; const output = { write: x => { out.push(x); return true; } };
 await serveNativeRouter({ input: Readable.from(['not-json\n' + JSON.stringify({ id: 0, method: 'initialize' }) + '\n']), output }); assert.equal(out.length, 1);
 await assert.rejects(serveNativeRouter({ input: Readable.from([Buffer.alloc(MAX_WIRE_BYTES + 1)]), output }), /input too large/);
});
test('write replies await backpressure and retain complete JSON', async () => {
 let raw = ''; const output = new Writable({ highWaterMark: 1, write(chunk, encoding, done) { setImmediate(() => { raw += chunk.toString(); done(); }); } });
 const value = { id: 0, result: { text: 'x'.repeat(20000) } }; await writeRouterReply(output, value); assert.deepEqual(JSON.parse(raw), value);
});
test('active external cancellation closes a real local HTTP request', { timeout: 10000 }, async t => {
 let arrived, departed; const ready = new Promise(r => { arrived = r; }); const gone = new Promise(r => { departed = r; });
 const endpoint = await server(t, req => { req.on('close', departed); arrived(); }); const abort = new AbortController(); let transportSignal;
 const router = createNativeRouter({ environment: env, fetchImpl: (url, options) => { transportSignal = options.signal; return fetch(endpoint, options); } });
 const pending = router.handle(call('ask_kimi', { task: 'inert' }), { signal: abort.signal }); await ready; abort.abort(); const r = await pending;
 assert(transportSignal.aborted); assert.match(content(r), /request aborted/); assert.equal(r.result._meta.usage, null); await gone;
});
test('SIGTERM stops the real stdio process with stdin still open', { timeout: 10000 }, async t => {
 const root = mkdtempSync(join(tmpdir(), 'native-router-signal-'));
 const p = spawn(process.execPath, [entry], { cwd: root, env: { PATH: '/usr/bin:/bin', HOME: root }, stdio: ['pipe', 'pipe', 'pipe'] });
 let out = '', ready; const observed = new Promise(r => { ready = r; });
 p.stdout.on('data', x => { out += x; if (out.includes('\n')) ready(); });
 const closed = new Promise((yes, no) => { p.once('error', no); p.once('close', (code, signal) => yes({ code, signal })); });
 t.after(async () => { if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL'); await closed; rmSync(root, { recursive: true, force: true }); });
 p.stdin.write(JSON.stringify({ id: 0, method: 'initialize' }) + '\n'); await observed; assert.equal(JSON.parse(out.trim()).id, 0); assert(p.kill('SIGTERM'));
 const result = await closed; assert.equal(result.code, 143); assert.equal(result.signal, null);
});
test('synchronous transport cancellation cannot leak an unhandled rejection', async () => {
 const control = new AbortController(); const router = createNativeRouter({ environment: env, fetchImpl: () => { control.abort(); return Promise.reject(Error('fixture rejected transport')); } });
 const r = await router.handle(call('ask_kimi', { task: 'inert' }), { signal: control.signal }); assert.match(content(r), /request aborted/);
 await new Promise(r => setImmediate(r));
});
test('an expired pre-dispatch clock cannot start a paid request', async () => {
 let calls = 0, ticks = 0; const times = [0, 0, 60001];
 const r = await createNativeRouter({ environment: env, now: () => times[Math.min(ticks++, times.length - 1)], fetchImpl: () => { calls++; } }).handle(call('ask_kimi', { task: 'inert' }));
 assert.match(content(r), /deadline exceeded/); assert.equal(calls, 0);
});
test('a late response aborts transport rather than only refusing the answer', async () => {
 let clock = 0, signal;
 const r = await createNativeRouter({ environment: env, now: () => clock, fetchImpl: async (url, options) => { signal = options.signal; clock = 60001; return new Response(JSON.stringify(provider())); } }).handle(call('ask_kimi', { task: 'inert' }));
 assert(signal.aborted); assert.match(content(r), /deadline exceeded/); assert.equal(r.result._meta.usage, null);
});
test('unresponsive stream cancellation cannot postpone deadline refusal indefinitely', { timeout: 10000 }, async () => {
 const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_WIRE_BYTES + 1)); }, cancel() { return new Promise(() => {}); } });
 const r = await createNativeRouter({ environment: { ...env, GREAT_CTO_ROUTER_TIMEOUT: '1' }, fetchImpl: async () => new Response(body) }).handle(call('ask_kimi', { task: 'inert' }));
 assert.match(content(r), /deadline exceeded/);
});
test('refused empty content still records valid provider-reported usage', async () => {
 let record; const r = await createNativeRouter({ environment: env, fetchImpl: async () => new Response(JSON.stringify(provider('  '))), recordUsage: value => { record = value; } }).handle(call('ask_kimi', { task: 'inert' }));
 assert.match(content(r), /invalid provider content/); assert.equal(record.total_tokens, 5); assert.equal(r.result._meta.usage.total_tokens, 5);
});
test('deadline aborts an incomplete real HTTP response body', { timeout: 10000 }, async t => {
 let closed; const gone = new Promise(r => { closed = r; }); let signal;
 const endpoint = await server(t, (req, res) => { res.on('close', closed); res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"choices":['); });
 const router = createNativeRouter({ environment: { ...env, GREAT_CTO_ROUTER_TIMEOUT: '1' }, fetchImpl: (url, options) => { signal = options.signal; return fetch(endpoint, options); } });
 const r = await router.handle(call('ask_kimi', { task: 'inert' })); assert(signal.aborted); assert.match(content(r), /deadline exceeded/); assert.equal(r.result._meta.usage, null); await gone;
});
test('HTTP redirects cannot forward task content to a different endpoint', { timeout: 10000 }, async t => {
 let destinationCalls = 0; const destination = await server(t, (req, res) => { destinationCalls++; res.end(JSON.stringify(provider())); });
 const origin = await server(t, (req, res) => { res.writeHead(307, { Location: destination }); res.end(); });
 const router = createNativeRouter({ environment: env, fetchImpl: (url, options) => { assert.equal(options.redirect, 'error'); return fetch(origin, options); } });
 const r = await router.handle(call('ask_kimi', { task: 'private fixture task' })); assert.match(content(r), /fallback/); assert.equal(destinationCalls, 0);
});
