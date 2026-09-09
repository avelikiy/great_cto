// tests/lib/cross-model-review.test.mjs — architect-loop R3 cross-model review.
// Run: node --test tests/lib/cross-model-review.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
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
