// ADR-025: independent architecture drafts from other models, before the architect
// writes. Every case uses injected transports — no request leaves the machine — and
// a temp project, so nothing is written into this repository.

import { test, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, rmSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { councilFromProjectMd, runCouncil, estimateUsd, DEFAULT_MAX_USD } from '../../scripts/lib/council.mjs';

const TMP = [];
after(() => { for (const d of TMP) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
const root = () => { const d = mkdtempSync(path.join(realpathSync(tmpdir()), 'gc-council-')); TMP.push(d); return d; };

// What resolveSecondOpinion needs to call each member declared: a Codex that is
// installed and logged in, and an OpenRouter key. The OpenRouter model is one the
// price table knows, so its cost can be estimated and capped.
const CODEX = { state: 'available', model: 'gpt-5', why: '' };
// Assembled rather than written: a key-shaped literal reads as a leaked key to every
// secret scanner, and this value's only job is to be present.
const FAKE_OPENROUTER_KEY = ['test', 'key'].join('-');
const ENV = { OPENROUTER_API_KEY: FAKE_OPENROUTER_KEY, GREAT_CTO_COUNCIL_MODEL: 'anthropic/claude-sonnet-4' };
const BOTH = (extra = '') => `# PROJECT.md\narchetype: web-service\ncouncil: arch\ncouncil-members: codex, openrouter\n${extra}`;
const OPENROUTER_ONLY = (extra = '') => `council: arch\ncouncil-members: openrouter\n${extra}`;

function recorder(text, usage = { input_tokens: 1000, output_tokens: 500 }) {
  const calls = [];
  const ask = async (req) => { calls.push(req); return { state: 'ok', text, usage, model: req.model }; };
  return { ask, calls };
}

test('the declaration has three states, and an unknown value is not read as off', () => {
  assert.equal(councilFromProjectMd('archetype: cli\n').state, 'off');
  assert.equal(councilFromProjectMd('council: none\n').state, 'off');
  const on = councilFromProjectMd('council: arch\n');
  assert.equal(on.state, 'on');
  assert.deepEqual(on.stages, ['arch']);
  assert.equal(on.maxUsd, DEFAULT_MAX_USD);
  assert.equal(councilFromProjectMd('council: code\n').state, 'invalid');
  assert.equal(councilFromProjectMd('council: arch\ncouncil-max-usd: lots\n').state, 'invalid');
  assert.equal(councilFromProjectMd('council: arch\ncouncil-members: gemini\n').state, 'invalid');
});

test('with no council declared, nothing is called and nothing is written', async () => {
  const dir = root();
  const codex = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: '# PROJECT.md\narchetype: cli\n', env: ENV, codex: CODEX, askers: { codex: codex.ask } });
  assert.equal(r.state, 'off');
  assert.equal(codex.calls.length, 0);
  assert.equal(existsSync(path.join(dir, 'docs')), false);
});

test('two members draft independently; drafts and a manifest are written', async () => {
  const dir = root();
  const a = recorder('## Decision\nPostgres, one service.');
  const b = recorder('## Decision\nEvent log, two services.');
  const r = await runCouncil({ root: dir, feature: 'checkout', brief: 'Build checkout.', projectMd: BOTH(), env: ENV, codex: CODEX,
    askers: { codex: a.ask, openrouter: b.ask } });
  assert.equal(r.state, 'ran');
  const m = r.manifest;
  assert.equal(m.summary, 'council: 2 of 2 members drafted');
  assert.equal(m.degraded, false);
  for (const x of m.members) {
    assert.equal(x.state, 'drafted');
    assert.match(readFileSync(path.join(dir, x.path), 'utf8'), /## Decision/);
  }
  const onDisk = JSON.parse(readFileSync(path.join(dir, 'docs/architecture/council/checkout/council.json'), 'utf8'));
  assert.equal(onDisk.summary, m.summary);
});

test('a member is never shown another member\'s draft, and both get the identical request', async () => {
  const dir = root();
  const a = recorder('UNIQUE-DRAFT-A');
  const b = recorder('UNIQUE-DRAFT-B');
  await runCouncil({ root: dir, feature: 'checkout', brief: 'Build checkout.', projectMd: BOTH(), env: ENV, codex: CODEX,
    askers: { codex: a.ask, openrouter: b.ask } });
  assert.equal(a.calls.length, 1);
  assert.equal(b.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(b.calls), /UNIQUE-DRAFT-A/);
  assert.doesNotMatch(JSON.stringify(a.calls), /UNIQUE-DRAFT-B/);
  assert.equal(a.calls[0].user, b.calls[0].user);
  assert.match(a.calls[0].user, /Build checkout\./, 'the brief is the input');
});

test('a member that fails is recorded failed; all failing is degraded, never agreement', async () => {
  const dir = root();
  const boom = async () => { throw new Error('connection reset'); };
  const empty = async () => ({ state: 'empty', text: '', usage: null });
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: BOTH(), env: ENV, codex: CODEX, askers: { codex: boom, openrouter: empty } });
  const m = r.manifest;
  assert.deepEqual(m.members.map((x) => [x.member, x.state]), [['codex', 'failed'], ['openrouter', 'failed']]);
  assert.match(m.members[0].why, /connection reset/);
  assert.equal(m.degraded, true);
  assert.equal(m.summary, 'council: degraded — 0 of 2 members drafted');
});

test('a member that never answers times out and is recorded failed', async () => {
  const dir = root();
  const hang = () => new Promise(() => {});
  const ok = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: BOTH(), env: ENV, codex: CODEX, timeoutMs: 50,
    askers: { codex: hang, openrouter: ok.ask } });
  assert.equal(r.manifest.members[0].state, 'failed');
  assert.match(r.manifest.members[0].why, /timed out/);
  assert.equal(r.manifest.summary, 'council: 1 of 2 members drafted');
});

test('an OpenRouter member whose estimate exceeds the cap is skipped, not run', async () => {
  const dir = root();
  const b = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', brief: 'x'.repeat(20000), projectMd: OPENROUTER_ONLY('council-max-usd: 0.0001\n'),
    env: ENV, codex: CODEX, askers: { openrouter: b.ask } });
  assert.equal(b.calls.length, 0, 'nothing over the cap is called');
  assert.equal(r.manifest.members[0].state, 'skipped');
  assert.match(r.manifest.members[0].why, /exceeds council-max-usd/);
});

test('an OpenRouter model with no known price cannot be kept under the cap, so it is skipped', async () => {
  const dir = root();
  const b = recorder('draft');
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(),
    env: { ...ENV, GREAT_CTO_COUNCIL_MODEL: 'nobody/unpriced-model-xyz' }, codex: CODEX, askers: { openrouter: b.ask } });
  assert.equal(b.calls.length, 0);
  assert.equal(r.manifest.members[0].state, 'skipped');
  assert.match(r.manifest.members[0].why, /no price/);
});

test('a Codex member runs on the subscription: no dollar estimate, and its cost is unverifiable, not $0', async () => {
  const dir = root();
  const a = recorder('draft', { input_tokens: 3000, output_tokens: 900 });
  const r = await runCouncil({ root: dir, feature: 'checkout', brief: 'x'.repeat(20000), projectMd: 'council: arch\ncouncil-members: codex\ncouncil-max-usd: 0.0001\n',
    env: ENV, codex: CODEX, askers: { codex: a.ask } });
  const [x] = r.manifest.members;
  assert.equal(a.calls.length, 1, 'the per-token cap does not apply to a subscription');
  assert.equal(x.state, 'drafted');
  assert.deepEqual(x.estimate, { usd: null, priceSource: 'subscription' });
  assert.equal(x.cost.state, 'unverifiable');
  assert.equal(x.cost.usd, null);
  assert.match(x.cost.why, /subscription/);
});

test('an OpenRouter draft whose provider returned no usage is unverifiable, never $0', async () => {
  const dir = root();
  const noUsage = recorder('draft', null);
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(), env: ENV, codex: CODEX, askers: { openrouter: noUsage.ask } });
  const [x] = r.manifest.members;
  assert.equal(x.state, 'drafted');
  assert.equal(x.cost.state, 'unverifiable');
  assert.equal(x.cost.usd, null);
  assert.deepEqual(r.manifest.cost.unverifiable, ['openrouter']);
});

test('a measured OpenRouter draft is priced from its usage', async () => {
  const dir = root();
  const b = recorder('draft', { input_tokens: 2000, output_tokens: 1000 });
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(), env: ENV, codex: CODEX, askers: { openrouter: b.ask } });
  const [x] = r.manifest.members;
  assert.equal(x.cost.state, 'measured');
  assert.ok(x.cost.usd > 0);
  assert.equal(r.manifest.cost.measuredUsd, x.cost.usd);
});

test('an undeclared provider is unavailable, with the reason', async () => {
  const dir = root();
  const r = await runCouncil({ root: dir, feature: 'checkout', projectMd: OPENROUTER_ONLY(), env: {}, codex: CODEX, askers: {} });
  assert.equal(r.manifest.members[0].state, 'unavailable');
  assert.match(r.manifest.members[0].why, /OPENROUTER_API_KEY/);
  assert.equal(r.manifest.degraded, true);
});

test('a feature slug that could escape the council directory is refused', async () => {
  const dir = root();
  const r = await runCouncil({ root: dir, feature: '../../etc', projectMd: BOTH(), env: ENV, codex: CODEX, askers: {} });
  assert.equal(r.state, 'invalid');
  assert.equal(existsSync(path.join(dir, 'docs')), false);
});

test('an estimate for an unpriced model is null, not zero', () => {
  assert.equal(estimateUsd({ model: 'nobody/unpriced-model-xyz', inputChars: 4000 }).usd, null);
  assert.ok(estimateUsd({ model: 'claude-sonnet-4', inputChars: 4000 }).usd > 0);
});

function extraRuntime() {
  const dir = root(), hash = x => createHash('sha256').update(x).digest('hex');
  writeFileSync(path.join(dir, 'brief.md'), 'Synthetic brief.');
  const manifest = [{ path: 'brief.md', mode: '100644', sha256: hash('Synthetic brief.'), contextClass: 'synthetic' }];
  const envelope = { version: 1, taskId: 'synthetic-council', mode: 'architecture-alternative', contextClass: 'synthetic',
    reason: 'architecture-alternative', brief: 'Synthetic brief.', projectContext: 'Explicit public excerpt.',
    acceptanceHash: hash('rubric'), sourceBinding: { sourceSha: 'a'.repeat(40), manifest,
      manifestHash: hash(JSON.stringify(manifest)), dirtyDiffHash: null } };
  const model = 'moonshotai/kimi-k3.1-pro', canonical = `${model}-20261023`;
  const pricing = { prompt: '0.000002', completion: '0.00001', input_cache_read: '0.0000002' };
  const supported_parameters = ['reasoning', 'max_tokens', 'structured_outputs', 'response_format'];
  const metadata = [ { data: [{ id: model, canonical_slug: canonical, pricing, supported_parameters,
    reasoning: { mandatory: false, default_enabled: true, supported_efforts: ['max', 'high', 'low', 'none'], default_effort: 'max' }, default_parameters: { top_p: 0.95 } }] },
    { data: { id: model, name: 'Kimi', endpoints: [{ tag: 'moonshotai/mxfp4', provider_name: 'Moonshot',
      name: `Moonshot | ${canonical}`, pricing, supported_parameters, status: 0 }] } },
    { data: [{ model_id: model, tag: 'moonshotai/mxfp4', provider_name: 'Moonshot' }] } ];
  const calls = [], result = { version: 1, mode: 'architecture-alternative', decision: 'PRIVATE_SYNTHETIC_DRAFT',
    alternatives: [{ name: 'Queue', mechanism: 'Bounded queue.', tradeoff: 'Storage.', failureMode: 'Backlog.' },
      { name: 'Direct', mechanism: 'Synchronous.', tradeoff: 'Latency.', failureMode: 'Timeout.' }], risks: ['Bound capacity.'], openQuestions: [] };
  return { dir, envelope, calls, runtime: { operatorRoot: path.join(dir, 'operator'), apiKey: 'example-synthetic-key',
    now: () => 1792843200000, fetchImpl: async (url, init) => { calls.push({ url, init });
      return new Response(JSON.stringify(init.method === 'POST' ? { model, provider: 'Moonshot',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } } : metadata.shift()), { status: 200 }); },
  } };
}

test('explicit extra architecture draft remains private and outside native member arithmetic', async () => {
  const x = extraRuntime(), native = recorder('NATIVE_DRAFT');
  const r = await runCouncil({ root: x.dir, feature: 'synthetic', brief: 'Ambient private brief.',
    projectMd: OPENROUTER_ONLY() + 'PRIVATE_PROJECT_MARKER', env: ENV, askers: { openrouter: native.ask },
    extraProfiles: [{ profile: 'kimi-readonly-v1', envelope: x.envelope }], kimiRuntime: x.runtime });
  assert.equal(x.calls.length, 4, JSON.stringify(r));
  assert.equal(r.extraMembers[0].member, 'draft-extra-kimi-readonly-v1');
  assert.equal(r.extraMembers[0].state, 'drafted');
  assert.equal(r.extraMembers[0].verdict, null);
  assert.ok(existsSync(r.extraMembers[0].privateReportPath));
  const post = x.calls.find(c => c.init.method === 'POST');
  assert.match(post.init.body, /Synthetic brief\./);
  assert.match(post.init.body, /Explicit public excerpt/);
  assert.doesNotMatch(post.init.body, /PRIVATE_PROJECT_MARKER|Ambient private brief|NATIVE_DRAFT/);
  const tracked = readFileSync(path.join(x.dir, 'docs/architecture/council/synthetic/council.json'), 'utf8');
  assert.doesNotMatch(tracked, /kimi|PRIVATE_SYNTHETIC_DRAFT|privateReportPath/);
  assert.equal(r.manifest.total, 1); assert.equal(r.manifest.drafted, 1);
  assert.match(readFileSync(path.join(x.dir, 'docs/architecture/council/synthetic/draft-openrouter.md'), 'utf8'), /NATIVE_DRAFT/);
});

test('council requires both declaration and a separate extra envelope before any Kimi capability', async () => {
  for (const [projectMd, extraProfiles] of [['', [{ profile: 'kimi-readonly-v1', envelope: {} }]],
    [OPENROUTER_ONLY(), []], [OPENROUTER_ONLY(), [{ profile: 'kimi-readonly-v1' }]]]) {
    const x = extraRuntime();
    const r = await runCouncil({ root: x.dir, feature: 'synthetic', projectMd, env: ENV, askers: { openrouter: recorder('native').ask },
      extraProfiles, kimiRuntime: { get apiKey() { assert.fail('extra credential read'); }, fetchImpl: () => assert.fail('extra request') } });
    assert.equal(x.calls.length, 0);
    if (r.state === 'ran') assert.deepEqual(r.extraMembers, []);
  }
});

test('council extra root validation precedes credential lookup', async () => {
  const x = extraRuntime(), linked = path.join(x.dir, 'linked-operator'); symlinkSync(x.dir, linked);
  let keyReads = 0;
  const r = await runCouncil({ root: x.dir, feature: 'synthetic', projectMd: OPENROUTER_ONLY(),
    env: ENV, askers: { openrouter: recorder('native').ask },
    extraProfiles: [{ profile: 'kimi-readonly-v1', envelope: x.envelope }],
    kimiRuntime: { operatorRoot: linked, get apiKey() { keyReads++; return 'example-synthetic-key'; }, fetchImpl: x.runtime.fetchImpl } });
  assert.equal(keyReads, 0);
  assert.equal(r.extraMembers[0].state, 'skipped');
  assert.equal(x.calls.length, 0);
});

test('council does not eagerly spread an extra credential before source verification', async () => {
  const x = extraRuntime(); writeFileSync(path.join(x.dir, 'brief.md'), 'changed source');
  let keyReads = 0;
  const r = await runCouncil({ root: x.dir, feature: 'synthetic', projectMd: OPENROUTER_ONLY(),
    env: ENV, askers: { openrouter: recorder('native').ask }, extraProfiles: [{ profile: 'kimi-readonly-v1', envelope: x.envelope }],
    kimiRuntime: { operatorRoot: x.runtime.operatorRoot, fetchImpl: x.runtime.fetchImpl,
      get apiKey() { keyReads++; return 'example-synthetic-key'; } } });
  assert.equal(keyReads, 0);
  assert.equal(r.extraMembers[0].state, 'skipped');
  assert.equal(x.calls.length, 0);
});

test('extra council unavailable failed and denied outcomes remain distinct without native quorum changes', async () => {
  for (const [kind, expected] of [['unavailable', 'unavailable'], ['failed', 'failed'], ['denied', 'skipped']]) {
    const x = extraRuntime(), original = x.runtime.fetchImpl;
    const envelope = kind === 'denied' ? { ...x.envelope, contextClass: 'private' } : x.envelope;
    x.runtime.fetchImpl = async (url, init) => {
      if (kind === 'unavailable' && url.endsWith('/models')) return new Response('{"data":[]}', { status: 200 });
      if (kind === 'failed' && init.method === 'POST') return new Response('PRIVATE_ERROR_BODY', { status: 429 });
      return original(url, init);
    };
    const r = await runCouncil({ root: x.dir, feature: 'synthetic', projectMd: OPENROUTER_ONLY(), env: ENV,
      askers: { openrouter: recorder('native').ask }, extraProfiles: [{ profile: 'kimi-readonly-v1', envelope }], kimiRuntime: x.runtime });
    assert.equal(r.extraMembers[0].state, expected, JSON.stringify(r));
    assert.equal(r.extraMembers[0].verdict, null);
    assert.equal(r.manifest.total, 1); assert.equal(r.manifest.drafted, 1);
    assert.doesNotMatch(JSON.stringify(r), /PRIVATE_ERROR_BODY/);
  }
});

test('known-cost late extra remains failed and private without native council quorum changes', () => {
  const x = extraRuntime();
  const program = `
import fs from 'node:fs'; import path from 'node:path';
let text = ''; for await (const chunk of process.stdin) { text += chunk; if (Buffer.byteLength(text) > 131072) throw Error('fixture-input-too-large'); }
const {dir,envelope} = JSON.parse(text), operatorRoot = path.join(dir,'operator');
let elapsed = 0, posts = 0; Object.defineProperty(performance,'now',{value:()=>elapsed});
const rename = fs.renameSync; fs.renameSync = (...args)=> { const r=rename(...args); if(String(args[1]).endsWith('/report.json')) elapsed=1000; return r; };
const {runCouncil} = await import(process.argv[1]);
const model='moonshotai/kimi-k3.1-pro',canonical=model+'-20261023',tag='moonshotai/mxfp4';
const pricing={prompt:'0.000002',completion:'0.00001',input_cache_read:'0.0000002'},supported_parameters=['reasoning','max_tokens','structured_outputs','response_format'];
const metadata=[{data:[{id:model,canonical_slug:canonical,pricing,supported_parameters,reasoning:{supported_efforts:['low']}}]},
 {data:{id:model,endpoints:[{tag,provider_name:'Moonshot',name:'Moonshot | '+canonical,pricing,supported_parameters,status:0}]}},
 {data:[{model_id:model,tag,provider_name:'Moonshot'}]}];
const report={version:1,mode:'architecture-alternative',decision:'PRIVATE_LATE_DRAFT',alternatives:[
 {name:'Queue',mechanism:'Bounded queue.',tradeoff:'Storage.',failureMode:'Backlog.'},
 {name:'Direct',mechanism:'Synchronous.',tradeoff:'Latency.',failureMode:'Timeout.'}],risks:['Bound capacity.'],openQuestions:[]};
const result=await runCouncil({root:dir,feature:'late-extra',projectMd:'council: arch\\ncouncil-members: openrouter\\n',
 env:{OPENROUTER_API_KEY:'example-synthetic-key',GREAT_CTO_COUNCIL_MODEL:'anthropic/claude-sonnet-4'},
 askers:{openrouter:async()=>({state:'ok',text:'NATIVE_DRAFT',usage:null,model:'anthropic/claude-sonnet-4'})},
 extraProfiles:[{profile:'kimi-readonly-v1',envelope}],kimiRuntime:{operatorRoot,apiKey:'example-synthetic-key',now:()=>1792843200000,timeoutMs:1000,
 fetchImpl:async(url,init)=>{if(init.method==='POST')posts++;return new Response(JSON.stringify(init.method==='POST'
 ?{model,provider:'Moonshot',choices:[{finish_reason:'stop',message:{content:JSON.stringify(report)}}],usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:0},completion_tokens_details:{reasoning_tokens:0}}}
 :metadata[url.endsWith('/models')?0:url.endsWith('/endpoints/zdr')?2:1]));}}});
const extra=result.extraMembers[0],record=JSON.parse(fs.readFileSync(path.join(operatorRoot,'kimi-review-ledger.json'),'utf8')).requests[0];
console.log(JSON.stringify({result,posts,record,privateReport:JSON.parse(fs.readFileSync(extra.privateReportPath,'utf8')),
 tracked:fs.readFileSync(path.join(dir,'docs/architecture/council/late-extra/council.json'),'utf8')}));
`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program,
    new URL('../../scripts/lib/council.mjs', import.meta.url).href],
  { input: JSON.stringify({ dir: x.dir, envelope: x.envelope }), encoding: 'utf8', maxBuffer: 65536 });
  assert.equal(child.status, 0, child.stderr);
  const observed = JSON.parse(child.stdout), extra = observed.result.extraMembers[0];
  assert.equal(extra.state, 'failed'); assert.equal(extra.status, 'timeout'); assert.equal(extra.why, 'deadline-exceeded');
  assert.equal(extra.verdict, null); assert.equal(extra.cost.state, 'known');
  assert.ok(Math.abs(extra.cost.usd - 0.0004) < 1e-12); assert.ok(extra.privateReportPath);
  assert.equal(observed.record.state, 'complete'); assert.equal(observed.record.reservationUsd, 0); assert.equal(observed.posts, 1);
  assert.equal(observed.privateReport.decision, 'PRIVATE_LATE_DRAFT');
  assert.equal(observed.result.manifest.total, 1); assert.equal(observed.result.manifest.drafted, 1);
  assert.doesNotMatch(observed.tracked, /kimi|PRIVATE_LATE_DRAFT|privateReportPath/);
});
