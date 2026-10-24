// tests/lib/cross-model-review.test.mjs — architect-loop R3 cross-model review.
// Run: node --test tests/lib/cross-model-review.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crossReview from '../../scripts/lib/cross-model-review.mjs';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pickReviewerModel, buildReviewPrompt, parseFindings, reviewLogLine } from '../../scripts/lib/cross-model-review.mjs';

test('pickReviewerModel: defaults to a non-Claude model; env overrides', () => {
  const def = pickReviewerModel({});
  assert.ok(!/claude/i.test(def), 'default reviewer must NOT be Claude (cross-model)');
  assert.equal(pickReviewerModel({ GREAT_CTO_CROSS_REVIEW_MODEL: 'google/gemini-2.5-pro' }), 'google/gemini-2.5-pro');
});

test('buildReviewPrompt: red-team system, file:line format, no-style instruction', () => {
  const { system, user } = buildReviewPrompt({ diff: 'DIFF', spec: 'SPEC' });
  assert.match(system, /correctness/i);
  assert.match(system, /file:line/i);
  assert.match(system, /do NOT report style/i);
  assert.match(system, /Do not assume your model family differs/);
  assert.match(user, /SPEC/);
  assert.match(user, /DIFF/);
});

test('buildReviewPrompt: spec optional', () => {
  const { user } = buildReviewPrompt({ diff: 'D' });
  assert.ok(!user.includes('Spec / intent'));
});

test('parseFindings: parses "file:line | SEV | issue" lines + verdict', () => {
  const text = [
    'src/pay.ts:42 | P0 | reduce on empty array throws',
    'src/auth.ts:10 | P1 | missing await → race',
    'noise line that is not a finding',
    'VERDICT: BLOCK',
  ].join('\n');
  const { findings, verdict } = parseFindings(text);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].file, 'src/pay.ts');
  assert.equal(findings[0].line, 42);
  assert.equal(findings[0].severity, 'P0');
  assert.equal(verdict, 'BLOCK');
});

test('parseFindings: derives BLOCK from a P0 when VERDICT line absent', () => {
  const { verdict } = parseFindings('a.ts:1 | P0 | boom');
  assert.equal(verdict, 'BLOCK');
});

// A charitable parse covers the dishonest cases too.
//
// This used to assert PASS: the model read the diff, said something clean in
// prose, and forgot the `VERDICT:` line the prompt asked for. Charitable, and
// wrong — because "looks clean to me", an empty body, a refusal and a reply in
// some other format are the SAME input to this parser. All four produce zero
// findings and no verdict line, so reading any of them as PASS reads all of
// them as PASS, and a review that could not be read becomes a review that
// approved.
//
// The rule now: a derivation that BLOCKS is safe to make, because the worst
// case is a human looks again. A derivation that PASSES is the one that turns
// absence into approval, and this file does not make it.
//
// Borrowed from mco-org/mco: "It does not turn natural-language output into
// findings, severity, confidence, consensus, or an automatic decision."

test('a model that never said PASS is not made to say it', () => {
  for (const answer of ['looks clean to me', '', 'I cannot review this diff.',
                        '- src/a.js line 12: this is a P0 null deref']) {
    const { verdict } = parseFindings(answer);
    assert.equal(verdict, null, `\`${answer.slice(0, 30)}\` was read as a verdict`);
  }
});

test('a P0 with no VERDICT line still blocks — blocking derivations stay', () => {
  const { verdict } = parseFindings('a.ts:1 | P0 | boom');
  assert.equal(verdict, 'BLOCK');
});

test('parsed findings without a P0 and without a VERDICT line are not a pass', () => {
  // The model produced readable findings and still never reached a verdict.
  // Readable is not the same as decided.
  const { findings, verdict } = parseFindings('a.ts:1 | P2 | nit');
  assert.equal(findings.length, 1);
  assert.equal(verdict, null);
});

// BRD-R1: diff-identity fields on reviewLogLine (sha, dirty) — additive only.

test('reviewLogLine: sha+dirty supplied are serialized verbatim', () => {
  const line = reviewLogLine({
    provider: 'codex', model: 'gpt-5.6-terra', state: 'ok', verdict: 'PASS',
    findings: [], cost: 0, source: 'PROJECT.md', sha: 'abc123', dirty: false,
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.sha, 'abc123');
  assert.equal(parsed.dirty, false);
});

test('reviewLogLine: sha/dirty omitted at the call site → null, never undefined, never absent', () => {
  const line = reviewLogLine({
    provider: 'codex', model: 'gpt-5.6-terra', state: 'ok', verdict: 'PASS',
    findings: [], cost: 0, source: 'PROJECT.md',
  });
  const parsed = JSON.parse(line);
  assert.ok('sha' in parsed, 'sha key must be present even when not supplied');
  assert.ok('dirty' in parsed, 'dirty key must be present even when not supplied');
  assert.equal(parsed.sha, null);
  assert.equal(parsed.dirty, null);
});

test('reviewLogLine: additive — a pre-existing (no sha/dirty) log line still parses with every original key unchanged', () => {
  // Verbatim line from .great_cto/cross-review.log, written before this change.
  const oldLine = '{"ts":"2026-09-05T19:04:47.612Z","provider":"codex","model":"gpt-5.6-terra","state":"ok","verdict":"PASS","findings":1,"p0":0,"cost":0,"source":"PROJECT.md"}';
  const parsed = JSON.parse(oldLine);
  assert.equal(parsed.ts, '2026-09-05T19:04:47.612Z');
  assert.equal(parsed.provider, 'codex');
  assert.equal(parsed.model, 'gpt-5.6-terra');
  assert.equal(parsed.state, 'ok');
  assert.equal(parsed.verdict, 'PASS');
  assert.equal(parsed.findings, 1);
  assert.equal(parsed.p0, 0);
  assert.equal(parsed.cost, 0);
  assert.equal(parsed.source, 'PROJECT.md');
  assert.equal(parsed.sha, undefined, 'a pre-change line has no sha key at all — that is the additive contract, not a parse failure');
});

const hash = value => createHash('sha256').update(value).digest('hex');
function syntheticEnvelope() {
  const diff = 'diff --git a/sum.js b/sum.js\n--- a/sum.js\n+++ b/sum.js\n@@ -1 +1 @@\n-export const n = 1;\n+export const n = 2;\n';
  const manifest = [{ path: 'sum.js', mode: '100644', sha256: hash('export const n = 2;\n'), contextClass: 'synthetic' }];
  return { version: 1, taskId: 'synthetic-review', mode: 'diff-review', contextClass: 'synthetic', reason: 'explicit-review',
    diff, spec: null, acceptanceHash: hash('test rubric'), sourceBinding: {
      sourceSha: 'a'.repeat(40), manifest, manifestHash: hash(JSON.stringify(manifest)), dirtyDiffHash: hash(diff),
    } };
}
function profileFixture(t, output = { version: 1, mode: 'diff-review', summary: 'Synthetic review.', findings: [] }, finish = 'stop') {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), 'gc-extra-review-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'repo'); mkdirSync(root);
  writeFileSync(path.join(root, 'sum.js'), 'export const n = 2;\n');
  const envelope = syntheticEnvelope(), file = path.join(dir, 'envelope.json'); writeFileSync(file, JSON.stringify(envelope));
  const model = 'moonshotai/kimi-k3.1-pro', canonical = `${model}-20261023`;
  const pricing = { prompt: '0.000002', completion: '0.00001', input_cache_read: '0.0000002' };
  const supported_parameters = ['reasoning', 'max_tokens', 'structured_outputs', 'response_format'];
  const metadata = [ { data: [{ id: model, canonical_slug: canonical, pricing, supported_parameters,
    reasoning: { mandatory: false, default_enabled: true, supported_efforts: ['max', 'high', 'low', 'none'], default_effort: 'max' }, default_parameters: { top_p: 0.95 } }] },
    { data: { id: model, name: 'Kimi', endpoints: [{ tag: 'moonshotai/mxfp4', provider_name: 'Moonshot',
      name: `Moonshot | ${canonical}`, pricing, supported_parameters, status: 0 }] } },
    { data: [{ model_id: model, tag: 'moonshotai/mxfp4', provider_name: 'Moonshot' }] } ];
  const calls = [];
  return { root, file, envelope, calls, options: { argv: ['--profile', 'kimi-readonly-v1', '--envelope', file,
    '--task', 'synthetic-review', '--context-class', 'synthetic', '--reason', 'explicit-review', '--root', root,
    '--operator-root', path.join(dir, 'operator')], env: { OPENROUTER_API_KEY: 'synthetic-placeholder' },
    now: () => 1792843200000, fetchImpl: async (url, init) => { calls.push({ url, init });
      return new Response(JSON.stringify(init.method === 'POST' ? { model, provider: 'Moonshot',
        choices: [{ finish_reason: finish, message: { content: JSON.stringify(output) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } } : metadata.shift()), { status: 200 }); },
  } };
}

test('explicit extra review completes privately and maps only complete advisory verdicts', async t => {
  assert.equal(typeof crossReview.runProfileReview, 'function', 'explicit consumer entrypoint is missing');
  for (const [findings, finish, wanted] of [[[], 'stop', 0],
    [[{ file: 'sum.js', line: 1, side: 'new', severity: 'P0', issue: 'Synthetic counterexample.', evidence: 'export const n = 2;' }], 'stop', 1],
    [[], 'length', 3]]) {
    const f = profileFixture(t, { version: 1, mode: 'diff-review', summary: 'Synthetic review.', findings }, finish);
    const r = await crossReview.runProfileReview(f.options);
    assert.equal(r.exitCode, wanted, JSON.stringify(r));
    assert.equal(r.summary.advisory, true);
    assert.equal(r.summary.authority, 'NONE');
    assert.equal(f.calls.length, 4);
    assert.equal(existsSync(path.join(f.root, '.great_cto', 'cross-review.log')), false);
    assert.equal(JSON.stringify(r.summary).includes('counterexample'), false);
    assert.equal(JSON.stringify(r.summary).includes(f.root), false);
    if (wanted === 3) assert.equal(r.summary.verdict, null);
  }
});

test('extra review rejects unsafe explicit files and conflicts before reading a credential', async t => {
  assert.equal(typeof crossReview.runProfileReview, 'function', 'explicit consumer entrypoint is missing');
  const f = profileFixture(t);
  const linked = path.join(path.dirname(f.file), 'linked.json'); symlinkSync(f.file, linked);
  const oversized = path.join(path.dirname(f.file), 'large.json'); writeFileSync(oversized, 'x'.repeat(131073));
  const linkedDirectory = path.join(path.dirname(f.file), 'linked-dir'); symlinkSync(f.root, linkedDirectory);
  const wrongDiff = path.join(path.dirname(f.file), 'wrong.diff'); writeFileSync(wrongDiff, 'different bytes');
  for (const extra of [['--model', 'other'], ['--provider', 'codex'], ['--task', 'mismatch'], ['--profile', 'unknown'],
    ['--envelope', linked], ['--envelope', oversized], ['--envelope', f.root],
    ['--envelope', f.root + '/../envelope.json'], ['--diff', '-'], ['--diff', wrongDiff],
    ['--operator-root', linkedDirectory], ['--operator-root', 'x'.repeat(5000)]]) {
    const names = new Set(extra.filter(x => x.startsWith('--')));
    const argv = f.options.argv.filter((x, i, all) => !names.has(x) && !names.has(all[i - 1])).concat(extra);
    const r = await crossReview.runProfileReview({ ...f.options, argv,
      env: { get OPENROUTER_API_KEY() { assert.fail('credential read before admission'); } } });
    assert.equal(r.exitCode, 2, JSON.stringify(r));
  }
  assert.equal(f.calls.length, 0);
});

test('missing profile never reads new runtime capabilities or ambient credentials', async () => {
  assert.equal(await crossReview.runProfileReview({ argv: [],
    get apiKey() { assert.fail('key'); }, get env() { assert.fail('env'); },
    get fetchImpl() { assert.fail('fetch'); } }), null);
});

test('bad envelope admission rejects before credential resolution', async t => {
  const f = profileFixture(t);
  for (const change of [{ contextClass: 'private' }, { spec: 'x'.repeat(4001) },
    { acceptanceHash: 'invalid' }, { sourceBinding: { ...f.envelope.sourceBinding, manifestHash: '0'.repeat(64) } }]) {
    const envelope = { ...f.envelope, ...change };
    writeFileSync(f.file, JSON.stringify(envelope));
    const argv = [...f.options.argv];
    argv[argv.indexOf('--context-class') + 1] = envelope.contextClass;
    const r = await crossReview.runProfileReview({ ...f.options, argv, env: {
      get OPENROUTER_API_KEY() { assert.fail('credential read for denied envelope'); },
    } });
    assert.equal(r.exitCode, 2);
  }
  assert.equal(f.calls.length, 0);
});

test('source filesystem admission precedes lazy session credential resolution', async t => {
  const f = profileFixture(t);
  writeFileSync(path.join(f.root, 'sum.js'), 'changed after envelope preparation\n');
  const r = await crossReview.runProfileReview({ ...f.options, env: {
    get OPENROUTER_API_KEY() { assert.fail('credential read before source verification'); },
  } });
  assert.equal(r.exitCode, 3);
  assert.equal(r.summary.verdict, null);
  assert.equal(f.calls.length, 0);
});
