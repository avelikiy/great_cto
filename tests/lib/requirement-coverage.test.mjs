// Spec Kit's `analyze` stage, adapted: did the plan cover what the brief asked?
//
// `artifact-lint` checks inside a document. Nothing here asked the question
// between them, so a brief could raise five things, the architecture address
// three, and every check stay green because each document is individually
// well-formed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requirements, citations, coverage, describeCoverage } from '../../scripts/lib/requirement-coverage.mjs';

const BRIEF = `## Scope

- **R1** — one screen names what needs a decision
- R2: an empty project reads differently from an unreadable one
### R3 — cost per project is visible without switching

Later we revisit R1 in passing.
`;

// ── Declaring vs mentioning ─────────────────────────────────────────────────

test('a requirement is declared at the start of a list item or heading', () => {
  const r = requirements(BRIEF);
  assert.deepEqual([...r.keys()], ['R1', 'R2', 'R3']);
  assert.match(r.get('R1'), /one screen names/);
  assert.match(r.get('R2'), /empty project reads differently/);
  assert.match(r.get('R3'), /cost per project/);
});

test('a mid-sentence mention does not declare anything', () => {
  // Otherwise a document could declare requirements by talking about them, and
  // the check would measure how often a number appears rather than coverage.
  const r = requirements('We should revisit R7 at some point, and R8 too.');
  assert.equal(r.size, 0);
});

test('the first declaration wins over a later restatement', () => {
  const r = requirements('- **R1** — the real definition\n- R1: a later restatement\n');
  assert.match(r.get('R1'), /the real definition/);
});

test('a declaration with no summary says so rather than reading as empty', () => {
  const r = requirements('- **R4**\n');
  assert.match(r.get('R4'), /no summary/);
});

test('citations are found wherever they appear', () => {
  const c = citations('We address R1 by folding the inbox; R2 needs a header. See R2 again.');
  assert.deepEqual([...c].sort(), ['R1', 'R2']);
});

test('a longer identifier is not a requirement citation', () => {
  assert.equal(citations('RELEASE1 and ROUTE12 and RC3 are unrelated').size, 0);
});

// ── The three answers ───────────────────────────────────────────────────────

test('a requirement nothing mentions downstream is uncovered', () => {
  const cov = coverage({ brief: BRIEF, downstream: [{ name: 'ARCH.md', text: 'R1 and R2 are handled.' }] });
  assert.equal(cov.state, 'gaps');
  assert.deepEqual(cov.uncovered.map((u) => u.id), ['R3']);
  assert.match(cov.uncovered[0].summary, /cost per project/, 'the report carries the text, not just the number');
});

test('a citation of an ID the brief never declared is dangling', () => {
  // Usually a typo; occasionally a requirement someone deleted while work
  // continued against it, which is the more interesting case and the one a
  // two-state answer would hide.
  const cov = coverage({ brief: BRIEF, downstream: [{ name: 'PLAN.md', text: 'R1 R2 R3 and R9' }] });
  assert.equal(cov.state, 'complete');
  assert.deepEqual(cov.dangling.map((d) => d.id), ['R9']);
  assert.deepEqual(cov.dangling[0].by, ['PLAN.md']);
});

test('full coverage says so', () => {
  const cov = coverage({ brief: BRIEF, downstream: [{ name: 'A', text: 'R1 R2' }, { name: 'B', text: 'R3' }] });
  assert.equal(cov.state, 'complete');
  assert.equal(cov.uncovered.length, 0);
  assert.equal(cov.covered.length, 3);
  assert.deepEqual(cov.covered.find((c) => c.id === 'R3').by, ['B'], 'and names which document covered it');
});

test('coverage records every document that mentions a requirement', () => {
  const cov = coverage({ brief: BRIEF, downstream: [{ name: 'A', text: 'R1' }, { name: 'B', text: 'R1' }] });
  assert.deepEqual(cov.covered.find((c) => c.id === 'R1').by, ['A', 'B']);
});

// ── A brief with no convention is not a brief with no coverage ──────────────

test('a brief that declares nothing reports that, not zero coverage', () => {
  // Every brief written before this convention has no IDs. Reporting "0 of 0
  // covered, all good" would be an absent measurement wearing a result's
  // clothes — the defect this repository keeps removing.
  const cov = coverage({ brief: '## Problem\n\nProse, no numbers.\n', downstream: [{ name: 'A', text: 'anything' }] });
  assert.equal(cov.state, 'no-requirements');
  assert.match(cov.why, /declares no R-numbered requirements/);
  assert.deepEqual(cov.uncovered, []);
});

test('no downstream documents at all means everything is uncovered', () => {
  const cov = coverage({ brief: BRIEF, downstream: [] });
  assert.equal(cov.state, 'gaps');
  assert.equal(cov.uncovered.length, 3);
});

test('a downstream document that could not be read is simply absent, not a gap of its own', () => {
  const cov = coverage({ brief: BRIEF, downstream: [{ name: 'A', text: null }, { name: 'B', text: 'R1 R2 R3' }] });
  assert.equal(cov.state, 'complete');
});

test('the report names the requirement text so a reader can act without opening the brief', () => {
  const cov = coverage({ brief: BRIEF, downstream: [{ name: 'A', text: 'R1' }] });
  const out = describeCoverage(cov);
  assert.match(out, /uncovered\s+R2 — an empty project/);
  assert.match(out, /uncovered\s+R3 — cost per project/);
});

test('describeCoverage on a complete brief is one honest line', () => {
  const cov = coverage({ brief: BRIEF, downstream: [{ name: 'A', text: 'R1 R2 R3' }] });
  assert.equal(describeCoverage(cov), cov.why);
});
