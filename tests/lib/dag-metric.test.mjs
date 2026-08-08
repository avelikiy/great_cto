// Our judge returns 0.44 against a 1.00 bar with ±0.09 of sampling noise, and
// fourteen of eighteen recorded results sit below their own threshold. Asking a
// model for a number is the problem: the number is sampled, not derived.
//
// A DAG asks narrow questions a judge can answer the same way twice, and COMPUTES
// the score from the path taken. So the properties worth pinning are the ones
// that keep the arithmetic honest: the same answers always give the same score,
// a question nobody answered stops the walk instead of defaulting, and a graph
// that cannot produce a score fails at validation rather than at judgement time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDag, evaluateDag, pendingQuestion, explain,
  questionPrompt, parseAnswer, judgeWithDag, dagFingerprint,
} from '../../scripts/lib/dag-metric.mjs';

// Does a finding carry evidence, and is its severity calibrated? Two questions,
// four outcomes — the shape a reviewer actually needs.
const DAG = {
  id: 'finding-quality',
  root: 'has-evidence',
  nodes: {
    'has-evidence': {
      question: 'Does the finding cite a file:line, a commit, a metric with units, or a CVE?',
      edges: { yes: 'severity-calibrated', no: 'leaf-no-evidence' },
    },
    'severity-calibrated': {
      question: 'Does the stated severity match the evidence, neither over- nor under-stated?',
      edges: { yes: 'leaf-good', no: 'leaf-miscalibrated' },
    },
  },
  leaves: {
    'leaf-good': { score: 1, reason: 'evidence cited and severity matches it' },
    'leaf-miscalibrated': { score: 0.5, reason: 'evidence cited but severity does not follow from it' },
    'leaf-no-evidence': { score: 0, reason: 'no evidence pointer — a guess, not a finding' },
  },
};

// ── validation catches the graph, not the run ───────────────────────────────

test('a well-formed graph validates', () => {
  assert.deepEqual(validateDag(DAG).errors, []);
});

test('a cycle is caught at validation, not discovered mid-walk', () => {
  const bad = { ...DAG, nodes: { ...DAG.nodes,
    'severity-calibrated': { question: 'q', edges: { yes: 'has-evidence', no: 'leaf-good' } } } };
  assert.match(validateDag(bad).errors.join(' '), /cycle/i);
});

test('an edge pointing nowhere is caught', () => {
  const bad = { ...DAG, nodes: { ...DAG.nodes,
    'has-evidence': { question: 'q', edges: { yes: 'nope', no: 'leaf-no-evidence' } } } };
  assert.match(validateDag(bad).errors.join(' '), /nope/);
});

test('a leaf without a score is caught — an unscored leaf is a silent zero', () => {
  const bad = { ...DAG, leaves: { ...DAG.leaves, 'leaf-good': { reason: 'fine' } } };
  assert.match(validateDag(bad).errors.join(' '), /leaf-good/);
});

test('a score outside 0..1 is caught', () => {
  const bad = { ...DAG, leaves: { ...DAG.leaves, 'leaf-good': { score: 1.5, reason: 'x' } } };
  assert.match(validateDag(bad).errors.join(' '), /0..1|range/i);
});

test('an unreachable leaf is reported, since it means a branch was lost', () => {
  const orphaned = { ...DAG, leaves: { ...DAG.leaves, 'leaf-ghost': { score: 0.9, reason: 'x' } } };
  assert.match(validateDag(orphaned).warnings.join(' '), /leaf-ghost/);
});

// ── the walk ────────────────────────────────────────────────────────────────

test('the score comes from the leaf the answers reach', () => {
  const r = evaluateDag(DAG, { 'has-evidence': 'yes', 'severity-calibrated': 'yes' });
  assert.equal(r.score, 1);
  assert.equal(r.leaf, 'leaf-good');
  assert.deepEqual(r.path, ['has-evidence', 'severity-calibrated', 'leaf-good']);
});

test('a different path gives a different score, computed and not sampled', () => {
  assert.equal(evaluateDag(DAG, { 'has-evidence': 'no' }).score, 0);
  assert.equal(evaluateDag(DAG, { 'has-evidence': 'yes', 'severity-calibrated': 'no' }).score, 0.5);
});

test('the same answers always give the same score', () => {
  const a = { 'has-evidence': 'yes', 'severity-calibrated': 'no' };
  const runs = Array.from({ length: 20 }, () => evaluateDag(DAG, a).score);
  assert.equal(new Set(runs).size, 1, 'a judge that varies is a judge nobody can act on');
});

test('an unanswered question stops the walk and names itself', () => {
  const r = evaluateDag(DAG, { 'has-evidence': 'yes' });
  assert.equal(r.score, null, 'a missing answer must not become a default score');
  assert.equal(r.pending, 'severity-calibrated');
  assert.match(r.question, /severity/i);
});

test('an answer no edge accepts is an error, not a coin flip', () => {
  const r = evaluateDag(DAG, { 'has-evidence': 'maybe' });
  assert.equal(r.score, null);
  assert.match(r.error, /maybe/);
});

test('answers for nodes off the path are ignored, not blended in', () => {
  const r = evaluateDag(DAG, { 'has-evidence': 'no', 'severity-calibrated': 'yes' });
  assert.equal(r.score, 0, 'the branch not taken has no vote');
  assert.deepEqual(r.path, ['has-evidence', 'leaf-no-evidence']);
});

// ── driving a judge one question at a time ──────────────────────────────────

test('pendingQuestion asks the root first, then the next node on the path', () => {
  assert.equal(pendingQuestion(DAG, {}).id, 'has-evidence');
  assert.equal(pendingQuestion(DAG, { 'has-evidence': 'yes' }).id, 'severity-calibrated');
  assert.equal(pendingQuestion(DAG, { 'has-evidence': 'no' }), null, 'a finished walk asks nothing');
});

test('a pending question carries its allowed answers, so a judge cannot invent one', () => {
  assert.deepEqual(pendingQuestion(DAG, {}).answers.sort(), ['no', 'yes']);
});

// ── the verdict a human reads ───────────────────────────────────────────────

test('explain prints the questions, the answers, and why the score is what it is', () => {
  const text = explain(evaluateDag(DAG, { 'has-evidence': 'yes', 'severity-calibrated': 'no' }), DAG);
  assert.match(text, /0\.5/);
  assert.match(text, /severity does not follow/);
  assert.match(text, /yes/);
});

test('explain on an unfinished walk says what is missing rather than a score', () => {
  const text = explain(evaluateDag(DAG, {}), DAG);
  assert.match(text, /unanswered|pending/i);
  assert.doesNotMatch(text, /score: [0-9]/i);
});

// ── junk in ─────────────────────────────────────────────────────────────────

test('a graph with no root or no nodes fails validation instead of throwing', () => {
  for (const bad of [{}, { root: 'x' }, { root: 'x', nodes: {} }]) {
    assert.ok(validateDag(bad).errors.length > 0);
  }
});

test('evaluating a graph that does not validate returns the error, not a number', () => {
  const r = evaluateDag({ root: 'x', nodes: {}, leaves: {} }, {});
  assert.equal(r.score, null);
  assert.ok(r.error);
});

// ── the DAG we ship ─────────────────────────────────────────────────────────
//
// A metric checked into the repo rots the same way a doc does. This walks every
// path of the shipped graph, so a dropped branch or an unscored leaf fails here
// rather than during a judging run somebody paid for.

test('the shipped finding-gate DAG validates and every path reaches a score', async () => {
  const { readFileSync } = await import('node:fs');
  const dag = JSON.parse(readFileSync(
    new URL('../eval/dags/security-officer-finding-gate.dag.json', import.meta.url), 'utf8'));

  const { errors, warnings } = validateDag(dag);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [], 'an unreachable leaf means a branch was lost in an edit');

  // Exhaustive walk: every combination of answers must land on a scored leaf.
  const paths = [];
  const walk = (id, answers) => {
    if (dag.leaves[id]) { paths.push({ answers, leaf: id }); return; }
    for (const [answer, next] of Object.entries(dag.nodes[id].edges)) {
      walk(next, { ...answers, [id]: answer });
    }
  };
  walk(dag.root, {});
  assert.ok(paths.length >= 6, `expected every branch to be walkable, got ${paths.length}`);
  for (const { answers, leaf } of paths) {
    const r = evaluateDag(dag, answers);
    assert.equal(r.leaf, leaf);
    assert.ok(typeof r.score === 'number', `path to ${leaf} produced no score`);
  }
});

test('the shipped DAG scores the eval\'s own holdout cases the way the eval says', async () => {
  const { readFileSync } = await import('node:fs');
  const dag = JSON.parse(readFileSync(
    new URL('../eval/dags/security-officer-finding-gate.dag.json', import.meta.url), 'utf8'));

  // H1 — SQL injection, cited, blocked: the eval calls this a pass.
  assert.equal(evaluateDag(dag, {
    'exploit-path-shown': 'yes', 'finding-raised': 'yes', 'evidence-cited': 'yes',
    'severity-from-context': 'yes', 'gate-matches-severity': 'yes',
  }).score, 1);

  // H2 — a variable rename that blocks nothing: restraint is also a pass.
  assert.equal(evaluateDag(dag, {
    'exploit-path-shown': 'no', 'restraint-held': 'yes',
  }).score, 1);

  // H3 — MD5 for an ETag flagged P0 on the algorithm name: the failure mode.
  assert.equal(evaluateDag(dag, {
    'exploit-path-shown': 'no', 'restraint-held': 'no',
  }).score, 0);

  // A real vector found but reported with no file:line is not a full pass.
  const noEvidence = evaluateDag(dag, {
    'exploit-path-shown': 'yes', 'finding-raised': 'yes', 'evidence-cited': 'no',
  });
  assert.ok(noEvidence.score > 0 && noEvidence.score < 0.5,
    'partial credit, because catching it matters and citing it also matters');
});

// ── driving a real judge ────────────────────────────────────────────────────
//
// The judge's job is now a choice from a closed set. These pin the two ways that
// can still go wrong: a reply nobody can map, and a reply that looks like it
// mentions every option.

test('the question prompt names the allowed answers and forbids anything else', () => {
  const { system, user } = questionPrompt('Did it cite a file:line?', ['yes', 'no'],
    { scenario: 'S', test: 'T', actorResponse: 'R' });
  assert.match(system, /exactly one word: yes or no/);
  assert.match(user, /Question: Did it cite a file:line\?/);
  assert.match(user, /Agent response:\nR/);
});

test('the prompt tells the judge which way to fall when the response is silent', () => {
  const { system } = questionPrompt('q', ['yes', 'no']);
  assert.match(system, /did NOT do it \(no\)/,
    'silence must not be credited as compliance');
});

test('a clean reply parses, with or without punctuation and framing', () => {
  for (const r of ['yes', 'YES', 'yes.', ' Yes\n', 'Answer: yes']) {
    assert.equal(parseAnswer(r, ['yes', 'no']), 'yes', r);
  }
});

test('a reply naming every option resolves to nothing, not to the first one', () => {
  assert.equal(parseAnswer('yes or no', ['yes', 'no']), null);
  assert.equal(parseAnswer('', ['yes', 'no']), null);
  assert.equal(parseAnswer('maybe', ['yes', 'no']), null);
  assert.equal(parseAnswer(null, ['yes', 'no']), null);
});

test('judgeWithDag walks the graph one question at a time and computes the score', async () => {
  const asked = [];
  const ask = async (q, allowed) => { asked.push(q); return asked.length === 1 ? 'yes' : 'no'; };
  const r = await judgeWithDag(DAG, ask);
  assert.equal(asked.length, 2, 'it asks only the questions on the path taken');
  assert.equal(r.score, 0.5);
  assert.deepEqual(r.answers, { 'has-evidence': 'yes', 'severity-calibrated': 'no' });
});

test('judgeWithDag stops short of a score when the judge answers unusably', async () => {
  const r = await judgeWithDag(DAG, async () => 'it depends');
  assert.equal(r.score, null, 'an unusable answer must not become a guessed score');
  assert.match(r.error, /no usable answer/);
  assert.equal(r.asked.length, 1, 'and it stops asking rather than pushing on');
});

test('judgeWithDag keeps every reply, so a disputed score can be re-read', async () => {
  const r = await judgeWithDag(DAG, async () => 'yes');
  assert.equal(r.asked.length, 2);
  for (const a of r.asked) {
    assert.ok(a.question && a.reply && a.answer, 'each step records what was asked and answered');
  }
});

// A judge answer is whatever the graph author wrote in `edges`. Bounding the
// match with \b assumed those labels start and end with word characters, so a
// perfectly legal label like `yes(1)` or `p0.` could never be matched — the
// judge would answer correctly, parseAnswer would return null, and the whole
// eval would report 0% while measuring nothing. validateDag accepts such labels,
// so nothing upstream would have caught it.

test('an answer label ending in punctuation still matches', () => {
  assert.equal(parseAnswer('yes(1)', ['yes(1)', 'no']), 'yes(1)');
  assert.equal(parseAnswer('p0.', ['p0.', 'p1']), 'p0.');
  assert.equal(parseAnswer('(n/a)', ['(n/a)', 'yes']), '(n/a)');
});

test('punctuated labels keep the ambiguity guard', () => {
  assert.equal(parseAnswer('yes(1) or no', ['yes(1)', 'no']), null);
});

test('a label is still matched as a whole token, not a substring', () => {
  assert.equal(parseAnswer('yesterday', ['yes', 'no']), null,
    'a longer word containing the label is not the label');
});

// ── fingerprinting the metric, not the run ──────────────────────────────────
//
// Two eval runs judged by different graphs are not comparable (ARCH-judge-
// provenance §1). dagFingerprint answers "did the metric change?" — so it must
// move when the scoring structure (question wording, edge targets, leaf scores)
// changes, and must NOT move for edits that are documentation only (`note`,
// a leaf's `reason`) or purely cosmetic (key order in the source file).

test('dagFingerprint returns a 12-character lowercase hex string', () => {
  const hash = dagFingerprint(DAG);
  assert.equal(hash.length, 12);
  assert.match(hash, /^[0-9a-f]{12}$/, `expected lowercase hex, got '${hash}'`);
});

test('key order at every level of the source object does not change the hash', () => {
  const reordered = {
    leaves: {
      'leaf-no-evidence': DAG.leaves['leaf-no-evidence'],
      'leaf-miscalibrated': DAG.leaves['leaf-miscalibrated'],
      'leaf-good': DAG.leaves['leaf-good'],
    },
    nodes: {
      'severity-calibrated': {
        question: DAG.nodes['severity-calibrated'].question,
        edges: { no: 'leaf-miscalibrated', yes: 'leaf-good' }, // edges reversed too
      },
      'has-evidence': {
        question: DAG.nodes['has-evidence'].question,
        edges: { no: 'leaf-no-evidence', yes: 'severity-calibrated' }, // edges reversed too
      },
    },
    root: DAG.root,
    id: DAG.id,
  };
  assert.equal(dagFingerprint(DAG), dagFingerprint(reordered),
    'reordering keys must not change what is, in substance, the same graph');
});

test('changing a node\'s question text changes the hash', () => {
  const changed = {
    ...DAG,
    nodes: { ...DAG.nodes, 'has-evidence': {
      ...DAG.nodes['has-evidence'], question: 'Is there any evidence at all, cited or not?' } },
  };
  assert.notEqual(dagFingerprint(DAG), dagFingerprint(changed));
});

test('retargeting an edge changes the hash', () => {
  const changed = {
    ...DAG,
    nodes: { ...DAG.nodes, 'has-evidence': {
      ...DAG.nodes['has-evidence'], edges: { yes: 'leaf-good', no: 'leaf-no-evidence' } } },
  };
  assert.notEqual(dagFingerprint(DAG), dagFingerprint(changed));
});

test('changing a leaf\'s score changes the hash', () => {
  const changed = {
    ...DAG,
    leaves: { ...DAG.leaves, 'leaf-good': { ...DAG.leaves['leaf-good'], score: 0.9 } },
  };
  assert.notEqual(dagFingerprint(DAG), dagFingerprint(changed));
});

test('changing a leaf\'s reason does NOT change the hash — it is documentation, not the metric', () => {
  const changed = {
    ...DAG,
    leaves: { ...DAG.leaves, 'leaf-good': {
      ...DAG.leaves['leaf-good'], reason: 'a totally rewritten explanation of the same score' } },
  };
  assert.equal(dagFingerprint(DAG), dagFingerprint(changed));
});

test('changing the DAG\'s top-level note does NOT change the hash', () => {
  const noteA = { ...DAG, note: 'draft, needs review' };
  const noteB = { ...DAG, note: 'reviewed and signed off' };
  assert.equal(dagFingerprint(noteA), dagFingerprint(noteB));
  assert.equal(dagFingerprint(DAG), dagFingerprint(noteA),
    'adding a note where none existed must not move the hash either');
});

// A null entry INSIDE nodes or leaves threw, where an absent `nodes` did not:
// the function was safe against every malformed shape someone thought to try and
// unsafe against one nobody did. Found by review after six acceptance criteria
// had been checked by hand and passed — all of them on well-formed input.
// This runs inside an eval run that has already been paid for.

test('a null entry inside nodes or leaves does not throw', () => {
  assert.match(dagFingerprint({ root: 'n1', nodes: { n1: null }, leaves: { l1: { score: 1 } } }), /^[0-9a-f]{12}$/);
  assert.match(dagFingerprint({ root: 'n1', nodes: { n1: { question: 'q', edges: {} } }, leaves: { l1: null } }), /^[0-9a-f]{12}$/);
  assert.match(dagFingerprint({ nodes: { a: undefined }, leaves: { b: undefined } }), /^[0-9a-f]{12}$/);
});

test('a null node is not the same graph as no node at all', () => {
  // Collapsing them would let a broken graph share a fingerprint with a valid
  // one, which is worse than having no fingerprint.
  assert.notEqual(
    dagFingerprint({ nodes: { a: null }, leaves: {} }),
    dagFingerprint({ nodes: {}, leaves: {} }),
  );
});

test('null-safety did not cost sensitivity', () => {
  const ok = { root: 'a', nodes: { a: { question: 'q1', edges: { yes: 'L1' } } }, leaves: { L1: { score: 1, reason: 'x' } } };
  const h = dagFingerprint(ok);
  assert.notEqual(dagFingerprint({ ...ok, leaves: { L1: { score: 0, reason: 'x' } } }), h, 'score still matters');
  assert.equal(dagFingerprint({ ...ok, leaves: { L1: { score: 1, reason: 'different' } } }), h, 'reason still does not');
});
