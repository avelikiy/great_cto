// A devops instruction was rewritten four times on 2026-08-06. The holdout went
// 5/20 → 11 → 12 → 11 → 10: flat, across four phrasings, for about $41.
//
// The wording was never the variable. Once the actor's answers were stored, one
// grep settled it: the instruction appeared in 4 of 22 answers, passed 4/4 where
// it appeared and 3/10 where it did not. It fired only when the agent
// independently recognised the case. Deleting the recognition step took emission
// to 92% and the holdout to 16/20.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdherenceMarker, adherence, explainAdherence } from '../../scripts/lib/adherence.mjs';

const c = (verdict, answer) => ({ verdict, answer });
const MARK = /CLAIMS BEFORE|CHECKED:/im;

// ── the marker comes from the eval, because the author knows ──────────────

test('the marker is read from the eval file', () => {
  const m = parseAdherenceMarker('# EVAL\n\n> Agent: devops\n> Adherence: CLAIMS BEFORE|CHECKED:\n');
  assert.ok(m.test('CLAIMS BEFORE cutover'));
  assert.ok(!m.test('nothing of the sort'));
});

test('no marker means this eval is not asking the question', () => {
  assert.equal(parseAdherenceMarker('# EVAL\n> Agent: devops\n'), null);
  assert.equal(parseAdherenceMarker('> Adherence:   '), null);
  assert.equal(parseAdherenceMarker(null), null);
});

test('an unparseable marker is null rather than a crash mid-run', () => {
  assert.equal(parseAdherenceMarker('> Adherence: [unclosed'), null);
});

// ── the measurement, on the numbers that produced it ──────────────────────

test('the devops case: low emission says reword nothing', () => {
  // 4 of 22, 4/4 with, 3/10 without — the real shape of that run.
  const rows = [
    ...Array.from({ length: 4 }, () => c('PASS', 'CLAIMS BEFORE cutover\n  health 200 → CHECKED: curl')),
    ...Array.from({ length: 3 }, () => c('PASS', 'a competent deploy plan')),
    ...Array.from({ length: 7 }, () => c('FAIL', 'a competent deploy plan')),
    ...Array.from({ length: 8 }, () => c('FAIL', 'more of the same')),
  ];
  const a = adherence(rows, MARK);
  assert.equal(a.emitted, 4);
  assert.equal(a.total, 22);
  assert.equal(a.verdict, 'not-firing');
  assert.equal(a.withPass, 4);
  assert.equal(a.withTotal, 4);
  assert.equal(a.withoutPass, 3);
  assert.equal(a.withoutTotal, 18);
  assert.match(a.why, /rewording it is guessing/);
  assert.match(a.why, /Remove whatever gates it/);
});

test('high emission moves the question to what it produces', () => {
  const rows = [
    ...Array.from({ length: 9 }, () => c('FAIL', 'CLAIMS BEFORE cutover — but the wrong claims')),
    c('PASS', 'CLAIMS BEFORE cutover'),
  ];
  const a = adherence(rows, MARK);
  assert.equal(a.verdict, 'firing');
  assert.match(a.why, /about what it produces, not about whether it arrives/);
});

test('the threshold is stated, and both sides of it are pinned', () => {
  const hit = (n) => Array.from({ length: n }, () => c('PASS', 'CHECKED: x'));
  const missed = (n) => Array.from({ length: n }, () => c('FAIL', 'nothing'));
  assert.equal(adherence([...hit(5), ...missed(5)], MARK).verdict, 'firing', '50% is firing');
  assert.equal(adherence([...hit(4), ...missed(6)], MARK).verdict, 'not-firing', '40% is not');
});

// ── refusing to answer ────────────────────────────────────────────────────

test('a run with no stored answers says so instead of reporting zero', () => {
  // Reporting 0% emission for a run that stored nothing would send someone to
  // rewrite an instruction that may have fired every time.
  const a = adherence([c('PASS', null), c('FAIL', undefined)], MARK);
  assert.equal(a.verdict, 'unknown');
  assert.match(a.why, /no answers were stored/);
  assert.equal(a.rate, null);
});

test('no marker measures nothing at all', () => {
  assert.equal(adherence([c('PASS', 'x')], null), null);
  assert.equal(explainAdherence('x', null), null);
});

test('the report carries both halves of the comparison', () => {
  const out = explainAdherence('devops', adherence([c('PASS', 'CHECKED: a'), c('FAIL', 'nothing')], MARK));
  assert.match(out, /1\/2 answers/);
  assert.match(out, /with it: 1\/1/);
  assert.match(out, /without it: 0\/1/);
});
