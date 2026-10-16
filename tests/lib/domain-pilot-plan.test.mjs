import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { planDomainPilot, preregisterDomainPilot } from '../../scripts/lib/domain-benchmark.mjs';

test('design has 36 unique trial slots, three projects and matched host/arm repetitions', () => {
  const plan = planDomainPilot();
  assert.equal(plan.trials.length, 36);
  const ids = plan.trials.map(t => [t.taskId,t.host,t.repetition,t.arm].join(':'));
  assert.equal(new Set(ids).size, 36);
  for (const task of plan.tasks) for (const host of ['codex','claude-code']) {
    const trials = plan.trials.filter(t => t.taskId === task.taskId && t.host === host);
    assert.equal(trials.length, 6);
    for (let repetition = 0; repetition < 3; repetition++) {
      const pair = trials.filter(t => t.repetition === repetition);
      assert.deepEqual(new Set(pair.map(t => t.arm)), new Set(['core','core-plus-pack']));
      assert.deepEqual(pair.map(t => t.order), [0,1]);
    }
    assert.equal(new Set(trials.filter(t => t.order === 0).map(t => t.arm)).size, 2);
  }
});

test('design cannot masquerade as frozen inputs, observations, expertise or launch authority', () => {
  const plan = planDomainPilot();
  assert.equal(plan.state, 'design-not-preregistered');
  assert.equal(plan.qualityUplift, null);
  assert.deepEqual(plan.observations, []);
  assert.equal(plan.scorerDigest, null);
  assert.ok(Object.values(plan.budget).every(v => v === null));
  assert.ok(Object.values(plan.hostPolicies).every(v => v.model === null && v.policyDigest === null));
  assert.ok(plan.trials.every(t => t.status === 'not-executed'));
  assert.throws(() => preregisterDomainPilot(plan), /unexpected or missing/);
  assert.match(plan.authority, /no model launch/);
});

test('plan CLI prints the non-executing design without file or host inputs', () => {
  const child = spawnSync(process.execPath, ['scripts/domain-benchmark.mjs','plan'], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8', timeout: 10000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), planDomainPilot());
});
