// A UI feature reaches design-advisor by an edge, and the CTO can see screens
// before gate:product. Before this, the map went architect → pm and named
// design-advisor nowhere on the way in: the stage ran only if the orchestrator
// remembered the routing table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePipelineToml } from '../../scripts/lib/pipeline-toml.mjs';
import { latestSuccess, PO_ON, ARCH_ON } from '../../scripts/lib/graph-guard.mjs';
import { pipelineOrder } from '../../scripts/lib/pipeline-position.mjs';

const read = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const MAP = parsePipelineToml(read('shared/pipeline.toml'));
const { decideNext } = await import('../../scripts/hooks/pipeline-dispatcher.mjs');
const next = (agent, verdict, meta = {}, activeGates = null) =>
  decideNext({ agent, transitions: MAP, activeGates, gateStates: {},
    verdict: { ts: 't', agent, verdict, meta, hasCost: true } });

test('a plain APPROVED still goes to pm: a backend feature does not wait for a design', () => {
  assert.deepEqual(MAP.architect.next, ['pm']);
  const d = next('architect', 'APPROVED', {}, []);
  assert.match(d.text, /pm/);
  assert.doesNotMatch(d.text, /design-advisor/);
});

test('APPROVED_UI runs design-advisor, and gate:arch stays on that edge', () => {
  assert.match(next('architect', 'APPROVED_UI', {}, []).text, /subagent_type: design-advisor/);
  assert.equal(MAP['architect.APPROVED_UI'].gate, 'gate:arch');
  assert.match(next('architect', 'APPROVED_UI', {}, ['arch']).text, /gate:arch/);
});

test('a depth skip cannot jump a UI feature past its design', () => {
  const d = next('architect', 'APPROVED_UI', { depth: 'small' }, []);
  assert.match(d.text, /subagent_type: design-advisor/);
  assert.doesNotMatch(d.text, /subagent_type: senior-dev/);
});

test('the full run after APPROVED_UI still hands to pm', () => {
  assert.match(next('design-advisor', 'DONE').text, /subagent_type: pm/);
});

test('SCREENS_NEEDED draws drafts and moves gate:product behind them, not away', () => {
  const po = next('product-owner', 'SCREENS_NEEDED', {}, ['product']);
  assert.match(po.text, /subagent_type: design-advisor/);
  assert.doesNotMatch(po.text, /subagent_type: architect/);
  assert.equal(MAP['design-advisor.SCREENS_DRAFT'].gate, 'gate:product');
  const draft = next('design-advisor', 'SCREENS_DRAFT', {}, ['product']);
  assert.equal(draft.kind, 'gate');
  assert.match(draft.text, /\[architect\] is behind gate:product/);
});

test('plain APPROVED from product-owner keeps the old gate', () => {
  assert.match(next('product-owner', 'APPROVED', {}, ['product']).text, /gate:product/);
});

test('the build guard counts the new tokens as the stage having run', () => {
  const line = (agent, verdict) => JSON.stringify({ v: 1, ts: '2026-11-02T10:00:00Z', agent, verdict });
  assert.equal(latestSuccess(line('architect', 'APPROVED_UI'), ARCH_ON)?.verdict, 'APPROVED_UI');
  assert.equal(latestSuccess(line('product-owner', 'SCREENS_NEEDED'), PO_ON)?.verdict, 'SCREENS_NEEDED');
});

test('design-advisor stays off the main chain and appears once it has a verdict', () => {
  assert.ok(!pipelineOrder(MAP).includes('design-advisor'));
  assert.ok(pipelineOrder(MAP, { 'design-advisor': { verdict: 'DONE' } }).includes('design-advisor'));
});

test('the agents are told the tokens the map keys on', () => {
  assert.match(read('agents/architect.md'), /APPROVED_UI/);
  assert.match(read('agents/product-owner.md'), /SCREENS_NEEDED/);
  assert.match(read('agents/design-advisor.md'), /SCREENS_DRAFT/);
});
