// devops scored 3/20. Reading all twenty verdicts by hand showed the cause was
// not knowledge: the agent reached the same terminal state regardless of the
// question, because the fixture gave it no approved gate and its contract says
// refuse without one. The three passes were exactly the cases where refusing WAS
// the answer.
//
// A score cannot show that. 3/20 reads as a weak agent; the shape reads as a
// fixture that never lets the agent reach the question.
//
// The tool also corrected its author on his own data. The hand count was "8 of
// 17"; a strict pattern gives 5 of 17, because the manual grep matched the word
// "block" in any context. That is the value — and the reason the threshold below
// is stated rather than tuned until it agrees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeOf, explainShape, SHORT_CIRCUITS } from '../../scripts/lib/run-shape.mjs';

const c = (num, verdict, reason = '') => ({ num, verdict, reason });
const run = (...cases) => ({ caseResults: cases });

// ── counting ───────────────────────────────────────────────────────────────

test('a run with no cases shapes to nothing, not to a verdict', () => {
  const s = shapeOf(run());
  assert.equal(s.total, 0);
  assert.equal(s.dominant, null);
  assert.match(s.summary, /nothing to shape/);
});

test('passes are counted and never clustered', () => {
  const s = shapeOf(run(
    c('1', 'PASS', 'blocked the deploy, which was correct'),
    c('2', 'FAIL', 'blocked on the missing gate instead of answering'),
  ));
  assert.equal(s.passed, 1);
  assert.equal(s.failed, 1);
  assert.equal(s.clusters[0].count, 1, 'a correct refusal is not a short circuit');
});

// ── the distinction the tool exists to make ────────────────────────────────

test('one terminal state behind most failures points at the fixture', () => {
  const s = shapeOf(run(
    ...['H1', 'H2', 'H3', 'H4'].map((n) => c(n, 'FAIL', 'refused without an approved gate')),
    c('H5', 'FAIL', 'named the wrong retention period'),
  ));
  assert.equal(s.verdict, 'fixture');
  assert.equal(s.dominant.key, 'precondition-block');
  assert.match(s.summary, /check the fixture before the prompt/);
});

test('scattered failures point at the agent', () => {
  const s = shapeOf(run(
    c('H1', 'FAIL', 'named the wrong retention period'),
    c('H2', 'FAIL', 'did not raise the migration overlap'),
    c('H3', 'FAIL', 'accepted the health check at face value'),
  ));
  assert.equal(s.verdict, 'agent');
  assert.match(s.summary, /no dominant terminal state/);
});

test('a minority cluster is mixed — real, and not the whole story', () => {
  // devops after the fixture fix: the precondition blocks went from 5 to 1 and
  // the score moved by two cases. Both facts belong in the report.
  const s = shapeOf(run(
    c('H1', 'FAIL', 'blocked on the missing gate'),
    ...['H2', 'H3', 'H4'].map((n) => c(n, 'FAIL', 'named the wrong thing')),
  ));
  assert.equal(s.verdict, 'mixed');
  assert.equal(s.dominant.count, 1);
});

test('the fixture threshold is a stated judgement, not a hidden one', () => {
  // 2 of 5 = 40% → fixture. 1 of 5 = 20% → mixed. Pinning both sides means
  // moving the line is a visible decision.
  const fixture = shapeOf(run(
    c('a', 'FAIL', 'refused without an approved gate'),
    c('b', 'FAIL', 'blocked on the missing precondition'),
    ...['c', 'd', 'e'].map((n) => c(n, 'FAIL', 'wrong answer')),
  ));
  assert.equal(fixture.verdict, 'fixture');
  const mixed = shapeOf(run(
    c('a', 'FAIL', 'refused without an approved gate'),
    ...['b', 'c', 'd', 'e'].map((n) => c(n, 'FAIL', 'wrong answer')),
  ));
  assert.equal(mixed.verdict, 'mixed');
});

// ── the four states, each seen for real ────────────────────────────────────

test('every short circuit matches the phrasing that produced it', () => {
  const seen = {
    'precondition-block': 'The agent blocks deployment due to missing gate:ship approval',
    'setup-only': 'it only shows the setup and staging deployment process',
    'missing-context': 'The agent focuses on missing PROJECT.md configuration',
    'asked-instead': 'the agent asks for clarification instead of deciding',
  };
  for (const [key, reason] of Object.entries(seen)) {
    const s = shapeOf(run(c('1', 'FAIL', reason)));
    assert.equal(s.clusters[0]?.key, key, `${key}: ${reason}`);
  }
});

test('a failure that is plainly about the answer matches no short circuit', () => {
  for (const reason of [
    'does not name the migration that already ran',
    'accepts the 200 health check without asking what it verifies',
    'names the wrong severity for an unreachable CVE',
  ]) {
    assert.deepEqual(shapeOf(run(c('1', 'FAIL', reason))).clusters, [], reason);
  }
});

test('every short circuit says what it means, not just that it matched', () => {
  for (const sc of SHORT_CIRCUITS) {
    assert.ok(sc.means && sc.means.length > 15,
      `${sc.key}: a cluster key with no explanation is a category nobody can act on`);
  }
});

// ── the report ─────────────────────────────────────────────────────────────

test('the report names the cases so they can be read', () => {
  const s = shapeOf(run(
    c('H5', 'FAIL', 'blocked on the missing gate'),
    c('H12', 'FAIL', 'refused without an approved gate'),
  ));
  const out = explainShape('devops-deploy-safety', s);
  assert.match(out, /H5, H12/, 'a cluster you cannot open is a cluster you cannot check');
});

test('a fixture verdict says what to do about it', () => {
  const s = shapeOf(run(...['a', 'b', 'c'].map((n) => c(n, 'FAIL', 'refused without an approved gate'))));
  assert.match(explainShape('x', s), /before\s+reading the number as a verdict on the agent/);
});
