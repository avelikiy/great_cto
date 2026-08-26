// A stage declares what it produces, and something counts the ones that do not.
//
// The measured gap: of seven scored runs, three came back `unverifiable` — not
// "the check failed" but "there was nothing to check", because those stages name
// no artefact. A stage that declares nothing was the cheapest way to pass
// verification, and that is an incentive worth removing.
//
// The contract lives in the pipeline map rather than in JavaScript. It was a
// hardcoded object with one entry, and a list somebody has to remember to update
// is a list that will be wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { contractCoverage } from '../../scripts/lib/pipeline-contract.mjs';
import { contractFor, checkRequiredClaim } from '../../scripts/lib/independent-verify.mjs';

const MAP = join(process.cwd(), 'shared', 'pipeline.toml');

test('a declared contract is read from the map, not from code', () => {
  const c = contractFor('architect', { pipelinePath: MAP });
  assert.ok(c, 'architect must resolve against the real map');
  assert.deepEqual(c.keys, ['arch']);
  assert.equal(c.known, true);
});

test('a met contract passes and names what satisfied it', () => {
  const r = checkRequiredClaim(
    { agent: 'architect', meta: { arch: 'docs/architecture/ARCH-x.md' } },
    { pipelinePath: MAP });
  assert.equal(r.status, 'pass');
  assert.match(r.detail, /arch=docs\/architecture\/ARCH-x\.md/);
});

test('a broken contract fails and names the missing key', () => {
  const r = checkRequiredClaim({ agent: 'architect', meta: { feature: 'x' } }, { pipelinePath: MAP });
  assert.equal(r.status, 'fail');
  assert.match(r.detail, /arch=<path>/);
});

test('three states: no map, stage not in the map, stage with no contract', () => {
  // No map at all.
  assert.equal(contractFor('architect', { pipelinePath: '/nonexistent/pipeline.toml' }), null);

  // Map present, stage absent from it — the operator ran something outside the
  // mapped pipeline, which is different from a stage that declares nothing.
  const outside = checkRequiredClaim({ agent: 'not-a-stage', meta: {} }, { pipelinePath: MAP });
  assert.equal(outside.status, 'none');
  assert.match(outside.detail, /not a stage in/);

  // Map present, stage present, contract absent.
  const silent = checkRequiredClaim({ agent: 'senior-dev', meta: {} }, { pipelinePath: MAP });
  assert.equal(silent.status, 'none');
  assert.match(silent.detail, /declares no `produces`/);

  assert.notEqual(outside.detail, silent.detail,
    'a map that does not mention a stage and a stage that says nothing are different facts');
});

test('coverage separates declared, undeclared and broken', () => {
  const r = contractCoverage([
    '[transitions.a]', 'on = ["DONE"]', 'produces = ["arch"]', 'next = ["b"]', '',
    '[transitions.b]', 'on = ["DONE"]', 'next = ["c"]', '',
    '[transitions.c]', 'on = ["DONE"]', 'produces = []', 'next = []', '',
  ].join('\n'));
  assert.equal(r.total, 3);
  assert.deepEqual(r.declared.map((d) => d.stage), ['a']);
  assert.deepEqual(r.undeclared, ['b']);
  assert.deepEqual(r.broken.map((b) => b.stage), ['c'],
    'an empty produces is broken, not absent — somebody wrote it and meant something');
});

test('the real map parses and every declared key is a plain string', () => {
  assert.ok(existsSync(MAP));
  const r = contractCoverage(readFileSync(MAP, 'utf8'));
  assert.equal(r.broken.length, 0, 'a declared contract that cannot be read is the one failure mode');
  assert.ok(r.declared.length > 0, 'at least one stage must declare its output, or the feature is inert');
  for (const d of r.declared) {
    for (const k of d.produces) assert.match(k, /^[a-z][a-z0-9_-]*$/, `${d.stage}: ${k}`);
  }
});

test('every declared key is one an agent actually writes', () => {
  // Guard against inventing contracts. A key no agent emits would make
  // verification reject correct work, and a false accusation teaches people to
  // switch the check off.
  const KNOWN = new Set(['arch', 'adr', 'plan', 'brief', 'design', 'report', 'files']);
  const r = contractCoverage(readFileSync(MAP, 'utf8'));
  for (const d of r.declared) {
    for (const k of d.produces) {
      assert.ok(KNOWN.has(k), `${d.stage} declares \`${k}\`, which no agent has been observed writing`);
    }
  }
});
