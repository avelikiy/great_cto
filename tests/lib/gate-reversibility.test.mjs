// ADR-009 says gates follow cost-of-undo, not pipeline position. The pipeline
// obeys it — `product` is in the default gate set for exactly that reason. The
// BOARD does not: every gate renders as one purple chip, so `gate:ship` to
// production and a brief approval look identical at the moment somebody clicks.
//
// The doctrine lived in the ADR and in the map and never reached the pixel where
// the decision is taken. What is asserted here is the classification and, more
// importantly, the state that keeps it honest: a gate the table has never heard
// of is `unclassified`, never `routine`. Defaulting an unknown gate to cheap is
// the governing defect wearing a colour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  reversibilityOf, describeReversibility, knownGates, CATEGORIES,
} from '../../scripts/lib/gate-reversibility.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

test('the gates that escape the machine are marked expensive', () => {
  const ship = reversibilityOf('gate:ship');
  assert.equal(ship.state, 'expensive');
  assert.ok(ship.categories.includes('escapes-the-machine'));
  assert.ok(ship.categories.includes('costs-money'));

  const imp = reversibilityOf('gate:import');
  assert.equal(imp.state, 'expensive');
  assert.deepEqual(imp.categories, ['destroys-evidence']);
});

test('a gate whose repair is to run the stage again is routine', () => {
  for (const g of ['gate:arch', 'gate:plan', 'gate:code', 'gate:qa', 'gate:security']) {
    assert.equal(reversibilityOf(g).state, 'routine', `${g} is cheap to undo`);
  }
});

test('an unknown gate is unclassified — it does not inherit the cheap treatment', () => {
  // The property the whole module exists for. A project-specific gate, or one
  // added to the map next month, must not arrive on the screen looking judged.
  const r = reversibilityOf('gate:something-new');
  assert.equal(r.state, 'unclassified');
  assert.notEqual(r.state, 'routine');
  assert.match(r.why, /treat as unjudged, not as cheap/);
  assert.match(describeReversibility(r), /^not classified/);
});

test('an absent gate name is unclassified too, not routine', () => {
  for (const bad of [undefined, null, '', '   ']) {
    assert.equal(reversibilityOf(bad).state, 'unclassified', `${JSON.stringify(bad)}`);
  }
});

test('`gate:` prefix is optional and case is not significant', () => {
  assert.equal(reversibilityOf('ship').state, 'expensive');
  assert.equal(reversibilityOf('gate:SHIP').gate, 'ship');
});

test('every gate the pipeline map declares is classified', () => {
  // The check that keeps this table from rotting the way the agent count and the
  // aider flag did: a gate added to shared/pipeline.toml and not to the cost
  // table fails here, rather than appearing on the board as unclassified and
  // being noticed by nobody.
  const toml = readFileSync(path.join(ROOT, 'shared/pipeline.toml'), 'utf8');
  const declared = [...toml.matchAll(/"(gate:[a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(declared.length >= 5, 'the map declares gates to check against');
  const missing = [...new Set(declared)].filter((g) => reversibilityOf(g).state === 'unclassified');
  assert.deepEqual(missing, [],
    `unclassified gate(s) in the map: ${missing.join(', ')} — add them to gate-reversibility.mjs with a reason`);
});

test('every category cited by a gate is a category that exists', () => {
  for (const g of knownGates()) {
    for (const c of reversibilityOf(g).categories) {
      assert.ok(CATEGORIES[c], `${g} cites unknown category '${c}'`);
    }
  }
});

test('every classification carries a reason a person can disagree with', () => {
  for (const g of knownGates()) {
    const r = reversibilityOf(g);
    assert.ok(r.why && r.why.length > 20, `${g} states why`);
  }
});

test('the inbox attaches it — a classifier nothing consults is not a classifier', () => {
  const src = readFileSync(path.join(ROOT, 'packages/board/lib/data-readers.mjs'), 'utf8');
  assert.match(src, /gate-reversibility\.mjs/, 'the reader imports it');
  assert.match(src, /reversibility: reversibilityOf\(/, 'and puts it on every pending gate');
});
