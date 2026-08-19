// Where did this claim come from?
//
// The sibling of proof-status.mjs, which asks whether a CHECK proved anything.
// The discovery side had no equivalent, and the gap shows in a real brief here:
//
//     22 projects × ~3 opens/day ≈ 66 context-switches a day
//
// The `~3` came from nowhere. The rule at the time asked the author to SHOW THE
// ARITHMETIC, and this shows it — a plausible multiplier times a plausible
// multiplier, visible working, no provenance. Two sentences later the same
// document says `2 of ~20 readers`, which was counted. They render identically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVENANCE, PROVENANCE_ORDER, isProvenance, assertProvenance,
  rank, atLeast, weakest, settle, carriesAFigure, describe,
} from '../../scripts/lib/provenance-status.mjs';

test('the ladder is ordered, and the order is the meaning', () => {
  // Callers compare by rank so a level added later does not fall out of every
  // comparison written before it.
  assert.deepEqual(PROVENANCE_ORDER, ['asserted', 'derived', 'cited', 'observed', 'measured']);
  assert.ok(rank(PROVENANCE.MEASURED) > rank(PROVENANCE.OBSERVED));
  assert.ok(rank(PROVENANCE.CITED) > rank(PROVENANCE.ASSERTED));
});

test('an unknown level is the floor, never a better one', () => {
  assert.equal(rank('extremely-measured'), 0);
  assert.equal(rank(undefined), 0);
  assert.equal(isProvenance('probably'), false);
  assert.throws(() => assertProvenance('probably'), TypeError);
});

test('atLeast is the only comparison a caller should need', () => {
  assert.equal(atLeast(PROVENANCE.OBSERVED, PROVENANCE.CITED), true);
  assert.equal(atLeast(PROVENANCE.DERIVED, PROVENANCE.CITED), false);
  assert.equal(atLeast(PROVENANCE.CITED, PROVENANCE.CITED), true, 'the floor is inclusive');
});

// ── Self-report is the thing this module exists not to trust ────────────────

test('a claim tagged measured with no n is an assertion wearing the word', () => {
  const s = settle({ level: 'measured', locator: 'ab-test-42' });
  assert.notEqual(s.level, PROVENANCE.MEASURED);
  assert.equal(s.downgraded, true);
  assert.match(s.why, /claims measured without n/);
});

test('a claim that carries what its level requires keeps it', () => {
  const s = settle({ level: 'measured', locator: 'ab-test-42', n: 400, method: 'A/B' });
  assert.equal(s.level, PROVENANCE.MEASURED);
  assert.equal(s.downgraded, false);
  assert.deepEqual(s.missing, []);
});

test('a citation with no date is not citable', () => {
  // A source nobody can re-open is an assertion with a URL next to it.
  const s = settle({ level: 'cited', locator: 'https://example.com/pricing' });
  assert.ok(rank(s.level) < rank(PROVENANCE.CITED));
  assert.deepEqual(s.missing, ['date']);
});

test('n must be a real count, not the string "many"', () => {
  assert.ok(rank(settle({ level: 'observed', locator: 'interviews', n: 0 }).level) < rank(PROVENANCE.OBSERVED));
  assert.ok(rank(settle({ level: 'observed', locator: 'interviews', n: 'lots' }).level) < rank(PROVENANCE.OBSERVED));
  assert.equal(settle({ level: 'observed', locator: 'interviews', n: 12 }).level, PROVENANCE.OBSERVED);
});

test('an untagged claim settles as an assumption and says so', () => {
  // The default is stated out loud rather than left blank — the whole point is
  // that an unlabelled claim should LOOK like the assertion it is.
  assert.equal(settle({}).level, PROVENANCE.ASSERTED);
  assert.equal(describe({}), 'ASSUMPTION');
});

// ── A derivation is worth its weakest input ─────────────────────────────────

test('a derivation cannot outrank what it multiplies', () => {
  // `22 projects × ~3 opens/day`: one counted, one invented. The product is
  // invented, and saying so is this function's entire job.
  const s = settle({ level: 'derived', inputs: ['observed', 'asserted'] });
  assert.equal(s.level, PROVENANCE.ASSERTED);
});

test('a derivation from sound inputs is capped at derived, not promoted', () => {
  const s = settle({ level: 'derived', inputs: ['measured', 'measured'] });
  assert.equal(s.level, PROVENANCE.DERIVED, 'arithmetic over measurements is still arithmetic');
});

test('weakest over nothing is an assumption, not a measurement', () => {
  // A derivation from no inputs is a belief with an equals sign. The reduce seed
  // is MEASURED, so an empty list would otherwise return the strongest value.
  assert.equal(weakest([]), PROVENANCE.ASSERTED);
  assert.equal(weakest(['cited', 'garbage']), PROVENANCE.ASSERTED, 'an unreadable input is not a strong one');
});

// ── What may be put in front of a decision-maker ────────────────────────────

test('CITED is the floor for a figure, not OBSERVED', () => {
  // A competitor's published pricing is a fact about the world even though
  // nobody here watched a user. Below that the figure is the author's belief —
  // which may be written, but not presented as a measurement.
  assert.equal(carriesAFigure({ level: 'cited', locator: 'vendor pricing page', date: '2026-08-01' }), true);
  assert.equal(carriesAFigure({ level: 'derived', inputs: ['asserted'] }), false);
  assert.equal(carriesAFigure({}), false);
});

test('describe never renders an assumption as evidence', () => {
  assert.equal(describe({ level: 'measured', locator: 'x', n: 9, method: 'ab' }), 'MEASURED');
  assert.match(describe({ level: 'measured', locator: 'x' }), /^ASSUMPTION/);
});
