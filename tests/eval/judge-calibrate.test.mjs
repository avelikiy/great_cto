// tests/eval/judge-calibrate.test.mjs — offline tests for the judge calibrator.
// Run: node --test tests/eval/judge-calibrate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGold, scoreJudge } from '../../scripts/judge-calibrate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLD = join(__dirname, 'judge-gold.jsonl');

test('parseGold: reads labelled JSONL, skips blanks/malformed/unlabelled', () => {
  const text = [
    '{"label":"PASS","actorResponse":"a"}',
    '',
    '{bad json}',
    '{"label":"MAYBE"}',          // invalid label → skipped
    '{"label":"FAIL","actorResponse":"b"}',
  ].join('\n');
  const g = parseGold(text);
  assert.equal(g.length, 2);
  assert.equal(g[0].label, 'PASS');
  assert.equal(g[1].label, 'FAIL');
});

test('parseGold: bundled judge-gold.jsonl has balanced PASS/FAIL cases', () => {
  const g = parseGold(readFileSync(GOLD, 'utf8'));
  assert.ok(g.length >= 6, 'expected at least 6 gold cases');
  assert.ok(g.some(x => x.label === 'PASS'));
  assert.ok(g.some(x => x.label === 'FAIL'));
});

test('scoreJudge: perfect judge → accuracy 1.0', () => {
  const recs = [
    { label: 'PASS', verdict: 'PASS' },
    { label: 'FAIL', verdict: 'FAIL' },
  ];
  const s = scoreJudge(recs);
  assert.equal(s.accuracy, 1.0);
  assert.equal(s.confusion.tp, 1);
  assert.equal(s.confusion.tn, 1);
});

test('scoreJudge: confusion matrix + accuracy on mixed results', () => {
  const recs = [
    { label: 'PASS', verdict: 'PASS' }, // tp
    { label: 'PASS', verdict: 'FAIL' }, // fn
    { label: 'FAIL', verdict: 'PASS' }, // fp
    { label: 'FAIL', verdict: 'FAIL' }, // tn
  ];
  const s = scoreJudge(recs);
  assert.equal(s.correct, 2);
  assert.equal(s.accuracy, 0.5);
  assert.deepEqual(s.confusion, { tp: 1, tn: 1, fp: 1, fn: 1 });
});

test('scoreJudge: counts truncated and unknown', () => {
  const recs = [
    { label: 'PASS', verdict: 'PASS', truncated: true },
    { label: 'FAIL', verdict: 'UNKNOWN' },
  ];
  const s = scoreJudge(recs);
  assert.equal(s.truncated, 1);
  assert.equal(s.unknown, 1);
});
