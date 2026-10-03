import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePipelineToml } from '../../scripts/lib/pipeline-toml.mjs';
import { assertReviewGraphFloor, assertPreparationGraphFloor } from '../../scripts/lib/review-graph-floor.mjs';

const roles = ['code-reviewer', 'qa-engineer', 'security-officer'];
const graph = () => parsePipelineToml(readFileSync(new URL('../../shared/pipeline.toml', import.meta.url), 'utf8'));

test('shipped graph has a structural review boundary, not a runtime attestation', () => {
  const report = assertReviewGraphFloor(graph());
  assert.deepEqual(report.roles, roles);
  for (const key of ['domainSelectionVerified', 'executionVerified', 'approvalsVerified']) assert.equal(report[key], false);
});

const mutations = {
  'mandatory reviewer omitted': g => { g['senior-dev'].next.pop(); },
  'direct implementation release': g => { g['senior-dev'].next.push('devops'); },
  'extra reviewer exit': g => { g['qa-engineer'].next.push('l3-support'); },
  'terminal reviewer': g => { g['qa-engineer'].next = []; },
  'missing quorum partner': g => { g['code-reviewer'].join.pop(); },
  'unknown quorum partner': g => { g['code-reviewer'].join.push('unmapped-reviewer'); },
  'self quorum': g => { g['code-reviewer'].join.push('code-reviewer'); },
  'ship present elsewhere only': g => { delete g['code-reviewer'].gate; },
  'security present elsewhere only': g => { g.pm.gate = ['gate:plan', 'gate:security']; g['security-officer'].gate = ['gate:ship']; },
  'review verdict bypass': g => { g['qa-engineer.DONE'] = { on: ['DONE'], next: ['devops'] }; },
  'implementation verdict bypass': g => { g['senior-dev.DONE'] = { on: ['DONE'], next: ['devops'] }; },
  'repair bypass': g => { g['senior-dev.SPEC-OBJECTION'].next = ['devops']; },
  'repair plan gate removed': g => { delete g['senior-dev.SPEC-OBJECTION'].gate; },
  'review skip': g => { g['code-reviewer'].skip_next_when = 'depth=small'; },
  'implementation skip': g => { g['senior-dev'].skip_next_when = 'depth=small'; },
  'empty success tokens': g => { g['security-officer'].on = []; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`refuses ${name}`, () => {
  const g = graph(); mutate(g); assert.throws(() => assertReviewGraphFloor(g), /review floor/);
});

test('expanded domain quorum must occur on every exit and implementation fan-out', () => {
  const g = graph(), all = [...roles, 'pci-reviewer'];
  g['senior-dev'].next = all;
  g['pci-reviewer'] = { on: ['DONE'], next: ['devops'], gate: ['gate:ship'] };
  for (const role of all) g[role].join = all.filter(peer => peer !== role);
  assert.doesNotThrow(() => assertReviewGraphFloor(g, all));
  g['qa-engineer'].join = roles.filter(peer => peer !== 'qa-engineer');
  assert.throws(() => assertReviewGraphFloor(g, all), /quorum/);
});

test('preparation has its own all-to-all gated boundary, including regulatory gates', () => {
  const pre = ['pci-reviewer-prebuild', 'regulated-reviewer-prebuild'];
  const hard = ['gate:plan', 'gate:security', 'gate:compliance'];
  const g = Object.fromEntries(pre.map(role => [role, { on: ['DONE'], next: ['senior-dev'],
    join: pre.filter(peer => peer !== role), gate: [...hard] }]));
  assert.doesNotThrow(() => assertPreparationGraphFloor(g, pre, hard));
  for (const field of ['next', 'join', 'gate']) {
    const broken = structuredClone(g); broken[pre[0]][field] = [];
    assert.throws(() => assertPreparationGraphFloor(broken, pre, hard), /review floor/);
  }
  g[`${pre[0]}.DONE`] = { on: ['DONE'], next: ['senior-dev'] };
  assert.throws(() => assertPreparationGraphFloor(g, pre, hard), /override/);
  assert.throws(() => assertPreparationGraphFloor({}, [], []), /plan gate/);
});
