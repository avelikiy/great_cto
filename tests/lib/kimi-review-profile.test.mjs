import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import failure is asserted explicitly so the initial RED names the missing API.
let api;
try { api = await import('../../scripts/lib/kimi-review-profile.mjs'); } catch {}
const hash = value => createHash('sha256').update(value).digest('hex');
const MODEL = 'moonshotai/kimi-k3.1-pro';
const CANONICAL = 'moonshotai/kimi-k3.1-pro-20261023';
const ENDPOINT = 'moonshotai/mxfp4';
const parameters = ['reasoning', 'max_tokens', 'structured_outputs', 'response_format'];
const pricing = { prompt: '0.000002', completion: '0.00001', input_cache_read: '0.0000002' };
const DIFF = 'diff --git a/src/sum.js b/src/sum.js\nindex abcdef0..abcdef1 100644\n--- a/src/sum.js\n+++ b/src/sum.js\n@@ -1,2 +1,2 @@\n-export const sum = (a, b) => a - b;\n+export const sum = (a, b) => a + b;\n export const name = "sum";\n';
const validReview = () => ({ version: 1, mode: 'diff-review', summary: 'The arithmetic change is consistent.', findings: [] });
const architecture = () => ({ version: 1, mode: 'architecture-alternative', decision: 'Prefer a queue.', alternatives: [
  { name: 'Queue', mechanism: 'Bounded durable queue.', tradeoff: 'Extra storage.', failureMode: 'Backlog growth.' },
  { name: 'Direct', mechanism: 'Synchronous call.', tradeoff: 'Lower latency.', failureMode: 'Caller timeout.' },
], risks: ['Backpressure must be bounded.'], openQuestions: [] });
const SOURCE = 'export const sum = (a, b) => a + b;\nexport const name = "sum";\n';
function envelope(overrides = {}) {
  const manifest = [{ path: 'src/sum.js', mode: '100644', sha256: hash(SOURCE), contextClass: 'synthetic' }];
  return { version: 1, taskId: 'synthetic-review', mode: 'diff-review', contextClass: 'synthetic', reason: 'explicit-review',
    diff: DIFF, spec: 'Use addition.', acceptanceHash: hash('rubric-v1'), sourceBinding: {
      sourceSha: 'a'.repeat(40), manifest, manifestHash: hash(JSON.stringify(manifest)), dirtyDiffHash: hash(DIFF),
    }, ...overrides };
}
function completion(result = validReview(), overrides = {}) {
  return { id: 'gen-synthetic', model: MODEL, provider: 'Moonshot', choices: [{ finish_reason: 'stop',
    message: { role: 'assistant', content: JSON.stringify(result) } }], usage: { prompt_tokens: 100, completion_tokens: 50,
      total_tokens: 150, prompt_tokens_details: { cached_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 10 }, cost: 0.000664 }, ...overrides };
}
function fixtures() {
  return [
    { data: [{ id: MODEL, canonical_slug: CANONICAL, pricing, supported_parameters: parameters,
      reasoning: { mandatory: false, default_enabled: true, supported_efforts: ['max', 'high', 'low', 'none'], default_effort: 'max' }, default_parameters: { top_p: 0.95 } }] },
    { data: { id: MODEL, name: 'Kimi', endpoints: [{ tag: ENDPOINT, provider_name: 'Moonshot', name: `Moonshot | ${CANONICAL}`, pricing, supported_parameters: parameters, status: 0 }] } },
    { data: [{ model_id: MODEL, tag: ENDPOINT, provider_name: 'Moonshot' }] },
  ];
}
async function runtime(t, response = completion(), modifyMetadata = null) {
  const dir = await mkdtemp(path.join(await realpath(tmpdir()), 'kimi-profile-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'repo'), { mode: 0o700 });
  await mkdir(path.join(dir, 'operator'), { mode: 0o700 });
  await mkdir(path.join(dir, 'repo/src'), { mode: 0o700 });
  await writeFile(path.join(dir, 'repo/src/sum.js'), SOURCE, { mode: 0o644 });
  const calls = [], metadata = fixtures();
  modifyMetadata?.(metadata);
  return { calls, dir, options: { profile: 'kimi-readonly-v1', envelope: envelope(), root: path.join(dir, 'repo'),
    operatorRoot: path.join(dir, 'operator'), apiKey: 'example-synthetic-key',
    uuid: () => '12345678-1234-4234-8234-123456789abc', now: () => 1792843200000,
    fetchImpl: async (url, options) => { calls.push({ url, options });
      const metadataIndex = url.endsWith('/models') ? 0 : url.endsWith('/endpoints/zdr') ? 2 : 1;
      return new Response(JSON.stringify(options.method === 'POST' ? response : metadata[metadataIndex]), { status: 200 }); },
  } };
}
function requireApi() { assert.ok(api, 'profile module must provide the approved callable API'); return api; }

test('explicit API is available and immutable', () => {
  const { KIMI_PROFILE, runKimiReview, buildKimiInputBinding, verifyKimiBinding } = requireApi();
  assert.equal(typeof runKimiReview, 'function'); assert.equal(typeof buildKimiInputBinding, 'function'); assert.equal(typeof verifyKimiBinding, 'function');
  assert.ok(Object.isFrozen(KIMI_PROFILE)); assert.ok(Object.isFrozen(KIMI_PROFILE.schemas));
});

test('absent profile performs no capability or key access', async () => {
  const options = { get apiKey() { assert.fail('key accessed'); }, get root() { assert.fail('root accessed'); },
    get fetchImpl() { assert.fail('fetch accessed'); } };
  const result = await requireApi().runKimiReview(options);
  assert.equal(result.status, 'not-requested'); assert.equal(result.verdict, null);
  assert.equal(result.authority, 'NONE'); assert.equal(result.releaseEligibility, 'NOT_CHECKED');
});

test('profile overrides and unsafe admission never reach metadata or storage', async () => {
  const { runKimiReview } = requireApi();
  const bad = [ { profile: 'other' }, { model: MODEL }, { provider: 'openrouter' },
    { envelope: envelope({ contextClass: 'private' }) }, { envelope: envelope({ contextClass: 'unknown' }) },
    { envelope: envelope({ regionRequirement: 'EU' }) }, { envelope: envelope({ spec: ['sk', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456'].join('-') }) },
    { envelope: envelope({ diff: DIFF.repeat(1000) }) }, { envelope: envelope({ acceptanceHash: 'bad' }) },
    { envelope: envelope({ sourceBinding: { ...envelope().sourceBinding, dirtyDiffHash: '0'.repeat(64) } }) },
    { envelope: envelope({ sourceBinding: { ...envelope().sourceBinding, manifestHash: '0'.repeat(64) } }) },
  ];
  for (const change of bad) {
    const r = await runKimiReview({ profile: 'kimi-readonly-v1', envelope: envelope(),
      fetchImpl: () => assert.fail('unsafe fetch'), ...change });
    assert.equal(r.status, 'policy-denied'); assert.equal(r.verdict, null);
  }
});

test('fresh pinned metadata and sole POST produce bound private advisory output', async t => {
  const { runKimiReview, verifyKimiBinding } = requireApi();
  const { options, calls } = await runtime(t);
  const result = await runKimiReview(options);
  assert.equal(result.status, 'complete', JSON.stringify(result)); assert.equal(result.verdict, 'PASS'); assert.equal(result.advisory, true);
  assert.equal(result.costState, 'known'); assert.ok(Math.abs(result.costUsd - 0.000664) < 1e-12);
  assert.equal(calls.length, 4); assert.equal(verifyKimiBinding(result, options.envelope), true);
  const post = calls[3], body = JSON.parse(post.options.body);
  assert.equal(post.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(post.options.redirect, 'error'); assert.equal(body.model, MODEL); assert.equal(body.max_tokens, 8192);
  assert.deepEqual(body.provider, { only: [ENDPOINT], allow_fallbacks: false, zdr: true, data_collection: 'deny', require_parameters: true, max_price: { prompt: 2, completion: 10 } });
  assert.deepEqual(body.reasoning, { effort: 'low', exclude: true }); assert.equal(body.response_format.json_schema.strict, true);
  for (const key of ['temperature', 'top_p', 'tools', 'tool_choice', 'plugins', 'transforms', 'stop']) assert.equal(Object.hasOwn(body, key), false);
  for (const call of calls.slice(0, 3)) assert.equal(call.options.headers?.Authorization, undefined);
  const persisted = await readFile(result.privateReportPath, 'utf8');
  assert.ok(persisted.includes('The arithmetic change')); assert.equal(persisted.includes('example-synthetic-key'), false);
  assert.equal(verifyKimiBinding({ ...result, verdict: 'BLOCK' }, options.envelope), false);
  assert.equal(verifyKimiBinding(result, envelope({ spec: 'changed rubric' })), false);
  assert.equal(verifyKimiBinding(result, envelope({ acceptanceHash: hash('rubric-v2') })), false);
});

test('metadata identity capability price and ZDR drift block inference', async t => {
  const { runKimiReview } = requireApi();
  for (const mutate of [ m => { m[0].data[0].canonical_slug = 'drift'; }, m => { m[1].data.endpoints[0].tag = 'other'; },
    m => { m[0].data[0].supported_parameters = []; }, m => { m[1].data.endpoints[0].pricing = { ...pricing, prompt: '0.000004' }; },
    m => { m[0].data[0].reasoning.supported_efforts = ['max']; }, m => { m[2].data = []; } ]) {
    const { options, calls } = await runtime(t, completion(), mutate);
    const result = await runKimiReview(options);
    assert.equal(result.status, 'unavailable'); assert.equal(result.verdict, null);
    assert.equal(calls.some(c => c.options.method === 'POST'), false);
  }
});

test('only strict complete JSON can become an advisory verdict', async t => {
  const { runKimiReview } = requireApi();
  const cases = [
    completion(validReview(), { choices: [] }), completion(validReview(), { error: { message: 'PRIVATE_ERROR_MARKER' } }),
    completion(validReview(), { model: 'wrong' }), completion(validReview(), { provider: 'other' }),
    ...['length', 'content_filter', 'tool_calls', null].map(finish_reason => completion(validReview(), { choices: [{ finish_reason, message: { content: JSON.stringify(validReview()) } }] })),
    completion({ ...validReview(), verdict: 'PASS' }), completion({ ...validReview(), findings: [{ file: '../escape', line: 1, side: 'new', severity: 'P0', issue: 'issue', evidence: 'x' }] }),
    completion(validReview(), { choices: [{ finish_reason: 'stop', message: { content: 'VERDICT: PASS' } }] }),
    completion(validReview(), { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validReview()), refusal: 'no' } }] }),
    completion(validReview(), { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(validReview()), tool_calls: [{ id: 'x' }] } }] }),
    completion(validReview(), { choices: [completion().choices[0], completion().choices[0]] }),
  ];
  for (const output of cases) {
    const { options, calls } = await runtime(t, output); const r = await runKimiReview(options);
    assert.notEqual(r.status, 'complete'); assert.equal(r.verdict, null); assert.equal(r.result, null);
    assert.equal(calls.length, 4);
    assert.equal(JSON.stringify(r).includes('PRIVATE_ERROR_MARKER'), false);
  }
});

test('literal new and old hunk evidence validate while invented quotes or line numbers invalidate', async t => {
  const { runKimiReview } = requireApi();
  for (const [side, line, evidence, wanted] of [ ['new', 1, 'export const sum = (a, b) => a + b;', 'complete'],
    ['old', 1, 'export const sum = (a, b) => a - b;', 'complete'], ['new', 22, 'export const sum', 'invalid'],
    ['new', 1, 'DROP DATABASE', 'invalid'] ]) {
    const output = { ...validReview(), findings: [{ file: 'src/sum.js', side, line, evidence, severity: 'P0', issue: 'Arithmetic regression.' }] };
    const { options } = await runtime(t, completion(output)); const r = await runKimiReview(options);
    assert.equal(r.status, wanted); assert.equal(r.verdict, wanted === 'complete' ? 'BLOCK' : null);
  }
});

test('architecture drafts retain alternatives and never acquire a verdict', async t => {
  const { runKimiReview } = requireApi(); const { options } = await runtime(t, completion(architecture()));
  options.envelope = envelope({ mode: 'architecture-alternative', reason: 'architecture-alternative', brief: 'Bound the work queue.', projectContext: 'A synthetic service.',
    sourceBinding: { ...envelope().sourceBinding, dirtyDiffHash: null } });
  const r = await runKimiReview(options); assert.equal(r.status, 'complete'); assert.equal(r.verdict, null);
  assert.equal(r.result.alternatives.length, 2);
});

test('missing partial negative usage remains Unknown and is never a free retry', async t => {
  const { runKimiReview } = requireApi();
  for (const usage of [undefined, {}, { prompt_tokens: 100, completion_tokens: 50 },
    { ...completion().usage, completion_tokens: -1 }]) {
    const { options, calls } = await runtime(t, completion(validReview(), { usage }));
    const r = await runKimiReview(options); assert.equal(r.costState, 'unknown'); assert.equal(r.costUsd, null);
    const retry = await runKimiReview({ ...options, uuid: () => '22345678-1234-4234-8234-123456789abc' });
    assert.equal(retry.status, 'budget-denied'); assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
  }
});

test('billing breach is recorded without clamping invoice to reserved amount', async t => {
  const { runKimiReview } = requireApi();
  const usage = { prompt_tokens: 100000, completion_tokens: 50000, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } };
  const { options } = await runtime(t, completion(validReview(), { usage }));
  const r = await runKimiReview(options); assert.equal(r.costState, 'breach'); assert.equal(r.costUsd, 0.7); assert.equal(r.verdict, null);
});

test('timeout aborts a possible POST and retains Unknown with no retry', async t => {
  const { runKimiReview } = requireApi(); const { options } = await runtime(t);
  const original = options.fetchImpl; let sent = 0, aborted = false;
  options.timeoutMs = 500;
  options.fetchImpl = async (url, init) => {
    if (init.method !== 'POST') return original(url, init);
    sent++;
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('PRIVATE_ERROR_MARKER')); }, { once: true }));
  };
  const r = await runKimiReview(options); assert.equal(r.status, 'timeout'); assert.equal(r.costState, 'unknown');
  assert.equal(aborted, true); assert.equal(sent, 1); assert.equal(JSON.stringify(r).includes('PRIVATE_ERROR_MARKER'), false);
});

test('body streaming deadline and response cap apply before JSON parsing', async t => {
  const { runKimiReview } = requireApi();
  for (const oversized of [true, false]) {
    const { options } = await runtime(t); const original = options.fetchImpl; let cancelled = false;
    options.timeoutMs = 500;
    options.fetchImpl = async (url, init) => {
      if (init.method !== 'POST') return original(url, init);
      return new Response(new ReadableStream({ start(controller) { if (oversized) controller.enqueue(new Uint8Array(262145)); }, cancel() { cancelled = true; } }));
    };
    const r = await runKimiReview(options); assert.equal(r.status, oversized ? 'invalid' : 'timeout');
    assert.equal(r.costState, 'unknown'); assert.equal(r.verdict, null); assert.equal(cancelled, true);
  }
});

test('caller cancellation blocks a request and malformed patches never send', async t => {
  const { runKimiReview } = requireApi(); const controller = new AbortController(); controller.abort();
  const { options, calls } = await runtime(t); const r = await runKimiReview({ ...options, signal: controller.signal });
  assert.notEqual(r.status, 'complete'); assert.equal(calls.length, 0);
  for (const diff of [DIFF.replace('@@ -1,2 +1,2 @@', '@@ -1,20 +1,20 @@'), DIFF + 'GIT binary patch\n', DIFF.replace('src/sum.js', '../unsafe')]) {
    const e = envelope({ diff }); e.sourceBinding = { ...e.sourceBinding, dirtyDiffHash: hash(diff) };
    const denied = await runKimiReview({ profile: 'kimi-readonly-v1', envelope: e, fetchImpl: () => assert.fail('invalid patch fetched') });
    assert.equal(denied.status, 'policy-denied');
  }
});

test('all manifest and UTF8 admission refusals precede key access', async () => {
  const { runKimiReview, buildKimiInputBinding } = requireApi();
  for (const pathValue of ['.env', 'src/.env.local', '.git/config', '/etc/passwd', 'src/../secret', 'C:/private', 'src\\private', 'src/\u0000private']) {
    const e = envelope(); e.sourceBinding.manifest[0].path = pathValue;
    e.sourceBinding.manifestHash = hash(JSON.stringify(e.sourceBinding.manifest));
    assert.throws(() => buildKimiInputBinding(e));
    const r = await runKimiReview({ profile: 'kimi-readonly-v1', envelope: e, get apiKey() { assert.fail('key accessed'); } });
    assert.equal(r.status, 'policy-denied');
  }
  const e = envelope({ mode: 'architecture-alternative', brief: '漢'.repeat(24000), projectContext: '',
    sourceBinding: { ...envelope().sourceBinding, dirtyDiffHash: null } });
  const r = await runKimiReview({ profile: 'kimi-readonly-v1', envelope: e, get apiKey() { assert.fail('key accessed'); } });
  assert.equal(r.status, 'policy-denied'); assert.equal(r.reasonCode, 'input-byte-limit');
});

test('deletion and proven rename accept only their literal mapped hunk side', async t => {
  const { runKimiReview } = requireApi();
  const patches = [
    { diff: 'diff --git a/src/sum.js b/src/sum.js\ndeleted file mode 100644\nindex abcdef0..0000000\n--- a/src/sum.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-obsolete();\n', side: 'old', evidence: 'obsolete();' },
    { diff: 'diff --git a/src/old.js b/src/sum.js\nsimilarity index 50%\nrename from src/old.js\nrename to src/sum.js\nindex abcdef0..abcdef1 100644\n--- a/src/old.js\n+++ b/src/sum.js\n@@ -1 +1 @@\n-old();\n+next();\n', side: 'new', evidence: 'next();', oldPath: 'src/old.js' },
  ];
  for (const patch of patches) {
    const { options } = await runtime(t, completion({ ...validReview(), findings: [{ file: 'src/sum.js', line: 1, side: patch.side, evidence: patch.evidence, severity: 'P1', issue: 'Check the caller.' }] }));
    const e = envelope({ diff: patch.diff }); e.sourceBinding.dirtyDiffHash = hash(patch.diff);
    if (patch.oldPath) e.sourceBinding.manifest[0].oldPath = patch.oldPath;
    const sourceBytes = patch.oldPath ? 'next();\n' : 'obsolete();\n';
    e.sourceBinding.manifest[0].sha256 = hash(sourceBytes);
    if (patch.oldPath) await writeFile(path.join(options.root, 'src/sum.js'), sourceBytes);
    else await rm(path.join(options.root, 'src/sum.js'));
    e.sourceBinding.manifestHash = hash(JSON.stringify(e.sourceBinding.manifest)); options.envelope = e;
    const r = await runKimiReview(options); assert.equal(r.status, 'complete', r.reasonCode);
  }
});

test('malformed JSON is invalid and an echoed credential is never a report', async t => {
  const { runKimiReview } = requireApi();
  for (const raw of ['{"bad":', JSON.stringify(completion(validReview(), { choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] }))]) {
    const { options } = await runtime(t); const original = options.fetchImpl;
    options.fetchImpl = (url, init) => init.method === 'POST' ? new Response(raw) : original(url, init);
    const r = await runKimiReview(options); assert.equal(r.status, 'invalid'); assert.equal(r.verdict, null);
  }
  const { options } = await runtime(t, completion({ ...validReview(), summary: 'example-synthetic-key' }));
  const r = await runKimiReview(options); assert.equal(r.status, 'invalid'); assert.equal(r.result, null);
  assert.equal(JSON.stringify(r).includes('example-synthetic-key'), false);
});

test('elapsed preflight deadline prevents POST even before the timer callback runs', async t => {
  const { runKimiReview } = requireApi(); const { options, calls } = await runtime(t);
  let instant = 1792843200000; options.now = () => instant; options.timeoutMs = 1000;
  const original = options.fetchImpl;
  options.fetchImpl = (url, init) => { instant += 1001; return original(url, init); };
  const r = await runKimiReview(options); assert.equal(r.status, 'timeout');
  assert.equal(calls.filter(c => c.options.method === 'POST').length, 0); assert.equal(r.costState, 'not-incurred');
});

test('HTTP errors and post-send evidence failures return safe Unknown without retry', async t => {
  const { runKimiReview } = requireApi();
  for (const failure of ['http', 'evidence']) {
    const { options, calls, dir } = await runtime(t); const original = options.fetchImpl;
    options.fetchImpl = async (url, init) => {
      if (init.method !== 'POST') return original(url, init);
      if (failure === 'http') { calls.push({ url, options: init }); return new Response('PRIVATE_PROVIDER_BODY_MARKER', { status: 500 }); }
      await symlink(path.join(dir, 'outside-report.json'), path.join(options.root, '.great_cto/kimi-review', hash(options.envelope.taskId), options.uuid(), 'report.json'));
      return original(url, init);
    };
    const r = await runKimiReview(options); assert.equal(r.status, 'failed'); assert.equal(r.costState, 'unknown'); assert.equal(r.verdict, null);
    assert.equal(r.privateReportPath, null); assert.equal(JSON.stringify(r).includes('PRIVATE_PROVIDER_BODY_MARKER'), false);
    const retry = await runKimiReview({ ...options, uuid: () => '32345678-1234-4234-8234-123456789abc' });
    assert.equal(retry.status, 'budget-denied'); assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
  }
});

test('source symlinks changed blobs modes and unrelated new hunk bytes cannot be sent', async t => {
  const { runKimiReview } = requireApi();
  for (const mutation of ['symlink', 'hash', 'mode', 'unrelated']) {
    const { options, calls, dir } = await runtime(t); const sourcePath = path.join(options.root, 'src/sum.js');
    if (mutation === 'symlink') { await rm(sourcePath); await symlink(path.join(dir, 'outside.js'), sourcePath); }
    if (mutation === 'hash') await writeFile(sourcePath, 'changed source');
    if (mutation === 'mode') await chmod(sourcePath, 0o755);
    if (mutation === 'unrelated') {
      await writeFile(sourcePath, 'unrelated();\n'); options.envelope.sourceBinding.manifest[0].sha256 = hash('unrelated();\n');
      options.envelope.sourceBinding.manifestHash = hash(JSON.stringify(options.envelope.sourceBinding.manifest));
    }
    Object.defineProperty(options, 'apiKey', { get() { assert.fail('source denial accessed credential'); } });
    const r = await runKimiReview(options); assert.equal(r.status, 'policy-denied', mutation); assert.equal(calls.length, 0);
  }
});

test('source freshness is rechecked after metadata and after a possible send', async t => {
  const { runKimiReview } = requireApi();
  for (const phase of ['metadata', 'post']) {
    const { options, calls } = await runtime(t); const original = options.fetchImpl; let changed = false;
    options.fetchImpl = async (url, init) => {
      if (!changed && (phase === 'metadata' ? init.method === 'GET' : init.method === 'POST')) {
        changed = true; await writeFile(path.join(options.root, 'src/sum.js'), 'changed after admission\n');
      }
      return original(url, init);
    };
    const r = await runKimiReview(options); assert.notEqual(r.status, 'complete'); assert.equal(r.verdict, null);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, phase === 'post' ? 1 : 0);
  }
});

test('output controls are rejected and accounting survives an invalid advisory schema', async t => {
  const { runKimiReview } = requireApi();
  for (const output of [{ ...validReview(), summary: '\u001b[31mforged status' }, { ...validReview(), verdict: 'PASS' }]) {
    const { options } = await runtime(t, completion(output)); const r = await runKimiReview(options);
    assert.equal(r.status, 'invalid'); assert.equal(r.verdict, null); assert.equal(r.result, null);
    assert.equal(r.usageState, 'known'); assert.equal(r.costState, 'known'); assert.ok(r.costUsd > 0);
  }
});

test('deleted new and index patch modes must agree with the declared source mode', async () => {
  const { runKimiReview, buildKimiInputBinding } = requireApi();
  const patches = [
    { diff: 'diff --git a/src/sum.js b/src/sum.js\ndeleted file mode 100755\nindex abcdef0..0000000\n--- a/src/sum.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-obsolete();\n', bytes: 'obsolete();\n' },
    { diff: 'diff --git a/src/sum.js b/src/sum.js\nnew file mode 100755\nindex 0000000..abcdef1\n--- /dev/null\n+++ b/src/sum.js\n@@ -0,0 +1 @@\n+next();\n', bytes: 'next();\n' },
    { diff: DIFF.replace('index abcdef0..abcdef1 100644', 'index abcdef0..abcdef1 100755'), bytes: SOURCE },
    { diff: DIFF.replace('index abcdef0..abcdef1 100644', 'old mode 100755\nnew mode 100755\nindex abcdef0..abcdef1'), bytes: SOURCE },
  ];
  for (const fixture of patches) {
    const e = envelope({ diff: fixture.diff }); e.sourceBinding.dirtyDiffHash = hash(fixture.diff);
    e.sourceBinding.manifest[0].sha256 = hash(fixture.bytes); e.sourceBinding.manifestHash = hash(JSON.stringify(e.sourceBinding.manifest));
    assert.throws(() => buildKimiInputBinding(e), /mode/);
    const r = await runKimiReview({ profile: 'kimi-readonly-v1', envelope: e, get apiKey() { assert.fail('mode mismatch accessed credential'); }, fetchImpl: () => assert.fail('mode mismatch fetched') });
    assert.equal(r.status, 'policy-denied'); assert.equal(r.verdict, null);
  }
});

test('raw selected fields deny quoted assignments before credential and HTTP access', async t => {
  const { runKimiReview, buildKimiInputBinding } = requireApi();
  const canary = randomBytes(24).toString('hex');
  const assignments = [
    `api_key = ${canary}`, `api_key = "${canary}"`, `api_key = '${canary}'`,
    'api_key = ' + String.fromCharCode(96) + canary + String.fromCharCode(96),
    JSON.stringify({ password: canary }), JSON.stringify({ password: canary }).replaceAll('"', '\\"'),
    `"access_token" : '${canary}'`,
  ];
  for (const field of ['diff', 'spec', 'brief', 'projectContext']) for (const assignment of assignments) {
    const { options, calls } = await runtime(t); const e = envelope(); let keyReads = 0;
    if (field === 'diff') {
      e.diff = DIFF.replace('+export const sum = (a, b) => a + b;', `+${assignment}`);
      const bytes = `${assignment}\nexport const name = "sum";\n`;
      await writeFile(path.join(options.root, 'src/sum.js'), bytes);
      e.sourceBinding.manifest[0].sha256 = hash(bytes); e.sourceBinding.dirtyDiffHash = hash(e.diff);
      e.sourceBinding.manifestHash = hash(JSON.stringify(e.sourceBinding.manifest));
    } else if (field === 'spec') e.spec = assignment;
    else { e.mode = 'architecture-alternative'; e.reason = 'architecture-alternative';
      e.brief = 'A synthetic queue.'; e.projectContext = 'Explicit synthetic context.';
      e[field] = assignment; e.sourceBinding.dirtyDiffHash = null;
    }
    options.envelope = e;
    Object.defineProperty(options, 'apiKey', { get() { keyReads++; return 'example-synthetic-key'; } });
    const r = await runKimiReview(options);
    assert.equal(r.reasonCode, 'secret-detected', `${field}: quoted raw assignment must be denied`);
    assert.equal(r.status, 'policy-denied'); assert.equal(r.verdict, null); assert.equal(keyReads, 0); assert.equal(calls.length, 0);
    assert.throws(() => buildKimiInputBinding(e), /secret-detected/);
  }
});

function deletedEnvelope(file = 'src/sum.js', start = 1, expectedBytes = 'obsolete();\n') {
  const diff = `diff --git a/${file} b/${file}\ndeleted file mode 100644\nindex abcdef0..0000000\n--- a/${file}\n+++ /dev/null\n@@ -${start} +0,0 @@\n-obsolete();\n`;
  const e = envelope({ diff }); e.sourceBinding.manifest[0].path = file;
  e.sourceBinding.manifest[0].sha256 = hash(expectedBytes); e.sourceBinding.dirtyDiffHash = hash(diff);
  e.sourceBinding.manifestHash = hash(JSON.stringify(e.sourceBinding.manifest)); return e;
}

test('full hash verified deletions allow missing parent suffixes', async t => {
  const { runKimiReview } = requireApi();
  for (const missing of ['src', 'src/gone', 'src/gone/deep']) {
    const { options } = await runtime(t);
    await rm(path.join(options.root, 'src'), { recursive: true, force: true });
    if (missing !== 'src') await mkdir(path.join(options.root, 'src'), { mode: 0o700 });
    if (missing === 'src/gone/deep') await mkdir(path.join(options.root, 'src/gone'), { mode: 0o700 });
    options.envelope = deletedEnvelope(`${missing}/last.js`);
    const r = await runKimiReview(options);
    assert.equal(r.status, 'complete', `${missing}: ${r.reasonCode}`); assert.equal(r.verdict, 'PASS');
  }
});

test('missing deletion parents never bypass existing symlinks non-directories or hash proof', async t => {
  const { runKimiReview } = requireApi();
  for (const problem of ['symlink', 'non-directory', 'partial', 'wrong-hash', 'not-deleted']) {
    const { options, calls, dir } = await runtime(t);
    await rm(path.join(options.root, 'src'), { recursive: true, force: true });
    if (problem === 'symlink') await symlink(path.join(dir, 'missing-outside'), path.join(options.root, 'src'));
    if (problem === 'non-directory') await writeFile(path.join(options.root, 'src'), 'not a directory');
    options.envelope = problem === 'not-deleted' ? envelope()
      : deletedEnvelope('src/gone/last.js', problem === 'partial' ? 2 : 1, problem === 'wrong-hash' ? 'different bytes' : 'obsolete();\n');
    const r = await runKimiReview(options); assert.equal(r.status, 'policy-denied', problem); assert.equal(calls.length, 0);
  }
});

test('one-byte streams copy UTF8 correctly without one Buffer allocation per fragment', t => {
  const first = fixtures()[0]; first.padding = 'fragmented '.repeat(6000) + '漢💡';
  const rawMetadata = JSON.stringify(first);
  // Instrument allocation only in a dedicated process; no shared runner global is patched.
  const staticFixturePath = fileURLToPath(new URL('../fixtures/kimi-fragment-child.mjs', import.meta.url));
  const input = JSON.stringify({ envelope: envelope(), metadata: fixtures(), rawMetadata, source: SOURCE, completion: completion() });
  assert.ok(Buffer.byteLength(input) <= 131072, 'synthetic fixture input must fit its explicit byte cap');
  const child = spawnSync(process.execPath, [staticFixturePath], { input, encoding: 'utf8', maxBuffer: 65536 });
  assert.equal(child.status, 0, child.stderr); const observed = JSON.parse(child.stdout);
  assert.equal(observed.status, 'complete'); assert.equal(observed.metadataHash, hash(rawMetadata));
  assert.equal(observed.reads, Buffer.byteLength(rawMetadata)); assert.equal(observed.keyReads, 1);
  assert.ok(observed.fragmentAllocations < 64, `retained-fragment copy path allocated ${observed.fragmentAllocations} Buffers`);
  t.diagnostic(JSON.stringify({ metadataBytes: Buffer.byteLength(rawMetadata), reads: observed.reads,
    fragmentBufferCopies: observed.fragmentAllocations, metadataHashMatches: observed.metadataHash === hash(rawMetadata) }));
  const oversized = spawnSync(process.execPath, [staticFixturePath], { input: ' '.repeat(131073), encoding: 'utf8', maxBuffer: 65536 });
  assert.notEqual(oversized.status, 0); assert.match(oversized.stderr, /fixture-input-too-large/);
});

// Isolate clock/fs instrumentation; fixture data crosses stdin, never program text.
const finalizationChild = `
import fs from 'node:fs';
import path from 'node:path';
let input = '';
for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 131072) throw Error('fixture-input-too-large'); }
const c = JSON.parse(input), calls = [], states = [];
let elapsed = 0, deadlineDelay = null;
Object.defineProperty(performance, 'now', { value: () => elapsed });
const schedule = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => { deadlineDelay ??= delay; return schedule(callback, delay, ...args); };
const controller = new AbortController(), rename = fs.renameSync;
fs.renameSync = (...args) => {
  const result = rename(...args);
  if (String(args[1]).endsWith('/report.json')) {
    elapsed = c.elapsed;
    if (c.cancel) controller.abort();
  }
  if (String(args[1]).endsWith('/kimi-review-ledger.json')) {
    states.push(JSON.parse(fs.readFileSync(args[1], 'utf8')).requests[0].state);
  }
  return result;
};
const {runKimiReview, verifyKimiBinding} = await import(process.argv[1]);
const options = { profile: 'kimi-readonly-v1', root: c.root, operatorRoot: c.operatorRoot,
  get envelope() { if (c.prepareDelay) elapsed = c.prepareDelay; return c.envelope; },
  apiKey: 'example-synthetic-key', uuid: () => '12345678-1234-4234-8234-123456789abc',
  now: () => 1792843200000, signal: controller.signal, timeoutMs: 1000,
  fetchImpl: async (url, init) => {
    calls.push(init.method);
    return new Response(JSON.stringify(init.method === 'POST' ? c.response : c.metadata[url.endsWith('/models') ? 0 : url.endsWith('/endpoints/zdr') ? 2 : 1]));
  } };
const result = await runKimiReview(options);
const metadata = result.privateReportPath ? JSON.parse(fs.readFileSync(path.join(path.dirname(result.privateReportPath), 'metadata.json'), 'utf8')) : null;
const report = result.privateReportPath ? JSON.parse(fs.readFileSync(result.privateReportPath, 'utf8')) : null;
const ledgerFile = path.join(c.operatorRoot, 'kimi-review-ledger.json');
const record = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, 'utf8')).requests[0] : null;
console.log(JSON.stringify({ result, metadata, report, record, states, deadlineDelay, posts: calls.filter(method => method === 'POST').length,
  normalizedPresent: Object.hasOwn(result, 'normalizedReview'), bindingValid: verifyKimiBinding(result, c.envelope) }));
`;

async function finalization(t, changes = {}) {
  const { options } = await runtime(t);
  const data = { root: options.root, operatorRoot: options.operatorRoot, envelope: options.envelope,
    metadata: fixtures(), response: completion(), elapsed: 999, ...changes };
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', finalizationChild,
    new URL('../../scripts/lib/kimi-review-profile.mjs', import.meta.url).href],
  { input: JSON.stringify(data), encoding: 'utf8', maxBuffer: 65536 });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test('final direct clock sample rejects equal and expired deadlines after one durable settlement', async t => {
  for (const elapsed of [999, 1000, 1001]) {
    const x = await finalization(t, { elapsed });
    assert.equal(x.result.status, elapsed === 999 ? 'complete' : 'timeout');
    assert.equal(x.result.verdict, elapsed === 999 ? 'PASS' : null);
    assert.equal(x.bindingValid, elapsed === 999);
    assert.equal(x.result.costState, 'known'); assert.equal(x.record.costState, 'known');
    assert.equal(x.record.reservationUsd, 0); assert.equal(x.posts, 1);
    assert.equal(x.states.filter(state => state === 'Unknown').length, 1);
    assert.equal(x.states.filter(state => state === 'complete').length, 1);
    assert.equal(x.metadata.status, 'validated'); assert.equal(x.metadata.reasonCode, 'response-validated');
    assert.equal(x.metadata.evidenceVersion, 2); assert.equal(x.metadata.callerOutcome, 'not-recorded');
    assert.equal(x.metadata.responseState, 'validated'); assert.deepEqual(x.report, validReview());
    if (elapsed >= 1000) {
      assert.equal(x.result.reasonCode, 'deadline-exceeded'); assert.equal(x.result.result, null);
      assert.equal(x.normalizedPresent, false);
    }
    const { terminalHash, ...returned } = x.result;
    assert.equal(terminalHash, hash(JSON.stringify(returned)));
  }
});

test('caller cancellation during durable finish suppresses advice without another finish', async t => {
  for (const elapsed of [999, 1000]) {
    const x = await finalization(t, { elapsed, cancel: true });
    assert.equal(x.result.status, elapsed === 999 ? 'failed' : 'timeout');
    assert.equal(x.result.reasonCode, elapsed === 999 ? 'caller-cancelled' : 'deadline-exceeded');
    assert.equal(x.result.verdict, null); assert.equal(x.result.result, null); assert.equal(x.normalizedPresent, false);
    assert.equal(x.result.costState, 'known'); assert.ok(x.result.privateReportPath);
    assert.equal(x.states.filter(state => state === 'Unknown').length, 1);
    assert.equal(x.record.state, 'complete'); assert.equal(x.posts, 1);
  }
});

test('deadline begins before envelope preparation and cannot grant a late POST', async t => {
  const x = await finalization(t, { prepareDelay: 1001 });
  assert.equal(x.result.status, 'timeout'); assert.equal(x.result.verdict, null);
  assert.equal(x.posts, 0); assert.equal(x.record, null);
});

test('transport cancellation timer uses the invocation deadline remaining after preparation', async t => {
  const x = await finalization(t, { prepareDelay: 900, elapsed: 999 });
  assert.equal(x.deadlineDelay, 100);
});

test('late validated evidence preserves breach authority and Unknown holds', async t => {
  for (const [usage, costState, reserve] of [[{ ...completion().usage, cost: 0.3 }, 'breach', 0],
    [null, 'Unknown', 0.25]]) {
    const x = await finalization(t, { elapsed: 1001, response: completion(validReview(), { usage }) });
    assert.equal(x.result.status, costState === 'breach' ? 'failed' : 'timeout');
    assert.equal(x.result.reasonCode, costState === 'breach' ? 'budget-breach' : 'deadline-exceeded');
    assert.equal(x.record.costState, costState); assert.equal(x.record.reservationUsd, reserve);
    assert.ok(x.metadata, 'validated report must retain a private evidence reference even on breach');
    assert.equal(x.metadata.responseState, 'validated'); assert.deepEqual(x.report, validReview());
    assert.equal(x.result.verdict, null); assert.equal(x.result.result, null); assert.equal(x.normalizedPresent, false);
  }
});

test('timely architecture evidence is validated and retains a null caller verdict', async t => {
  const e = envelope({ mode: 'architecture-alternative', reason: 'architecture-alternative', brief: 'Bound work.', projectContext: 'Synthetic.',
    sourceBinding: { ...envelope().sourceBinding, dirtyDiffHash: null } });
  const x = await finalization(t, { envelope: e, response: completion(architecture()) });
  assert.equal(x.result.status, 'complete'); assert.equal(x.result.verdict, null);
  assert.equal(x.metadata.status, 'validated'); assert.equal(x.metadata.validatedElapsedMs, 0);
  assert.deepEqual(x.report, architecture());
});
