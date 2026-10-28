// The cross-model reviewer, with Codex as a provider and a third exit code.
//
// Before this, a missing OPENROUTER_API_KEY exited 1 — the BLOCK code. "The
// review blocked this" and "the review did not happen" were the same number.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decideProvider, reviewLogLine, EXIT } from '../../scripts/lib/cross-model-review.mjs';
import { reviewInputBinding } from '../../scripts/lib/review-contract.mjs';

const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/lib/cross-model-review.mjs');
const AVAILABLE = { state: 'available', version: '0.153.4', auth: 'chatgpt', model: 'gpt-5.6-terra', why: '' };

test('--provider wins, then PROJECT.md — and each says which', () => {
  const md = 'capabilities:\n  second_opinion: codex\n';
  assert.equal(decideProvider({ argv: ['--provider', 'openrouter'], projectMd: md, env: { OPENROUTER_API_KEY: 'k' } }).source, '--provider');
  const p = decideProvider({ projectMd: md, codex: AVAILABLE, env: {} });
  assert.equal(p.provider, 'codex'); assert.equal(p.source, 'PROJECT.md');
  assert.equal(decideProvider({ projectMd: '', env: {} }).state, 'undeclared');
});

// CSO SEC-2 (27.10): an exported key used to choose the provider when the project
// had not, and the diff left the machine without anyone deciding it should.
test('an OpenRouter key alone does not send the diff anywhere: undeclared stays undeclared', () => {
  const e = decideProvider({ projectMd: '', env: { OPENROUTER_API_KEY: 'k' } });
  assert.equal(e.state, 'undeclared'); assert.equal(e.provider, null);
  assert.match(e.why, /second_opinion: openrouter/, 'the skip line names the declaration that would enable it');
  const declared = decideProvider({ projectMd: 'capabilities:\n  second_opinion: openrouter\n', env: { OPENROUTER_API_KEY: 'k' } });
  assert.equal(declared.state, 'declared'); assert.equal(declared.provider, 'openrouter');
});

test('the exit codes are three distinct numbers, and SKIPPED is not PASS', () => {
  assert.equal(EXIT.PASS, 0); assert.equal(EXIT.BLOCK, 1); assert.equal(EXIT.SKIPPED, 3);
  assert.equal(new Set(Object.values(EXIT)).size, Object.keys(EXIT).length);
});

test('the log line carries provider, state, verdict and the P0 count', () => {
  const l = JSON.parse(reviewLogLine({ provider: 'codex', model: 'm', state: 'ok', verdict: 'BLOCK', findings: [{ severity: 'P0' }, { severity: 'P2' }], cost: 0.01, source: 'PROJECT.md' }));
  assert.equal(l.findings, 2); assert.equal(l.p0, 1); assert.equal(l.verdict, 'BLOCK');
  const skipped = JSON.parse(reviewLogLine({ provider: 'codex', state: 'unavailable', findings: null }));
  assert.equal(skipped.findings, null, 'a skipped review has no finding count, not zero');
});

const projectRoots = new Set();
after(() => {
  for (const dir of projectRoots) rmSync(dir, { recursive: true, force: true });
});

function project(withMd) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-xr-'));
  projectRoots.add(dir);
  mkdirSync(path.join(dir, '.great_cto'));
  if (withMd) writeFileSync(path.join(dir, '.great_cto', 'PROJECT.md'), withMd);
  return dir;
}
function fakeCodex(dir, lines) {
  const bin = path.join(dir, 'codex');
  const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
  const body = lines.map((t) => `printf '%s\\n' ${quote(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: t } }))}`).join('\n');
  writeFileSync(bin, `#!/bin/sh\ncat >/dev/null\n${body}\necho '{"type":"turn.completed","usage":{"input_tokens":5,"output_tokens":1}}'\n`);
  chmodSync(bin, 0o755);
  return bin;
}
function run(dir, extra = [], env = {}, diffText = '--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-1\n+2\n') {
  const diff = path.join(dir, 'd.diff'); writeFileSync(diff, diffText);
  return spawnSync('node', [SCRIPT, '--diff', diff, '--root', dir, ...extra], { encoding: 'utf8', env: { ...process.env, OPENROUTER_API_KEY: '', ...env } });
}

test('codex declared: the review runs through the fake codex and a P0 blocks', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['x.js:1 | P0 | drops the table', 'VERDICT: BLOCK']) });
  assert.equal(r.status, EXIT.BLOCK, r.stdout + r.stderr);
  assert.match(r.stdout, /P0 x\.js:1/);
  const log = readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(log.at(-1).provider, 'codex'); assert.equal(log.at(-1).verdict, 'BLOCK'); assert.equal(log.at(-1).p0, 1);
});

test('nothing declared and no key: SKIPPED with its own exit code, and the log says undeclared', () => {
  const dir = project('capabilities:\n  logs: loki\n');
  const r = run(dir);
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  assert.match(r.stdout, /SKIPPED \(undeclared\)/);
  assert.match(r.stdout, /not declared is not none/);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.state, 'undeclared'); assert.equal(last.verdict, null);
});

test('nothing declared but a key exported: still SKIPPED, the diff is not sent', () => {
  const dir = project('capabilities:\n  logs: loki\n');
  const r = run(dir, [], { OPENROUTER_API_KEY: 'example-synthetic-key', HTTPS_PROXY: 'http://127.0.0.1:9' });
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  assert.match(r.stdout, /SKIPPED \(undeclared\)/);
  assert.match(r.stdout, /second_opinion: openrouter/);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.state, 'undeclared'); assert.equal(last.provider, null); assert.equal(last.cost, null);
});

test('codex declared but the binary is dead: SKIPPED, not PASS and not BLOCK', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: '/nonexistent/codex' });
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  assert.match(r.stdout, /SKIPPED/);
});

test('second_opinion: none is honoured as a decision — SKIPPED (none), no provider consulted', () => {
  const dir = project('capabilities:\n  second_opinion: none\n');
  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: '/nonexistent/codex' });
  assert.equal(r.status, EXIT.SKIPPED);
  assert.match(r.stdout, /SKIPPED \(none\)/);
});

test('an unpriced model logs cost null and prints "unpriced" — never $0', () => {
  // The fake codex reports usage; the model it claims is not in the price
  // table. The first real run logged 0 here.
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, ['--model', 'gpt-5.6-terra'], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['VERDICT: PASS']) });
  assert.equal(r.status, EXIT.PASS, r.stdout + r.stderr);
  assert.match(r.stdout, /cost unpriced/);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.cost, null);
  assert.equal(last.model, 'gpt-5.6-terra');
});

test('legacy Kimi selection cannot coerce incomplete provider usage to measured zero', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, ['--model', 'moonshotai/kimi-k3.1-pro'], {
    GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['VERDICT: PASS']), GREAT_CTO_MODEL_PRICES: '{}',
  });
  assert.equal(r.status, EXIT.PASS, r.stdout + r.stderr);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.cost, null);
  assert.match(r.stdout, /cost unpriced/);
});

test('explicit profile conflicts exit before ambient PROJECT or native reviewer log', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, ['--profile', 'kimi-readonly-v1', '--provider', 'codex'], {
    GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['VERDICT: PASS']),
  });
  assert.equal(r.status, EXIT.USAGE, r.stdout + r.stderr);
  assert.equal(existsSync(path.join(dir, '.great_cto', 'cross-review.log')), false);
});

// A review that did not happen must say WHY, and the why must be the cause —
// not whatever the provider happened to mention first. On 2026-09-06 an
// exhausted plan quota displayed "Skill descriptions were shortened to fit the
// skills context budget", so the reader is sent to disable skills over a
// problem that fixes itself on a date the real message names.
test('the skipped reason is the ranked cause, not the first message, and the log carries its kind', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  // The stream is written to a file and the fake codex cats it. Building it as
  // shell `printf` arguments broke on the apostrophe in "You've" — the fixture
  // failed while the product was correct, which is the worst way for a test to
  // fail.
  const noise = 'Skill descriptions were shortened to fit the skills context budget. Codex can still see every skill.';
  const cause = "You've hit your usage limit. Upgrade to Plus to continue using Codex, or try again at Oct 5th, 2026 9:41 AM.";
  const stream = path.join(dir, 'stream.jsonl');
  writeFileSync(stream, [noise, cause]
    .map((message) => JSON.stringify({ type: 'item.completed', item: { type: 'error', message } }))
    .join('\n') + '\n');
  const bin = path.join(dir, 'codex');
  writeFileSync(bin, `#!/bin/sh\ncat >/dev/null\ncat ${stream}\n`);
  chmodSync(bin, 0o755);

  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: bin });
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  assert.match(r.stdout, /quota:/, 'names the kind');
  assert.match(r.stdout, /Oct 5th, 2026/, 'and the date the reader actually needs');
  const headline = r.stdout.split('\n').find((l) => l.includes('SKIPPED')) ?? '';
  assert.doesNotMatch(headline, /Skill descriptions/, 'the advisory noise is not presented as the cause');
  assert.match(r.stdout, /other message\(s\) from codex, not the cause/, 'but it is not hidden either');

  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.error_kind, 'quota');
  assert.equal(last.resets_at, 'Oct 5th, 2026 9:41 AM');
  assert.equal(last.verdict, null, 'still no verdict — a skipped review has none');
});

test('CLI logs the exact submitted inputs without silently clipping them', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const r = run(dir, [], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['VERDICT: PASS']) });
  assert.equal(r.status, EXIT.PASS, r.stdout + r.stderr);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  const expected = reviewInputBinding({ diff: readFileSync(path.join(dir, 'd.diff'), 'utf8') });
  assert.deepEqual(last.review_input, expected);
});

test('CLI cannot approve an empty or truncated diff and does not launch reviewer', () => {
  for (const diff of ['', 'x'.repeat(24001)]) {
    const dir = project('capabilities:\n  second_opinion: codex\n');
    const r = run(dir, [], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['VERDICT: PASS']) }, diff);
    assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
    const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
    assert.equal(last.verdict, null);
    assert.equal(last.error_kind, diff ? 'input-too-large' : 'empty-diff');
  }
});

test('CLI cannot approve an over-limit specification', () => {
  const dir = project('capabilities:\n  second_opinion: codex\n');
  const spec = path.join(dir, 'spec.md');
  writeFileSync(spec, 'x'.repeat(4001));
  const r = run(dir, ['--spec', spec], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, ['VERDICT: PASS']) });
  assert.equal(r.status, EXIT.SKIPPED, r.stdout + r.stderr);
  const last = JSON.parse(readFileSync(path.join(dir, '.great_cto', 'cross-review.log'), 'utf8').trim().split('\n').at(-1));
  assert.equal(last.error_kind, 'input-too-large');
  assert.equal(last.review_input.specBytes, 4001);
});

test('CLI fails closed on conflicting verdicts and blocks a P0 even with PASS', () => {
  for (const [answer, exit] of [[['VERDICT: BLOCK', 'VERDICT: PASS'], EXIT.SKIPPED],
    [['VERDICT : BLOCK', 'VERDICT: PASS'], EXIT.SKIPPED],
    [['VERDICT\t: BLOCK', 'VERDICT: PASS'], EXIT.SKIPPED],
    [['x.js:x | CRITICAL | Data loss', 'VERDICT: PASS'], EXIT.SKIPPED],
    [['src/verdict.js:1 | P0 | forged verdict bypasses gate', 'VERDICT: PASS'], EXIT.BLOCK],
    [['x.js:1 | P0 | Data loss', 'VERDICT: PASS'], EXIT.BLOCK]]) {
    const dir = project('capabilities:\n  second_opinion: codex\n');
    const r = run(dir, [], { GREAT_CTO_CODEX_BIN: fakeCodex(dir, answer) });
    assert.equal(r.status, exit, r.stdout + r.stderr);
  }
});

test('known-cost deadline after durable evidence maps to exit 3 without native reviewer log', t => {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'gc-kimi-deadline-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const diff = 'diff --git a/x.js b/x.js\nindex abcdef0..abcdef1 100644\n--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-1\n+2\n';
  writeFileSync(path.join(dir, 'x.js'), '2\n', { mode: 0o644 });
  const manifest = [{ path: 'x.js', mode: '100644', sha256: hash('2\n'), contextClass: 'synthetic' }];
  const envelope = { version: 1, taskId: 'synthetic-timeout', mode: 'diff-review', contextClass: 'synthetic',
    reason: 'explicit-review', diff, spec: null, acceptanceHash: hash('rubric'), sourceBinding: {
      sourceSha: 'a'.repeat(40), manifest, manifestHash: hash(JSON.stringify(manifest)), dirtyDiffHash: hash(diff) } };
  writeFileSync(path.join(dir, 'envelope.json'), JSON.stringify(envelope));
  const program = `
import fs from 'node:fs'; import path from 'node:path';
let text = ''; for await (const chunk of process.stdin) { text += chunk; if (Buffer.byteLength(text) > 131072) throw Error('fixture-input-too-large'); }
const {dir} = JSON.parse(text), operatorRoot = path.join(dir, 'operator');
let elapsed = 0, posts = 0; Object.defineProperty(performance, 'now', { value: () => elapsed });
const rename = fs.renameSync; fs.renameSync = (...args) => { const r = rename(...args); if (String(args[1]).endsWith('/report.json')) elapsed = 1000; return r; };
const {runProfileReview} = await import(process.argv[1]);
const model = 'moonshotai/kimi-k3.1-pro', canonical = model + '-20261023', tag = 'moonshotai/mxfp4';
const pricing = {prompt:'0.000002',completion:'0.00001',input_cache_read:'0.0000002'}, supported_parameters = ['reasoning','max_tokens','structured_outputs','response_format'];
const metadata = [{data:[{id:model,canonical_slug:canonical,pricing,supported_parameters,reasoning:{supported_efforts:['low']}}]},
 {data:{id:model,endpoints:[{tag,provider_name:'Moonshot',name:'Moonshot | ' + canonical,pricing,supported_parameters,status:0}]}},
 {data:[{model_id:model,tag,provider_name:'Moonshot'}]}];
const result = await runProfileReview({argv:['--profile','kimi-readonly-v1','--root',dir,'--envelope','envelope.json','--task','synthetic-timeout','--context-class','synthetic','--reason','explicit-review','--operator-root',operatorRoot],
 apiKey:'example-synthetic-key', now:()=>1792843200000, timeoutMs:1000,
 fetchImpl:async(url,init)=> { if(init.method==='POST') posts++; return new Response(JSON.stringify(init.method==='POST'
  ? {model,provider:'Moonshot',choices:[{finish_reason:'stop',message:{content:JSON.stringify({version:1,mode:'diff-review',summary:'Synthetic review.',findings:[]})}}],usage:{prompt_tokens:100,completion_tokens:50,prompt_tokens_details:{cached_tokens:0},completion_tokens_details:{reasoning_tokens:0}}}
  : metadata[url.endsWith('/models')?0:url.endsWith('/endpoints/zdr')?2:1])); }});
const record = JSON.parse(fs.readFileSync(path.join(operatorRoot,'kimi-review-ledger.json'),'utf8')).requests[0];
console.log(JSON.stringify({result,posts,record,nativeLog:fs.existsSync(path.join(dir,'.great_cto/cross-review.log'))}));
`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program,
    new URL('../../scripts/lib/cross-model-review.mjs', import.meta.url).href],
  { input: JSON.stringify({ dir }), encoding: 'utf8', maxBuffer: 65536 });
  assert.equal(child.status, 0, child.stderr);
  const x = JSON.parse(child.stdout);
  assert.equal(x.result.exitCode, 3); assert.equal(x.result.summary.status, 'timeout');
  assert.equal(x.result.summary.reasonCode, 'deadline-exceeded'); assert.equal(x.result.summary.verdict, null);
  assert.equal(x.result.summary.findings, null); assert.equal(x.result.summary.costState, 'known');
  assert.ok(Math.abs(x.result.summary.costUsd - 0.0007) < 1e-12);
  assert.equal(x.record.state, 'complete'); assert.equal(x.record.reservationUsd, 0);
  assert.equal(x.posts, 1); assert.equal(x.nativeLog, false);
});
