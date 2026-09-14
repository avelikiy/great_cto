// A finding the implementer can fix goes back to the implementer.
//
// REWORK already returned work to the agent that ran, capped at MAX_REWORK passes.
// But a reviewer's BLOCKED or FAIL halted the chain and asked the CTO every time,
// including when the reviewer's own contract said "senior-dev fix <finding>" —
// because no verdict carried who the finding was for. `need` now does.
//
// What these pin:
//   - the REWORK loop and its ceiling, which no test covered;
//   - need=implementer routes to the owner, named from the map, not hard-coded;
//   - need=decision, undeclared, and an owner that cannot be found all halt;
//   - the ceiling is shared: REWORK passes and routed findings count together;
//   - the same finding is not sent back twice while the owner has not answered;
//   - the journal records a send-back as a dispatch, not as the chain stopping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideNext, parsePipelineToml, MAX_REWORK, OUTCOME_BY_KIND,
} from '../../scripts/hooks/pipeline-dispatcher.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TRANSITIONS = parsePipelineToml(readFileSync(resolve(ROOT, 'shared/pipeline.toml'), 'utf8'));

let clock = 0;
const V = (agent, verdict, meta = {}) => ({
  ts: `2026-09-14T10:${String(clock++).padStart(2, '0')}:00Z`, agent, verdict, meta,
});
const decide = (verdict, prior = []) =>
  decideNext({ agent: verdict.agent, transitions: TRANSITIONS, verdict, allVerdicts: [...prior, verdict] });

// ── the loop that already existed ──────────────────────────────────────────

test('REWORK sends the work back to the agent that ran', () => {
  const d = decide(V('senior-dev', 'REWORK'));
  assert.equal(d.kind, 'rework');
  assert.match(d.text, /PIPELINE-REWORK/);
});

test('REWORK past the ceiling becomes a decision', () => {
  const prior = Array.from({ length: MAX_REWORK }, () => V('senior-dev', 'REWORK'));
  const d = decide(V('senior-dev', 'REWORK'), prior);
  assert.equal(d.kind, 'blocked');
  assert.match(d.text, /ceiling/);
});

// ── routing a finding to its owner ─────────────────────────────────────────

test('need=implementer goes back to the owner, with the finding, and nothing downstream is spawned', () => {
  const prior = [V('senior-dev', 'TASK_DONE', { feature: 'checkout' })];
  const d = decide(V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F1' }), prior);
  assert.equal(d.kind, 'route');
  assert.match(d.text, /PIPELINE-ROUTE/);
  assert.match(d.text, /senior-dev/);
  assert.match(d.text, /F1/);
  assert.match(d.text, /Do NOT spawn devops/);
});

test('need=decision still halts and asks the CTO', () => {
  const prior = [V('senior-dev', 'TASK_DONE', { feature: 'checkout' })];
  const d = decide(V('security-officer', 'BLOCKED', { feature: 'checkout', need: 'decision', finding: 'S1' }), prior);
  assert.equal(d.kind, 'blocked');
});

test('a halt that declares no need is not routed', () => {
  const prior = [V('senior-dev', 'TASK_DONE', { feature: 'checkout' })];
  for (const meta of [{ feature: 'checkout' }, { feature: 'checkout', need: 'maybe' }]) {
    const d = decide(V('qa-engineer', 'FAIL', meta), prior);
    assert.equal(d.kind, 'blocked', `for ${JSON.stringify(meta)}`);
  }
});

test('need=implementer with no owner to be found halts, and says why', () => {
  const prior = [V('senior-dev', 'TASK_DONE', { feature: 'another-feature' })];
  const d = decide(V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F1' }), prior);
  assert.equal(d.kind, 'blocked');
  assert.match(d.text, /no implementer verdict/i);
});

test('the owner is matched by task before feature', () => {
  const prior = [
    V('senior-dev', 'TASK_DONE', { task: 'T-1', feature: 'checkout' }),
    V('mobile-app-builder', 'DONE', { feature: 'checkout' }),          // later, same feature, other task
  ];
  const d = decide(V('code-reviewer', 'BLOCKED', { task: 'T-1', feature: 'checkout', need: 'implementer', finding: 'C1' }), prior);
  assert.equal(d.kind, 'route');
  assert.match(d.text, /Re-spawn senior-dev/);
});

test('who counts as an implementer comes from the map, not a hard-coded name', () => {
  const prior = [V('mobile-app-builder', 'DONE', { feature: 'field-app' })];
  const d = decide(V('security-officer', 'BLOCKED', { feature: 'field-app', need: 'implementer', finding: 'S2' }), prior);
  assert.equal(d.kind, 'route');
  assert.match(d.text, /Re-spawn mobile-app-builder/);
});

// ── the ceiling and the repeat ─────────────────────────────────────────────

test('the ceiling is shared: REWORK passes and routed findings count together', () => {
  const prior = [
    V('senior-dev', 'TASK_DONE', { feature: 'checkout' }),
    V('senior-dev', 'REWORK'),
    V('senior-dev', 'REWORK'),
    V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F0' }),
    V('senior-dev', 'TASK_DONE', { feature: 'checkout' }),
  ];
  const d = decide(V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F1' }), prior);
  assert.equal(d.kind, 'blocked', `${MAX_REWORK} passes already spent`);
  assert.match(d.text, /ceiling/);
});

test('the same finding is not sent back again while the owner has not answered', () => {
  const prior = [
    V('senior-dev', 'TASK_DONE', { feature: 'checkout' }),
    V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F1' }),
  ];
  const d = decide(V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F1' }), prior);
  assert.equal(d.kind, 'route-pending');
  assert.doesNotMatch(d.text, /Re-spawn/, 'a second spawn for the same unanswered finding is the loop the cap exists to stop');
});

test('the same finding after the owner answered is routed again, and counts', () => {
  const prior = [
    V('senior-dev', 'TASK_DONE', { feature: 'checkout' }),
    V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F1' }),
    V('senior-dev', 'TASK_DONE', { feature: 'checkout' }),
  ];
  const d = decide(V('qa-engineer', 'FAIL', { feature: 'checkout', need: 'implementer', finding: 'F1' }), prior);
  assert.equal(d.kind, 'route');
  assert.match(d.text, /pass 2 of 3/);
});

// ── what the journal says happened ─────────────────────────────────────────

test('a send-back is journalled as a dispatch, and a pending one as a hold', () => {
  assert.equal(OUTCOME_BY_KIND.rework, 'dispatch', 'REWORK names a stage to run again — it was recorded as the chain stopping');
  assert.equal(OUTCOME_BY_KIND.route, 'dispatch');
  assert.equal(OUTCOME_BY_KIND['route-pending'], 'hold');
});
