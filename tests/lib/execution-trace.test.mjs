import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRun, runStage, runParallelWave, approve, reject, recover, cancel } from '../../scripts/lib/codex-pipeline.mjs';
import { initializeTrace, recordTrace, projectExecutionTrace, receiptDigest, TRACE_LIMITS } from '../../scripts/lib/execution-trace.mjs';
import { projectCodexState } from '../../scripts/lib/codex-host-state.mjs';
import { projectWork } from '../../packages/board/lib/work.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';

const template = '[transitions.writer]\non=["DONE"]\ngate="gate:code"\nnext=["reviewer"]\n[transitions.reviewer]\non=["PASS"]\ngate="gate:ship"\nnext=[]';
function fixture(t, graph = template, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-causal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginRoot = join(root, 'plugin'); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), graph); commitFixture(root);
  return newRun({ root, pluginRoot, prompt: 'Test causal provenance', allowed: ['src', 'docs'], entry: 'writer', ...extra });
}
const reply = (verdict = 'DONE', files = []) => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'Fixture response', meta: {}, files }) });
const verify = async () => ({ state: 'verified', findings: [], checks: ['offline fixture'] });
const stage = (s, options = {}) => runStage(s, { execute: async () => reply(), verify, ...options });
const node = (s, kind, role) => projectExecutionTrace(s).nodes.find(n => n.kind === kind && (!role || n.role === role));

test('sequential dispatch records input identities, gate authority and actual causal edges', async t => {
  const s = fixture(t), saves = [];
  await stage(s, { save: state => saves.push(structuredClone(state)), execute: async () => {
    assert(saves.some(saved => saved.executionTrace.nodes.some(n => n.kind === 'attempt' && n.status === 'intent')));
    return reply();
  } });
  assert.equal(s.status, 'awaiting-gate');
  assert.equal(node(s, 'attempt').inputDigest, receiptDigest(s.attempts[0].inputReceipt));
  assert.equal(node(s, 'verifier').inputDigest, receiptDigest(s.attempts[0].receipt));
  const before = JSON.stringify(s.executionTrace);
  assert.throws(() => approve(s, 'not-the-token'), /token/);
  assert.equal(JSON.stringify(s.executionTrace), before);
  approve(s, s.pending.token);
  await stage(s, { execute: async () => reply('PASS') });
  const graph = projectExecutionTrace(s), approval = node(s, 'approval', 'writer');
  const transition = graph.nodes.find(n => n.kind === 'transition' && n.role === 'writer' && n.resultDigest);
  const next = node(s, 'attempt', 'reviewer');
  assert(graph.edges.some(e => e.from === approval.id && e.to === transition.id));
  assert(graph.edges.some(e => e.from === transition.id && e.to === next.id && e.kind === 'dispatch'));
  assert.equal(graph.complete, true);
  for (const saved of saves) {
    for (const call of saved.dispatchEvidence.records.filter(r => ['returned', 'threw'].includes(r.outcome))) {
      const attempt = saved.attempts.find(a => call.id.startsWith(a.id + ':'));
      assert(saved.executionTrace.nodes.some(n => n.attemptId === attempt?.id && n.status === call.outcome), 'call outcome and graph outcome share one durable save');
    }
  }
  const exposed = projectCodexState(s);
  assert.equal(exposed.executionGraph.state, 'recorded');
  const work = projectWork({ projectId: 'fixture', codex: { runs: [exposed] } });
  assert.equal(work.entries[0].execution.topology, 'recorded');
  assert.equal(work.entries[0].execution.graph.edges.length, graph.edges.length);
  assert(!JSON.stringify(exposed.executionGraph).includes(s.pending.token));
});

test('retry retains the verifier rework cause and distinct attempt IDs', async t => {
  const s = fixture(t);
  await stage(s, { verify: async () => ({ state: 'rework', findings: ['retry key lost'], checks: ['read retry'] }) });
  assert.equal(s.status, 'ready');
  await stage(s);
  const graph = projectExecutionTrace(s), attempts = graph.nodes.filter(n => n.kind === 'attempt');
  assert.equal(attempts.length, 2); assert.notEqual(attempts[0].attemptId, attempts[1].attemptId);
  const rework = graph.nodes.find(n => n.kind === 'rework');
  assert(graph.edges.some(e => e.from === rework.id && e.to === attempts[1].id));
  assert(graph.nodes.some(n => n.kind === 'result' && n.status === 'rework'));
  assert.equal(graph.complete, true);
});

test('rewind resets the scheduling frontier of a not-yet-started partner', async t => {
  const graph = '[transitions.senior-dev]\non=["DONE"]\ngate="gate:code"\nnext=["code-reviewer","qa-engineer"]\n[transitions.code-reviewer]\non=["PASS"]\nnext=[]\n[transitions.qa-engineer]\non=["PASS"]\nnext=[]';
  const s = fixture(t, graph, { entry: 'senior-dev' });
  await stage(s); approve(s, s.pending.token);
  const previous = projectExecutionTrace(s).nodes.find(n => n.kind === 'transition' && n.role === 'senior-dev' && n.resultDigest).id;
  await stage(s, { execute: async () => reply('FAIL') });
  assert.deepEqual(s.queue, ['senior-dev']);
  await stage(s); approve(s, s.pending.token);
  await stage(s, { execute: async () => reply('PASS') });
  await stage(s, { execute: async () => reply('PASS') });
  const trace = projectExecutionTrace(s), qa = node(s, 'attempt', 'qa-engineer');
  const parents = trace.edges.filter(e => e.to === qa.id).map(e => e.from);
  const replacement = trace.nodes.filter(n => n.kind === 'transition' && n.role === 'senior-dev' && n.resultDigest).at(-1);
  assert.deepEqual(parents, [replacement.id], 'cancelled scheduling intent cannot enable the repaired QA attempt');
  assert(trace.nodes.some(n => n.id === previous), 'invalidated history remains inspectable');
  assert.equal(trace.complete, true); assert.equal(s.status, 'done');
});

test('mandatory checks consume the returned worker proposal before verification or refusal', async t => {
  for (const checkState of ['passed', 'failed', 'unverifiable']) {
    const s = fixture(t, template.replaceAll('writer', 'senior-dev'), { entry: 'senior-dev',
      checkPolicy: { backend: 'local', trusted: true, inputs: ['src'], commands: [['node', '--check', 'src/app.mjs']], timeoutMs: 1000 } });
    await stage(s, { checks: async () => ({ state: checkState, code: checkState === 'passed' ? 0 : 1 }) });
    const graph = projectExecutionTrace(s), returned = graph.nodes.find(n => n.kind === 'result' && n.status === 'returned' && n.role === 'senior-dev');
    const checked = node(s, 'checks');
    assert(returned); assert.equal(checked.status, checkState);
    assert(graph.edges.some(e => e.from === returned.id && e.to === checked.id && e.kind === 'checks'));
    if (checkState === 'passed') assert(graph.edges.some(e => e.from === checked.id && e.to === node(s, 'verifier').id));
    else assert.equal(node(s, 'verifier'), undefined, 'failed or unavailable checks do not dispatch a verifier');
    assert.equal(graph.complete, true);
  }
});

test('rejected gate and safe recovery create causes but never approve or redispatch themselves', async t => {
  const s = fixture(t); await stage(s);
  reject(s, s.pending.token, 'change the proposal');
  assert.equal(s.approvals.length, 0);
  assert.equal(node(s, 'approval').status, 'rejected');
  await stage(s, { execute: async () => { throw Error('offline interrupted worker'); } });
  assert.equal(s.status, 'blocked');
  recover(s);
  assert.equal(s.status, 'ready'); assert.equal(s.attempts.length, 2);
  await stage(s);
  const graph = projectExecutionTrace(s), recovery = node(s, 'recovery');
  assert(graph.edges.some(e => e.from === recovery.id && e.to === graph.nodes.filter(n => n.kind === 'attempt').at(-1).id));
  assert.equal(s.approvals.length, 0);
  cancel(s);
  assert.equal(s.status, 'cancelled'); assert.equal(node(s, 'cancel').status, 'cancelled');
});

test('unverifiable verifier is recorded without granting a gate', async t => {
  const s = fixture(t);
  await stage(s, { verify: async () => ({ state: 'unverifiable', findings: ['no access'], checks: ['attempted read'] }) });
  assert.equal(s.status, 'blocked'); assert.equal(s.pending, null);
  assert(projectExecutionTrace(s).nodes.some(n => n.kind === 'result' && n.status === 'unverifiable'));
  assert.equal(projectExecutionTrace(s).nodes.some(n => n.kind === 'approval'), false);
});

test('mixed-host wave shares frozen input without a sibling-to-sibling dependency', async t => {
  const graph = '[transitions.writer]\non=["DONE"]\njoin=["reviewer"]\ngate="gate:code"\nnext=[]\n[transitions.reviewer]\non=["PASS"]\njoin=["writer"]\ngate="gate:ship"\nnext=[]';
  const s = fixture(t, graph, { hostRoutes: { writer: 'codex', reviewer: 'claude-code' } });
  s.queue.push('reviewer');
  const output = (role, verdict) => reply(verdict, [{ path: `docs/${role}.md`, before: null, content: `Offline ${role} fixture\n` }]);
  await runParallelWave(s, { runners: { codex: async () => output('writer', 'DONE'), 'claude-code': async () => output('reviewer', 'PASS') }, verify });
  const trace = projectExecutionTrace(s), attempts = trace.nodes.filter(n => n.kind === 'attempt');
  assert.equal(attempts.length, 2); assert.equal(attempts[0].inputDigest, attempts[1].inputDigest);
  assert.equal(attempts[0].waveId, attempts[1].waveId);
  assert.deepEqual(new Set(attempts.map(n => n.host)), new Set(['codex', 'claude-code']));
  assert.equal(trace.edges.some(e => e.from === attempts[0].id && e.to === attempts[1].id), false);
  const writerResult = trace.nodes.find(n => n.kind === 'result' && n.role === 'writer' && n.status === 'verified');
  const reviewerVerifier = trace.nodes.find(n => n.kind === 'verifier' && n.role === 'reviewer');
  assert(trace.edges.some(e => e.from === writerResult.id && e.to === reviewerVerifier.id), 'verifier receives already applied sibling-result metadata, unlike the frozen worker');
  const gate = trace.nodes.find(n => n.kind === 'gate');
  const gateParents = trace.edges.filter(e => e.to === gate.id).map(e => trace.nodes.find(n => n.id === e.from));
  assert.deepEqual(new Set(gateParents.filter(n => n.kind === 'result').map(n => n.role)), new Set(['writer', 'reviewer']));
  assert.equal(s.status, 'awaiting-gate'); assert.equal(s.approvals.length, 0);
  assert.equal(trace.complete, true);
});

test('legacy runs are never backfilled from timestamps or role names', async t => {
  const s = fixture(t); delete s.executionTrace;
  await stage(s);
  assert.equal(s.status, 'awaiting-gate'); assert.equal(s.executionTrace, undefined);
  assert.equal(projectExecutionTrace(s).state, 'unavailable');
});

test('projection rejects invalid topology and bounds output without leaking raw fields', () => {
  const s = { id: 'run', graph: {}, graphHash: 'a'.repeat(64) }; initializeTrace(s);
  recordTrace(s, 'attempt', { role: 'writer', attemptId: 'id', input: { path: '/PRIVATE', token: 'SECRET' } });
  s.executionTrace.nodes[0].prompt = 'SECRET'; s.executionTrace.nodes[0].path = '/PRIVATE';
  s.executionTrace.snapshots[0].token = 'SECRET';
  assert.doesNotMatch(JSON.stringify(projectExecutionTrace(s)), /SECRET|PRIVATE|"prompt"|"token"/);
  s.executionTrace.edges.push({ from: 'absent', to: 'node-1', kind: 'transition' });
  assert.equal(projectExecutionTrace(s).state, 'unavailable');
});

test('nested projection caps refuse oversized arrays before visiting their entries', () => {
  const oversized = () => new Proxy(Array(17), { get(target, key) {
    if (typeof key === 'string' && /^\d+$/.test(key)) assert.fail('oversized array must not be traversed');
    return Reflect.get(target, key);
  } });
  const s = { id: 'run', graph: { writer: { on: ['DONE'], next: [] } } }; initializeTrace(s);
  s.executionTrace.nodes[0].gates = oversized();
  assert.equal(projectExecutionTrace(s).state, 'unavailable');
  s.executionTrace.nodes[0].gates = [];
  s.executionTrace.snapshots[0].rules[0].next = oversized();
  assert.equal(projectExecutionTrace(s).state, 'unavailable');
});

test('trace cap preserves bounded history and marks it incomplete instead of guessing', () => {
  const s = { id: 'run', graph: {} }; initializeTrace(s);
  for (let i = 0; i < TRACE_LIMITS.nodes + 2; i++) recordTrace(s, 'transition', { role: 'writer' });
  const graph = projectExecutionTrace(s);
  assert.equal(graph.nodes.length, TRACE_LIMITS.nodes); assert.equal(graph.complete, false); assert.equal(graph.truncated, true);
});

test('workflow snapshots retain original bindings across controller graph epochs', () => {
  const s = { id: 'run', graph: { writer: { on: ['DONE'], next: [] } } }; initializeTrace(s);
  const original = projectExecutionTrace(s).nodes[0].graphDigest;
  s.graph.writer.next = ['reviewer'];
  recordTrace(s, 'transition', { role: 'writer' });
  const graph = projectExecutionTrace(s);
  assert.equal(graph.snapshots.length, 2); assert.equal(graph.nodes[0].graphDigest, original);
  assert.notEqual(graph.nodes[1].graphDigest, original);
  s.executionTrace.nodes[0].graphDigest = 'f'.repeat(64);
  assert.equal(projectExecutionTrace(s).state, 'unavailable');
});
