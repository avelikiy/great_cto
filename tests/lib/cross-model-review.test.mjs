// tests/lib/cross-model-review.test.mjs — architect-loop R3 cross-model review.
// Run: node --test tests/lib/cross-model-review.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickReviewerModel, buildReviewPrompt, parseFindings } from '../../scripts/lib/cross-model-review.mjs';

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

test('parseFindings: no findings, no verdict → PASS', () => {
  const { findings, verdict } = parseFindings('looks clean to me');
  assert.equal(findings.length, 0);
  assert.equal(verdict, 'PASS');
});
