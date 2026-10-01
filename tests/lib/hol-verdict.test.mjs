// The HOL plugin scanner's verdict, judged the way its GitHub Action judged it:
// score >= 80 and no critical or high finding. The workflow was removed on
// 2026-10-01 (Actions billing-locked); the local gate runs the same pinned
// scanner and asks this module whether the report passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../../scripts/lib/hol-verdict.mjs';

const report = (score, findings = {}) => ({
  score, effective_score: score,
  summary: { findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0, ...findings } },
});

test('90 with no high finding passes', () => {
  const v = judge(report(90, { medium: 3, info: 8 }));
  assert.equal(v.pass, true);
  assert.match(v.line, /score 90 \(needs 80\)/);
});

test('a score under 80 fails, and says so', () => {
  const v = judge(report(74));
  assert.equal(v.pass, false);
  assert.match(v.reasons.join(' '), /74 < 80/);
});

test('any high or critical finding fails, whatever the score', () => {
  assert.equal(judge(report(95, { high: 1 })).pass, false);
  assert.equal(judge(report(95, { critical: 1 })).pass, false);
});

test('a report without a score is not a pass', () => {
  const v = judge({ summary: { findings: {} } });
  assert.equal(v.pass, false);
  assert.match(v.reasons.join(' '), /no score/);
});

test('the threshold is the one the catalogue and the old workflow used', () => {
  assert.equal(judge(report(80)).pass, true);
  assert.equal(judge(report(79)).pass, false);
});

test('the local gate runs the scanner, and a missing scanner is a skip, not a pass', async () => {
  const { readFileSync } = await import('node:fs');
  const gate = readFileSync(new URL('../../scripts/ci-local.sh', import.meta.url), 'utf8');
  assert.match(gate, /^step "HOL plugin scanner[^"]*" bash scripts\/hol-scan\.sh$/m);
  const scan = readFileSync(new URL('../../scripts/hol-scan.sh', import.meta.url), 'utf8');
  assert.match(scan, /echo "# skip 1"/, 'not measured must reach count-skips');
  assert.match(scan, /--require-hashes/);
  assert.match(scan, /does not match the pin/);
});
