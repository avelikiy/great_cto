// Planning has one way into senior-dev (great_cto-um9n, 26.10.2026).
//
// pm and design-advisor both had next = ["senior-dev"] with no join, and the
// routing table ran design-advisor alongside pm — so each success opened the edge
// and senior-dev could be dispatched twice. A join could not fix it: design-advisor
// runs only for UI features, and pm would wait for a stage that never starts. The
// edge was moved instead: design-advisor → pm → senior-dev.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePipelineToml } from '../../scripts/lib/pipeline-toml.mjs';

const MAP = parsePipelineToml(fs.readFileSync(new URL('../../shared/pipeline.toml', import.meta.url), 'utf8'));
const { decideNext } = await import('../../scripts/hooks/pipeline-dispatcher.mjs');

test('design-advisor hands to pm, so senior-dev is entered from planning once', () => {
  assert.deepEqual(MAP['design-advisor'].next, ['pm']);
  const planningIntoBuild = ['architect', 'design-advisor', 'pm']
    .filter(stage => (MAP[stage]?.next || []).includes('senior-dev'));
  assert.deepEqual(planningIntoBuild, ['pm'], 'more than one planning stage opens senior-dev');
});

test('the dispatcher names pm, not senior-dev, after design-advisor succeeds', () => {
  const d = decideNext({ agent: 'design-advisor', transitions: MAP,
    verdict: { ts: 't', agent: 'design-advisor', verdict: 'DONE' } });
  assert.match(d.text, /subagent_type: pm/);
  assert.doesNotMatch(d.text, /subagent_type: senior-dev/);
});

test('the docs the orchestrator and the agent read say the same order', () => {
  const read = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
  assert.match(read('agents/design-advisor.md'), /^description: Use after architect and before pm,/m);
  assert.doesNotMatch(read('agents/design-advisor.md'), /parallel to pm/);
  assert.match(read('skills/great_cto/SKILL.md'), /after architect, before pm — its next stage is pm/);
});
