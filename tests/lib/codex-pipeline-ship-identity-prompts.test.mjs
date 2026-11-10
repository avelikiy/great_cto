import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {newRun, runStage} from '../../scripts/lib/codex-pipeline.mjs';
import {runCodexExec} from '../../scripts/lib/codex-exec.mjs';
import {runClaudeExec} from '../../scripts/lib/claude-exec.mjs';
import {stableDigest} from '../../scripts/lib/ship-evidence-identity.mjs';
import {createRun, reassess, reviewAll, gate} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {fixture, isolated, parallelGraph, readJSON, calls} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

function actualRunners(state, captured) {
  const wrap = (host, actual) => async request => {
    captured.push({host, prompt: request.prompt, revisionAtRunnerEntry: state.shipEvidence?.revision ?? null});
    return actual(request);
  };
  return {codex: wrap('codex', runCodexExec), 'claude-code': wrap('claude-code', runClaudeExec)};
}
function boundPrompt(f, observation) {
  const {prompt, revisionAtRunnerEntry} = observation;
  assert.match(prompt, /CONTROLLER-BOUND SOURCE REVIEW/);
  assert.match(prompt, /proposal\.files\s*=\s*\[\s*\]/i);
  assert.match(prompt, /(?:pre[- ]?existing|existing).*committed.*report|committed.*(?:existing|prepared).*report/i);
  assert.match(prompt, /do not (?:propose|return|create|apply|make).*writ|no write proposals/i);
  assert.doesNotMatch(prompt, /"files"\s*:\s*\[\s*\{\s*"path"/);
  assert.doesNotMatch(prompt, /before must be SHA256|current file SHA256 for replacement before fields|Only create new markdown reports|Only create new Markdown documents/);
  assert.ok(prompt.includes(f.state.shipEvidence.contextDigest), 'outgoing worker sees exact reviewed source context digest');
  const pin = prompt.match(/(?:shipEvidenceRevision|pinned revision)\s*[:=]\s*([0-9]+)/i);
  assert.ok(pin, 'outgoing worker receives diagnostic pinned revision');
  const n = Number(pin[1]); assert.ok(Number.isSafeInteger(n) && n > 0 && n <= revisionAtRunnerEntry);
  const persistedGeneration = readJSON(join(f.store, 'runs', f.state.id, 'generations', `${n}.json`));
  assert.equal(stableDigest(persistedGeneration.expected), f.state.shipEvidence.contextDigest, 'diagnostic pin names existing generation with same verified source context');
  for (const privateValue of [f.store, f.policyPath, f.journals, join(f.store, 'registration.json'), f.registration.repositoryId, f.registration.projectId, f.registration.journalOriginId, f.lease.token]) {
    assert.ok(!prompt.includes(privateValue), `private controller wiring is not worker prompt input`);
  }
  assert.doesNotMatch(prompt, /ship-context\/v1|ship-assignment\/v1|ship-completion\/v1|ship-registration\/v1|"capability"\s*:|"assignmentDigest"\s*:/);
}

for (const host of ['codex', 'claude-code']) test(`P06 actual ${host} sequential required-reviewer requests receive files-empty bound source prompt`, async t => {
  const f = createRun(t, {hostRoutes: {'qa-engineer': host, 'security-officer': host}}); reassess(f);
  const captured = []; await reviewAll(f, {runners: actualRunners(f.state, captured)});
  assert.equal(gate(f).state, 'PASS'); assert.equal(captured.length, 2);
  for (const role of ['qa-engineer', 'security-officer']) {
    const observation = captured.find(row => row.prompt.includes(`You are the ${role} specialist`)); assert.ok(observation); assert.equal(observation.host, host); boundPrompt(f, observation);
  }
  assert.equal(calls(f).filter(row => row.kind === 'worker').length, 2); assert.equal(calls(f).filter(row => row.kind === 'verifier' && row.host === 'codex').length, 2);
});
test('P06 actual mixed-host parallel required-reviewer requests receive identical bound source mode', async t => {
  const f = createRun(t, {graph: parallelGraph, hostRoutes: {'qa-engineer': 'codex', 'security-officer': 'claude-code'}}); reassess(f);
  const captured = []; await reviewAll(f, {parallel: true, runners: actualRunners(f.state, captured)});
  assert.equal(gate(f).state, 'PASS'); assert.equal(captured.length, 2);
  assert.deepEqual(captured.map(row => row.host).sort(), ['claude-code', 'codex']); for (const observation of captured) boundPrompt(f, observation);
  assert.equal(calls(f).filter(row => row.kind === 'worker').length, 2); assert.equal(calls(f).filter(row => row.kind === 'verifier' && row.host === 'codex').length, 2);
});
test('P08 unbound actual worker retains the existing file proposal contract', async t => {
  const f = fixture(t); isolated(f, t);
  const state = newRun({root: f.root, pluginRoot: f.pluginRoot, prompt: 'Synthetic legacy prompt contract control', allowed: ['src', 'docs'], entry: 'qa-engineer'});
  const captured = []; await runStage(state, {runners: actualRunners(state, captured), contextStore: f.runs});
  assert.equal(captured.length, 1); const prompt = captured[0].prompt;
  assert.doesNotMatch(prompt, /CONTROLLER-BOUND SOURCE REVIEW/); assert.match(prompt, /"files"\s*:\s*\[\s*\{\s*"path"/); assert.match(prompt, /before must be SHA256/);
  assert.equal(calls(f).filter(row => row.kind === 'worker').length, 1); assert.equal(calls(f).filter(row => row.kind === 'verifier').length, 1);
});
