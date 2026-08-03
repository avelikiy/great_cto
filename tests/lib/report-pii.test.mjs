// Asked to review PII handling in a call transcript, voice-ai-reviewer wrote a
// competent analysis and reproduced the caller's passport number several times
// inside it, plus a full date of birth in an example. The finding was right and
// the report was now a second copy of the data it said to redact — and reports
// land in docs/, in verdict logs, and on the board.
//
// privacy-guardrails.md already forbids this and is scoped to "knowledge/lesson
// writers": three agents. The ones handling raw sensitive material were never
// covered, which is exactly where it happened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findReportPii, explainPii, PII_PATTERNS } from '../../scripts/lib/report-pii.mjs';

// ── what it catches ────────────────────────────────────────────────────────

test('the case that occurred: a passport number quoted in the analysis', () => {
  const hits = findReportPii('The transcript contains C03 005 988 at timestamp 04:12.');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pattern, 'passport (MRZ-style)');
  assert.match(hits[0].redact, /unredacted passport number/);
});

test('a full date of birth is caught in both common forms', () => {
  assert.equal(findReportPii('caller confirmed 01/03/1990').length, 1);
  assert.equal(findReportPii('caller confirmed March 1, 1990').length, 1);
});

test('an SSN is caught, and the reserved ranges that are not SSNs are not', () => {
  assert.equal(findReportPii('SSN 123-45-6789 appears in the log').length, 1);
  assert.equal(findReportPii('order 000-12-3456 shipped').length, 0, '000 is never a valid area number');
  assert.equal(findReportPii('ticket 666-12-3456').length, 0);
});

test('a card number is caught only when it passes Luhn', () => {
  assert.equal(findReportPii('card 4242 4242 4242 4242 was charged').length, 1);
  assert.equal(findReportPii('build 1234567890123456 completed').length, 0,
    'a long number that is not a card must not be reported as one');
});

test('a vendor token is caught and the fix names the variable, not the value', () => {
  const hits = findReportPii('found AKIAIOSFODNN7EXAMPLE in the config');
  assert.equal(hits.length, 1);
  assert.match(hits[0].redact, /name the variable/);
});

test('a value inside a fenced evidence block is still caught', () => {
  // Exempting fences would exempt the case that occurs: a transcript pasted as
  // evidence is the most likely place for this.
  const report = '### [High] PII in transcript\n\n```\n$ cat transcript.json\n"ssn": "123-45-6789"\n```\n';
  assert.equal(findReportPii(report).length, 1);
});

// ── what it deliberately does not catch ────────────────────────────────────

test('a line describing the shape rather than showing it is fine', () => {
  for (const line of [
    'the transcript contains an unredacted passport number at 04:12',
    'the SSN is redacted before it reaches the LLM',
    'the field holds a placeholder like <ssn>',
  ]) {
    assert.deepEqual(findReportPii(line), [], line);
  }
});

test('names, addresses and ordinary prose are not flagged', () => {
  // Detecting them needs guesses whose false positives would train people to
  // ignore the check, and a check people ignore is worse than none.
  for (const line of [
    'the caller gave their name and street address',
    'reviewed 2026-08-03 by the security officer',
    'version 2.91.0 shipped on 2026-08-01',
  ]) {
    assert.deepEqual(findReportPii(line), [], line);
  }
});

test('one value on one line is reported once, not once per occurrence', () => {
  const hits = findReportPii('SSN 123-45-6789 and again 123-45-6789 on the same line');
  assert.equal(hits.length, 1, 'repeating the finding would repeat the leak it exists to stop');
});

// ── the message ────────────────────────────────────────────────────────────

test('the report never echoes the value it found', () => {
  const out = explainPii(findReportPii('passport C03 005 988 and SSN 123-45-6789'));
  assert.ok(!out.includes('C03'), 'a leak report that quotes the leak has made a third copy');
  assert.ok(!out.includes('123-45-6789'));
  assert.match(out, /line 1/, 'the location is what makes it fixable');
});

test('a clean report says so', () => {
  assert.equal(explainPii([]), 'no reproduced values found');
  assert.deepEqual(findReportPii(''), []);
  assert.deepEqual(findReportPii(null), []);
});

test('every pattern carries a replacement, not just a prohibition', () => {
  for (const p of PII_PATTERNS) {
    assert.ok(p.redact && p.redact.length > 10,
      `${p.name}: "PII found" with no replacement is an instruction to delete the sentence, not fix it`);
  }
});
