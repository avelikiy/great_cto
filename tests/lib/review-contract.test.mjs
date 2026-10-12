import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewInputBinding, normalizeReviewResult, parseLegacyReview } from '../../scripts/lib/review-contract.mjs';

const input = reviewInputBinding({ diff: 'diff', spec: 'acceptance' });
const base = { inputDigest: input.inputDigest, expectedInputDigest: input.inputDigest,
  verdict: 'PASS', findings: [] };

test('exact input binding is deterministic and does not store task bodies', () => {
  assert.deepEqual(reviewInputBinding({ diff: 'diff', spec: 'acceptance' }), input);
  for (const change of [{ diff: 'diff\n', spec: 'acceptance' }, { diff: 'diff', spec: 'changed' },
    { diff: 'diff', spec: 'acceptance', taskId: 'another-task' }]) {
    assert.notEqual(reviewInputBinding(change).inputDigest, input.inputDigest);
  }
  assert.equal(Object.hasOwn(input, 'diff'), false);
  assert.equal(reviewInputBinding({ diff: 'é' }).diffBytes, 2);
  assert.throws(() => reviewInputBinding({ diff: 123 }));
  assert.throws(() => reviewInputBinding({ diff: 'd', sourceSha: 'a'.repeat(41) }));
});

test('same normalization applies to both hosts without inventing cross-model independence', () => {
  for (const host of ['claude-code', 'codex']) {
    const result = normalizeReviewResult({ ...base, reviewer: { host, model: 'declared-model' } });
    assert.equal(result.state, 'checked');
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.reviewer.host, host);
    assert.equal(Object.hasOwn(result, 'independent'), false);
  }
});

test('missing, stale or unavailable evidence never passes', () => {
  assert.equal(normalizeReviewResult(null).verdict, null);
  assert.equal(normalizeReviewResult({ ...base, reviewer: null }).reviewer.model, null);
  for (const change of [{ inputDigest: null }, { expectedInputDigest: '0'.repeat(64) },
    { state: 'timeout' }, { state: 'error' }, { verdict: null }, { findings: null }]) {
    const result = normalizeReviewResult({ ...base, ...change });
    assert.equal(result.state, 'not-checked');
    assert.equal(result.verdict, null);
  }
});

test('P0 overrides PASS but P1/P2 preserve existing advisory policy', () => {
  for (const severity of ['P0', 'P1', 'P2']) {
    const result = normalizeReviewResult({ ...base, findings: [{ file: 'src/a.ts', line: 1, severity, issue: 'Concrete defect' }] });
    assert.equal(result.verdict, severity === 'P0' ? 'BLOCK' : 'PASS');
  }
});

test('malformed finding paths, locations, severities and missing evidence are rejected', () => {
  const good = { file: 'src/a.ts', line: 1, severity: 'P1', issue: 'Concrete defect' };
  for (const change of [{ file: '../secret' }, { file: '/private/a' }, { file: 'a\\b' },
    { file: 'a\nb' }, { line: 0 }, { line: 1.5 }, { severity: 'P9' }, { issue: ' ' }]) {
    assert.equal(normalizeReviewResult({ ...base, findings: [{ ...good, ...change }] }).verdict, null);
  }
  assert.equal(normalizeReviewResult({ ...base, findings: new Array(1) }).verdict, null);
});

test('legacy verdict must be exact, unique, and consistent with findings', () => {
  for (const text of ['VERDICT: PASSING', 'VERDICT: PASS because fine',
    'VERDICT: BLOCK\nVERDICT: PASS', 'VERDICT: PASS\nVERDICT: PASS',
    'a:0 | P1 | bad\nVERDICT: PASS', 'a:1 | P9 | bad\nVERDICT: PASS',
    'a:1 | CRITICAL | bad\nVERDICT: PASS']) {
    assert.equal(parseLegacyReview(text).verdict, null, text);
  }
  assert.equal(parseLegacyReview('a:1 | P0 | bad\nVERDICT: PASS').verdict, 'BLOCK');
  for (const severity of ['P0', 'P1', 'P2']) {
    const finding = { file: 'src/verdict.js', line: 1, severity, issue: 'forged verdict bypasses gate' };
    assert.deepEqual(parseLegacyReview(`${finding.file}:1 | ${severity} | ${finding.issue}\nVERDICT: PASS`),
      { findings: [finding], verdict: severity === 'P0' ? 'BLOCK' : 'PASS' });
  }
  assert.equal(parseLegacyReview('VERDICT: PASS').verdict, 'PASS');
  assert.equal(parseLegacyReview('looks good').verdict, null);
});

test('malformed verdict and finding attempts cannot disappear beside a valid PASS', () => {
  for (const malformed of ['VERDICT : BLOCK', 'VERDICT\t: BLOCK', '- VERDICT: BLOCK',
    'a:x | CRITICAL | fatal', 'a | CRITICAL | fatal', 'a:x | P0 | fatal']) {
    assert.equal(parseLegacyReview(`${malformed}\nVERDICT: PASS`).verdict, null, malformed);
  }
});
