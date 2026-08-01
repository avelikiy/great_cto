// `ask_kimi` sat in the tools list of nineteen agents and was invoked by none.
// The obvious use — a second model grading the first one's report — is the wrong
// one twice over: a reviewer judges plausibility, which is what a confident
// wrong finding already passes, and two models agreeing is weak evidence because
// they fail in correlated ways.
//
// So what these tests pin is the inversion: agreement is reported as an absence
// of signal, divergence is the output, and an abstention is neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  walk, compare, secondOpinion, explainComparison, DIVERGENCE,
} from '../../scripts/lib/second-opinion.mjs';

// A three-question graph: cites a location? → reproducible? → severity claimed?
const DAG = {
  root: 'q1',
  nodes: {
    q1: { question: 'Does the finding cite a file:line?', edges: { yes: 'q2', no: 'leaf_weak' } },
    q2: { question: 'Is there a command that reproduces it?', edges: { yes: 'q3', no: 'leaf_partial' } },
    q3: { question: 'Does the severity match the evidence?', edges: { yes: 'leaf_good', no: 'leaf_partial' } },
  },
  leaves: {
    leaf_good: { score: 1, reason: 'located, reproducible, calibrated' },
    leaf_partial: { score: 0.5, reason: 'located but not fully established' },
    leaf_weak: { score: 0, reason: 'no location' },
  },
};

/** A judge that answers from a script keyed by node id. */
const scripted = (byId) => async (question) => {
  const id = Object.keys(DAG.nodes).find((k) => DAG.nodes[k].question === question);
  return byId[id] ?? 'yes';
};

// ── walking ────────────────────────────────────────────────────────────────

test('a judge answers every node on its path', async () => {
  const w = await walk(DAG, scripted({ q1: 'yes', q2: 'yes', q3: 'yes' }));
  assert.deepEqual(w.asked.map((s) => s.id), ['q1', 'q2', 'q3']);
  assert.equal(w.result.score, 1);
});

test('a judge that takes a short branch stops there', async () => {
  const w = await walk(DAG, scripted({ q1: 'no' }));
  assert.deepEqual(w.asked.map((s) => s.id), ['q1']);
  assert.equal(w.result.score, 0);
});

test('an unusable reply ends the walk but keeps what was answered', async () => {
  const w = await walk(DAG, scripted({ q1: 'yes', q2: 'maybe?' }));
  assert.equal(w.asked.length, 2);
  assert.equal(w.asked[1].answer, null);
  assert.equal(w.result.score, null, 'a guessed answer would be a guessed score wearing a decision tree');
});

// ── the inversion ──────────────────────────────────────────────────────────

test('agreement is reported as weak evidence, never as confirmation', async () => {
  const same = { q1: 'yes', q2: 'yes', q3: 'yes' };
  const cmp = await secondOpinion(DAG, scripted(same), scripted(same));
  assert.equal(cmp.verdict, DIVERGENCE.AGREE);
  assert.deepEqual(cmp.diverged, []);
  assert.match(cmp.summary, /weak evidence, not confirmation/,
    'two models trained on overlapping data agreeing is close to no information');
});

test('divergence names the question, which is the whole point', async () => {
  const cmp = await secondOpinion(
    DAG,
    scripted({ q1: 'yes', q2: 'yes', q3: 'yes' }),
    scripted({ q1: 'yes', q2: 'no' }),
  );
  assert.equal(cmp.verdict, DIVERGENCE.DIVERGE);
  assert.equal(cmp.diverged.length, 1);
  assert.equal(cmp.diverged[0].id, 'q2');
  assert.match(cmp.diverged[0].question, /reproduces it/);
  assert.equal(cmp.diverged[0].a, 'yes');
  assert.equal(cmp.diverged[0].b, 'no');
  assert.match(cmp.summary, /that is where to look/);
});

test('a node only one judge reached is not a disagreement', async () => {
  // They part at q1, so q2 and q3 exist for one judge only. The node that parted
  // them is already recorded; counting the rest would inflate the signal.
  const cmp = await secondOpinion(DAG, scripted({ q1: 'yes', q2: 'yes', q3: 'yes' }), scripted({ q1: 'no' }));
  assert.deepEqual(cmp.diverged.map((d) => d.id), ['q1']);
});

test('an abstention is a third state, not a vote', async () => {
  const cmp = await secondOpinion(
    DAG,
    scripted({ q1: 'yes', q2: 'yes', q3: 'yes' }),
    scripted({ q1: 'unclear' }),
  );
  assert.equal(cmp.verdict, DIVERGENCE.ABSTAINED);
  assert.deepEqual(cmp.diverged, []);
  assert.equal(cmp.abstained.length, 1);
  assert.equal(cmp.abstained[0].by, 'b');
  assert.match(cmp.summary, /no comparison possible/,
    'calling an abstention agreement would let a broken judge confirm anything');
});

test('both abstaining is recorded as both, not as one', async () => {
  const cmp = compare(
    { asked: [{ id: 'q1', question: 'Q', answer: null }], result: { score: null } },
    { asked: [{ id: 'q1', question: 'Q', answer: null }], result: { score: null } },
  );
  assert.equal(cmp.abstained[0].by, 'both');
});

// ── scores ─────────────────────────────────────────────────────────────────

test('both scores are reported, so a divergence in outcome is visible', async () => {
  const cmp = await secondOpinion(
    DAG,
    scripted({ q1: 'yes', q2: 'yes', q3: 'yes' }),
    scripted({ q1: 'yes', q2: 'no' }),
  );
  assert.equal(cmp.scores.a, 1);
  assert.equal(cmp.scores.b, 0.5);
});

test('the two judges are asked independently', async () => {
  // A second opinion that saw the first one's answer is not a second opinion.
  const seen = { a: [], b: [] };
  const spy = (tag, byId) => async (question) => {
    seen[tag].push(question);
    const id = Object.keys(DAG.nodes).find((k) => DAG.nodes[k].question === question);
    return byId[id] ?? 'yes';
  };
  await secondOpinion(DAG, spy('a', { q1: 'yes', q2: 'yes', q3: 'yes' }), spy('b', { q1: 'yes', q2: 'yes', q3: 'no' }));
  assert.ok(seen.a.length > 0 && seen.b.length > 0);
  assert.deepEqual(seen.a.slice(0, 2), seen.b.slice(0, 2), 'same questions, asked of each separately');
});

// ── the report ─────────────────────────────────────────────────────────────

test('the report leads with divergence, because that is the actionable part', async () => {
  const cmp = await secondOpinion(
    DAG,
    scripted({ q1: 'yes', q2: 'yes', q3: 'yes' }),
    scripted({ q1: 'yes', q2: 'yes', q3: 'no' }),
  );
  const out = explainComparison(cmp);
  assert.match(out, /severity match/);
  assert.match(out, /judge A: yes/);
  assert.match(out, /judge B: no/);
  assert.match(out, /scores differ: 1 vs 0\.5/);
});

test('a clean comparison says so without claiming more than it knows', async () => {
  const same = { q1: 'yes', q2: 'yes', q3: 'yes' };
  const out = explainComparison(await secondOpinion(DAG, scripted(same), scripted(same)));
  assert.match(out, /weak evidence/);
  assert.ok(!/confident|verified|confirmed/i.test(out), 'no word in the report may overstate agreement');
});
