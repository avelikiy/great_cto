// The measurement behind ADR-039 must be re-takeable, and its classes must mean
// what the ADR says they mean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphOf, classify } from '../../scripts/graph-adherence.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const g = graphOf(readFileSync(join(ROOT, 'shared', 'pipeline.toml'), 'utf8'));

test('the measured hole is off-graph', () => {
  assert.equal(classify(g, 'product-owner', 'design-advisor'), 'off-graph');
});

test('the paths the graph allows in other ways are not off-graph', () => {
  assert.equal(classify(g, 'product-owner', 'architect'), 'on-graph');
  assert.equal(classify(g, 'architect', 'senior-dev'), 'graph-skip');   // pm skipped at small depth
  assert.equal(classify(g, 'code-reviewer', 'senior-dev'), 'rework');
  assert.equal(classify(g, 'qa-engineer', 'security-officer'), 'parallel');
  assert.equal(classify(g, 'senior-dev', 'senior-dev'), 'repeat');
  assert.equal(classify(g, 'devops', 'product-owner'), 'new-chain');
});
