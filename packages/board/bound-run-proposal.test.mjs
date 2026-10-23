import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { dispatch } from './lib/routes.mjs';
import { PORT } from './lib/config.mjs';
import { startServerOnFreePort } from '../../tests/helpers/board-start.mjs';
import { reap } from '../../tests/helpers/reap.mjs';

const run = '12345678-1234-1234-1234-123456789abc';
const sha = value => createHash('sha256').update(value).digest('hex');
const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const bindingPath = `/api/focus-run-binding?project=known&run=${run}&phase=review`;
const fakeBinding = { snapshot: 'a'.repeat(64), epoch: 'b'.repeat(64), plan: 'c'.repeat(64), base: 'd'.repeat(40), policy: 'e'.repeat(64) };
const proposalPath = (binding = fakeBinding, phase = 'review') => `/api/focus-run-proposal?${new URLSearchParams({ project: 'known', run, phase, focus: 'mental-care', ...binding })}`;
const queryBinding = b => ({ snapshot: b.snapshotDigest, epoch: b.epochDigest, plan: b.planFingerprint, base: b.base, policy: b.policyDigest });

function denied(result, status, reason) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.state, 'unavailable');
  assert.equal(result.body.reason, reason);
  assert.equal(result.body.binding, null);
  assert.equal(result.body.proposal, null);
  assert.equal(result.body.schemaVersion, 1);
  assert.equal(result.body.currentTreeAssessment, false);
  assert.equal(result.body.reusablePass, false);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.match(result.headers['content-type'], /application\/json/);
  assert.equal(result.headers['access-control-allow-origin'], undefined);
  assert.equal(result.headers.etag, undefined);
}

async function direct(target, headers = {}, method = 'GET', rawHeaders) {
  const req = { method, url: target, headers: { host: `127.0.0.1:${PORT}`, ...headers }, socket: {},
    rawHeaders: rawHeaders || Object.entries({ host: `127.0.0.1:${PORT}`, ...headers }).flat() };
  const result = { headers: {} };
  const res = { setHeader(k, v) { result.headers[k.toLowerCase()] = v; },
    writeHead(status, values) { result.status = status; for (const [k, v] of Object.entries(values)) this.setHeader(k, v); },
    end(value) { result.body = JSON.parse(value); } };
  assert.equal(await dispatch(req, res, new URL(target, 'http://unused.invalid'), '/PRIVATE_SERVER_ROOT'), true);
  return result;
}

const invalidSelections = target => [target + '&extra=TOKEN_CANARY', target + '&project=known',
  target.replace(/run=[^&]+/, 'run=../TOKEN_CANARY'), target.replace(/phase=[^&]+/, 'phase=native'),
  target.replace(/project=[^&]+&/, ''), target.replace(/run=[^&]+/, `run=${run.toUpperCase()}`),
  target.replace('project=known', 'project=' + 'x'.repeat(257)), target + '&' + 'x'.repeat(2048),
  target.replace('project=known', 'project=bad%00name'), target.replace('project=known', 'project=bad%zz'),
  ...[...new URL(target, 'http://unused.invalid').searchParams].flatMap(([key, value]) => {
    const missing = new URL(target, 'http://unused.invalid'); missing.searchParams.delete(key);
    const newline = new URL(target, 'http://unused.invalid'); newline.searchParams.set(key, value + '\n');
    return [missing.pathname + missing.search, target + `&${key}=${encodeURIComponent(value)}`, newline.pathname + newline.search];
  })];

test('direct dispatcher refuses hostile origin/host/query/method before any filesystem read', async () => {
  const names = ['readFileSync', 'openSync', 'realpathSync', 'statSync', 'lstatSync', 'readdirSync'];
  const originals = new Map(names.map(name => [name, fs[name]]));
  let reads = 0;
  for (const name of names) fs[name] = () => { reads++; throw Error('PRIVATE_FS_CANARY'); };
  try {
    for (const target of [bindingPath, proposalPath()]) {
      for (const headers of [{ origin: 'https://foreign.invalid' }, { origin: 'null' }, { origin: 'bad origin' },
        { origin: `https://127.0.0.1:${PORT}` }, { origin: `http://127.0.0.1:${PORT + 1}` },
        { origin: `http://localhost:${PORT}` }, { referer: 'https://foreign.invalid/page' },
        { 'sec-fetch-site': 'cross-site' }, { host: 'evil.invalid' },
        { origin: `http://127.0.0.1:${PORT}/` }, { origin: `http://127.0.0.1:${PORT}, http://127.0.0.1:${PORT}` }]) {
        denied(await direct(target, headers), 403, 'access-denied');
      }
      const own = `http://127.0.0.1:${PORT}`;
      denied(await direct(target, { origin: own }, 'GET', ['Host', `127.0.0.1:${PORT}`, 'Origin', own, 'Origin', own]), 403, 'access-denied');
      denied(await direct(target + '&extra=1', { origin: own, referer: own + '/index.html' }), 400, 'invalid-selection');
      denied(await direct(target + '&extra=1', { origin: own, 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.invalid' }), 400, 'invalid-selection');
      for (const invalid of invalidSelections(target)) denied(await direct(invalid), 400, 'invalid-selection');
      for (const method of ['POST', 'OPTIONS', 'HEAD', 'DELETE']) {
        const result = await direct(target, {}, method);
        denied(result, 405, 'method-not-allowed'); assert.equal(result.headers.allow, 'GET');
      }
    }
    for (const [key, value] of Object.entries({ focus: 'unknown', snapshot: 'f'.repeat(63), epoch: 'F'.repeat(64), plan: '', base: 'x'.repeat(40), policy: 'f'.repeat(65) })) {
      const invalid = new URL(proposalPath(), 'http://unused.invalid'); invalid.searchParams.set(key, value);
      denied(await direct(invalid.pathname + invalid.search), 400, 'invalid-selection');
    }
    assert.equal(reads, 0, 'all refused direct calls must precede registry, resolver, metadata and state');
  } finally { for (const [name, fn] of originals) fs[name] = fn; }
});

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.homedir()), '.bound-api-test-'));
  fs.chmodSync(dir, 0o700);
  let cleanupServer;
  t.after(async () => { if (cleanupServer) await reap(cleanupServer); fs.rmSync(dir, { recursive: true, force: true }); });
  const root = path.join(dir, 'project'), foreign = path.join(dir, 'foreign'), home = path.join(dir, 'home'), store = path.join(dir, 'store');
  for (const d of [root, foreign, home, store]) fs.mkdirSync(d, { mode: 0o700 });
  for (const d of [root, foreign, home]) fs.mkdirSync(path.join(d, '.great_cto'), { mode: 0o700 });
  const policy = 'archetype: devtools\napproval-level: gates-only\n';
  fs.writeFileSync(path.join(root, '.great_cto', 'PROJECT.md'), policy, { mode: 0o600 });
  const registry = path.join(home, '.great_cto', 'projects.json');
  fs.writeFileSync(registry, JSON.stringify({ projects: [{ slug: 'known', path: root }, { slug: 'foreign', path: foreign }] }));
  const state = { version: 1, id: run, root, prompt: 'TOKEN_CANARY', error: 'PRIVATE_ERROR_CANARY',
    specialistPolicy: { mode: 'adaptive', workflow: 'existing-change', base: 'a'.repeat(40), contracts: [], projectDigest: sha(policy) },
    specialistReview: { roles: [...mandatory], fingerprint: 'b'.repeat(64), hardGates: ['gate:ship'], reusablePass: false,
      plan: { version: 1, state: 'planned', advisory: true, planningOnly: false, reusablePass: false,
        scope: 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested', fingerprint: 'b'.repeat(64),
        assessment: { known: true, tier: 'T1', base: 'a'.repeat(40), fingerprint: 'c'.repeat(64), files: ['src/PRIVATE_FILE_CANARY.ts'],
          reasons: ['auto:T1:behavioral(1)'], escalatedFromLabel: null },
        reviewers: mandatory.map(agent => ({ agent, reasons: ['PRIVATE_REASON_CANARY'], files: [] })) } } };
  const stateFile = path.join(store, `${run}.json`);
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 }); save();
  return { dir, root, foreign, home, store, registry, state, stateFile, save, cleanup: proc => { cleanupServer = proc; } };
}

function request(port, target, { headers = {}, method = 'GET', rawHeaders } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: target, method,
      headers: rawHeaders || headers }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', data => { text += data; });
      res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null, text }); } catch (error) { reject(error); } });
    }); req.on('error', reject); req.end();
  });
}

test('real HTTP bootstrap enforces guard before registry and retains exact snapshot envelope', { timeout: 45000 }, async t => {
  const f = fixture(t), trace = path.join(f.dir, 'trace.jsonl'), arm = path.join(f.dir, 'armed');
  const probe = path.join(f.dir, 'probe.mjs');
  fs.writeFileSync(trace, '');
  fs.writeFileSync(probe, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const trace=${JSON.stringify(trace)},arm=${JSON.stringify(arm)},registry=${JSON.stringify(f.registry)},store=${JSON.stringify(f.store)};
const exists=fs.existsSync,append=fs.appendFileSync;
for(const name of ['readFileSync','openSync','realpathSync','statSync','lstatSync','readdirSync']){
 const original=fs[name]; fs[name]=function(file,...args){
  if(exists(arm)&&typeof file==='string'&&(file===registry||file.startsWith(store)||file.endsWith('/.great_cto/PROJECT.md')))
   append(trace,JSON.stringify({name,file})+'\\n');
  return original.call(this,file,...args);
 };
}syncBuiltinESMExports();`);
  const server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: f.root, readyPath: bindingPath,
    env: { HOME: f.home, GREAT_CTO_PROJECTS_FILE: f.registry, GREAT_CTO_CODEX_RUNS_DIR: f.store,
      GREAT_CTO_NO_UPDATE_CHECK: '1', NODE_OPTIONS: `--import=${probe}` } });
  f.cleanup(server.proc);
  let logs = ''; server.proc.stdout.on('data', b => { logs += b; }); server.proc.stderr.on('data', b => { logs += b; });
  const origin = `http://127.0.0.1:${server.port}`;
  for (const headers of [{}, { Origin: origin }, { Referer: origin + '/index.html' }, { 'Sec-Fetch-Site': 'same-origin' }]) {
    const result = await request(server.port, bindingPath, { headers });
    assert.equal(result.status, 200); assert.equal(result.body.state, 'available', JSON.stringify(result.body));
    assert.equal(result.body.projectId, sha(f.root)); assert.equal(result.body.provenance, 'stored-snapshot');
    assert.equal(result.headers['access-control-allow-origin'], undefined); assert.equal(result.headers['cache-control'], 'no-store');
  }
  const descriptor = (await request(server.port, bindingPath)).body;
  const proposal = await request(server.port, proposalPath(queryBinding(descriptor.binding)));
  assert.equal(proposal.status, 200); assert.equal(proposal.body.proposal.assessmentState, 'known');
  assert.deepEqual(proposal.body.binding, descriptor.binding);
  assert.equal(proposal.body.changesExecution, false); assert.equal(proposal.body.currentTreeAssessment, false);
  assert(proposal.body.limitations.includes('content-identity-not-historical-epoch'));
  assert(Buffer.byteLength(proposal.text) <= 98304);
  assert.doesNotMatch(JSON.stringify([descriptor, proposal]), /TOKEN_CANARY|PRIVATE_.*CANARY|\.bound-api-test-/);
  const before = fs.readFileSync(f.stateFile, 'utf8');
  const stale = queryBinding(descriptor.binding); stale.epoch = '0'.repeat(64);
  denied(await request(server.port, proposalPath(stale)), 409, 'snapshot-changed');
  const missing = await request(server.port, bindingPath.replace(run, '00000000-0000-0000-0000-000000000000'));
  const other = await request(server.port, bindingPath.replace('project=known', 'project=foreign'));
  denied(missing, 404, 'unavailable'); assert.deepEqual(other.body, missing.body);
  denied(await request(server.port, bindingPath.replace('project=known', 'project=unknown')), 404, 'unavailable');
  assert.equal(fs.readFileSync(f.stateFile, 'utf8'), before);
  const old = await request(server.port, '/api/focus-proposal?project=known&focus=mental-care&host=codex');
  assert.equal(old.status, 200); assert.equal(old.body.changeIdentity, null); assert.equal(old.body.proposal.assessmentState, 'unavailable');

  fs.writeFileSync(arm, 'armed');
  fs.writeFileSync(trace, '');
  const malformed = await request(server.port, 'http://[');
  assert.equal(malformed.status, 400); assert.equal(malformed.headers['cache-control'], 'no-store');
  assert.equal(malformed.body.reason, 'invalid-selection'); assert.equal(fs.readFileSync(trace, 'utf8'), '');
  for (const target of [bindingPath, proposalPath()]) {
    for (const headers of [{ Origin: 'https://foreign.invalid' }, { Origin: 'null' }, { Origin: 'bad' },
      { Origin: `https://127.0.0.1:${server.port}` }, { Origin: `http://127.0.0.1:${server.port + 1}` },
      { Origin: `http://localhost:${server.port}` }, { Referer: 'https://foreign.invalid/' },
      { 'Sec-Fetch-Site': 'cross-site' }, { Host: 'evil.invalid' }, { Origin: origin + '/' },
      { Origin: 'https://foreign.invalid', 'X-Forwarded-Host': 'foreign.invalid', 'X-Forwarded-Proto': 'https' }]) {
      fs.writeFileSync(trace, ''); denied(await request(server.port, target, { headers }), 403, 'access-denied');
      assert.equal(fs.readFileSync(trace, 'utf8'), '', 'HTTP denial must precede all sensitive reads');
    }
    fs.writeFileSync(trace, '');
    denied(await request(server.port, target, { rawHeaders: ['Host', `127.0.0.1:${server.port}`, 'Origin', origin, 'Origin', origin] }), 403, 'access-denied');
    assert.equal(fs.readFileSync(trace, 'utf8'), '');
    for (const invalid of invalidSelections(target)) {
      fs.writeFileSync(trace, ''); denied(await request(server.port, invalid), 400, 'invalid-selection');
      assert.equal(fs.readFileSync(trace, 'utf8'), '');
    }
    for (const method of ['POST', 'OPTIONS', 'DELETE']) {
      fs.writeFileSync(trace, ''); const result = await request(server.port, target, { method });
      denied(result, 405, 'method-not-allowed'); assert.equal(result.headers.allow, 'GET');
      assert.equal(fs.readFileSync(trace, 'utf8'), '');
    }
  }
  fs.writeFileSync(trace, '');
  const exact = await request(server.port, proposalPath(queryBinding(descriptor.binding)));
  assert.equal(exact.body.state, 'available');
  const reads = fs.readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(reads.filter(r => r.name === 'openSync' && r.file === f.stateFile).length, 1);
  assert.equal(reads.filter(r => r.name === 'openSync' && r.file.endsWith('/project/.great_cto/PROJECT.md')).length, 1);
  assert(!reads.some(r => r.name === 'readdirSync'), 'explicit inspection never lists the store');
  fs.writeFileSync(f.registry, '{"projects": TOKEN_CANARY /PRIVATE_REGISTRY_PATH_CANARY');
  denied(await request(server.port, bindingPath), 404, 'unavailable');
  fs.writeFileSync(f.registry, JSON.stringify({ projects: [] }));
  denied(await request(server.port, bindingPath.replace('project=known', `project=${encodeURIComponent(f.root)}`)), 404, 'unavailable');
  fs.unlinkSync(f.registry);
  denied(await request(server.port, bindingPath), 404, 'unavailable');
  fs.symlinkSync(f.stateFile, f.registry);
  denied(await request(server.port, bindingPath), 404, 'unavailable');
  assert.doesNotMatch(logs, /TOKEN_CANARY|PRIVATE_.*CANARY|focus-run-|snapshot=|epoch=/);
});

test('real HTTP preparation descriptor cannot become review evidence or a graph', { timeout: 45000 }, async t => {
  const f = fixture(t), phase = structuredClone(f.state.specialistReview);
  phase.plan.planningOnly = true; phase.plan.assessment = { known: false, tier: 'T2', base: 'a'.repeat(40), files: [],
    reasons: ['assessment-unavailable:empty change has no risk evidence'] };
  phase.roles = []; phase.selected = []; phase.hardGates = ['gate:plan'];
  f.state.specialistPolicy.workflow = 'phased-change'; f.state.specialistPreparation = phase; f.state.specialistStages = {}; f.save();
  const server = await startServerOnFreePort({ entry: path.resolve('packages/board/server.mjs'), cwd: f.root, readyPath: bindingPath.replace('phase=review', 'phase=preparation'),
    env: { HOME: f.home, GREAT_CTO_PROJECTS_FILE: f.registry, GREAT_CTO_CODEX_RUNS_DIR: f.store, GREAT_CTO_NO_UPDATE_CHECK: '1' } });
  f.cleanup(server.proc);
  const result = await request(server.port, bindingPath.replace('phase=review', 'phase=preparation'));
  assert.equal(result.body.state, 'available'); assert.equal(result.body.phase, 'preparation');
  denied(await request(server.port, proposalPath(queryBinding(result.body.binding), 'preparation')), 200, 'planning-only-evidence');
  delete f.state.specialistReview; f.save();
  denied(await request(server.port, bindingPath), 200, 'unsupported-evidence');
});
