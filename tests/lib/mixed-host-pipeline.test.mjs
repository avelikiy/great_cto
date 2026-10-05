import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { newRun, parallelPair, runParallelWave, runStage, approve, recover } from '../../scripts/lib/codex-pipeline.mjs';
import { detectClaude, parseClaudeResult } from '../../scripts/lib/claude-exec.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { readExecutionBudget, budgetSnapshot, requireAgents, releaseAgent } from '../../scripts/lib/agent-execution-budget.mjs';
import { dispatchEvidenceSummary } from '../../scripts/lib/controller-dispatch-evidence.mjs';

const graph = `[transitions.qa]\non=["PASS"]\nproduces=["report"]\njoin=["security"]\ngate="gate:qa"\nnext=[]\n` +
  `[transitions.security]\non=["APPROVED"]\nproduces=["report"]\njoin=["qa"]\ngate="gate:security"\nnext=[]`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mixed-host-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginRoot = join(root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared', 'pipeline.toml'), graph);
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-qm', 'fixture']);
  const state = newRun({ root, pluginRoot, prompt: 'Review a fixture', allowed: ['src', 'docs'], entry: 'qa',
    hostRoutes: { qa: 'claude-code', security: 'codex' } });
  state.queue.push('security');
  return state;
}

const reply = (role, path = `docs/${role}.md`) => ({ state: 'ok', code: 0, errors: [],
  finalText: JSON.stringify({ verdict: role === 'qa' ? 'PASS' : 'APPROVED', summary: `${role} reviewed`,
    meta: { report: path }, files: [{ path, before: null, content: `${role} evidence\n` }] }), usage: null });
const verify = async () => ({ state: 'verified', findings: [], checks: ['inspected actual report'] });

function budgetFor(t, state) {
  const dir = mkdtempSync(join(tmpdir(), 'wave-budget-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'policy.json');
  writeFileSync(file, JSON.stringify({ maxConcurrent: 2, maxDepth: 1, maxCallsPerRun: 12, runId: 'wave' }), { mode: 0o600 });
  state.executionBudget = readExecutionBudget(state.root, { env: { GREAT_CTO_AGENT_BUDGET_FILE: file, GREAT_CTO_AGENT_BUDGET_STORE: join(dir, 'store') } });
}

test('budgeted mixed wave shares two slots and charges workers plus separate verifiers', async t => {
  const state = fixture(t); budgetFor(t, state);
  await runParallelWave(state, { runners: {
    'claude-code': async () => { assert.equal(budgetSnapshot(state.executionBudget).active.length, 2); return reply('qa'); },
    codex: async () => { assert.equal(budgetSnapshot(state.executionBudget).active.length, 2); return reply('security'); },
  }, verify: async () => { assert.equal(budgetSnapshot(state.executionBudget).active.length, 1); return verify(); } });
  assert.equal(state.status, 'awaiting-gate');
  assert.equal(budgetSnapshot(state.executionBudget).calls, 4);
  assert.equal(budgetSnapshot(state.executionBudget).active.length, 0);
  assert.equal(dispatchEvidenceSummary(state).workerCalls, 2);
  assert.equal(dispatchEvidenceSummary(state).verifierCalls, 2);
  assert.equal(state.dispatchEvidence.records.length, 4, 'prepared workers are not counted twice');
});

test('another host holding one slot prevents partial mixed-wave dispatch', async t => {
  const state = fixture(t); budgetFor(t, state);
  const [other] = requireAgents(state.executionBudget, [{ callId: 'other', host: 'claude-code', role: 'research', depth: 1 }]);
  let calls = 0;
  await assert.rejects(runParallelWave(state, { runners: { codex: async () => { calls++; }, 'claude-code': async () => { calls++; } }, verify }), /concurrency/);
  assert.equal(calls, 0); assert.equal(state.wave, undefined);
  assert.equal(state.dispatchEvidence.records.length, 0, 'refused admission is not an invocation');
  assert.equal(budgetSnapshot(state.executionBudget).calls, 1);
  releaseAgent(state.executionBudget, other);
});

test('two hosts execute concurrently, proposals apply once, and gates remain human-owned', async t => {
  const state = fixture(t), started = [];
  assert.deepEqual(parallelPair(state), ['qa', 'security']);
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const runner = role => async options => {
    started.push(role);
    assert.equal(options.sandbox, 'read-only');
    assert.match(options.prompt, new RegExp(`You are the ${role} specialist`));
    assert.ok(options.prompt.includes(state.wave.id), 'both hosts receive the frozen wave ID');
    assert.ok(options.prompt.includes(state.wave.receipt.head), 'both hosts receive the frozen receipt');
    assert.match(options.prompt, /Git blob object IDs, not raw SHA256/);
    await barrier;
    return reply(role);
  };
  const pending = runParallelWave(state, { runners: { 'claude-code': runner('qa'), codex: runner('security') }, verify });
  await Promise.resolve();
  assert.deepEqual(started, ['qa', 'security']);
  assert.equal(state.wave.status, 'running');
  assert.equal(existsSync(join(state.root, 'docs/qa.md')), false);
  assert.equal(existsSync(join(state.root, 'docs/security.md')), false);
  release(); await pending;
  assert.equal(state.status, 'awaiting-gate');
  assert.deepEqual(Object.keys(state.results), ['qa', 'security']);
  assert.equal(state.results.qa.host, 'claude-code');
  assert.equal(state.results.security.host, 'codex');
  assert.deepEqual(state.attempts.map(a => a.host), ['claude-code', 'codex']);
  assert.equal(state.waveHistory[0].status, 'verified');
  assert.equal(state.wave, null);
  const qaToken = state.pending.token; approve(state, qaToken);
  assert.equal(state.status, 'awaiting-gate');
  assert.notEqual(state.pending.token, qaToken);
  approve(state, state.pending.token);
  assert.equal(state.status, 'done');
  assert.equal(state.approvals.length, 2);
});

test('overlapping proposals block before either host can write', async t => {
  const state = fixture(t);
  await runParallelWave(state, { runners: {
    'claude-code': async () => reply('qa', 'docs/shared.md'),
    codex: async () => reply('security', 'docs/shared.md'),
  }, verify });
  assert.equal(state.status, 'blocked');
  assert.match(state.reason, /overlapping paths/);
  assert.equal(existsSync(join(state.root, 'docs/shared.md')), false);
  assert.equal(state.pending, null);
});

test('parent and child output paths also conflict before any write', async t => {
  const state = fixture(t);
  await runParallelWave(state, { runners: {
    'claude-code': async () => reply('qa', 'docs/report'),
    codex: async () => reply('security', 'docs/report/security.md'),
  }, verify });
  assert.equal(state.status, 'blocked');
  assert.match(state.reason, /overlapping paths/);
  assert.equal(existsSync(join(state.root, 'docs/report')), false);
});

test('parallel review cannot alter an implementation file', async t => {
  const state = fixture(t);
  await runParallelWave(state, { runners: {
    'claude-code': async () => reply('qa', 'src/app.js'),
    codex: async () => reply('security'),
  }, verify });
  assert.equal(state.status, 'blocked');
  assert.match(state.reason, /new docs\/ artifact/);
  assert.equal(existsSync(join(state.root, 'src/app.js')), false);
  assert.equal(existsSync(join(state.root, 'docs/security.md')), false);
});

test('one failed host blocks the whole wave without a write or gate', async t => {
  const state = fixture(t);
  await runParallelWave(state, { runners: {
    'claude-code': async () => reply('qa'),
    codex: async () => { throw Error('host unavailable'); },
  }, verify });
  assert.equal(state.status, 'blocked');
  assert.match(state.reason, /host unavailable/);
  assert.equal(existsSync(join(state.root, 'docs/qa.md')), false);
  assert.equal(state.pending, null);
});

async function failedWave(t) {
  const state = fixture(t); budgetFor(t, state);
  await runParallelWave(state, { runners: {
    'claude-code': async () => { throw Error('OAuth expired'); },
    codex: async () => reply('security'),
  }, verify });
  assert.equal(state.status, 'blocked');
  return state;
}

test('failed dispatch recovery preserves refusal and reruns both hosts under fresh admission', async t => {
  const state = await failedWave(t), old = state.wave.id;
  const approvals = structuredClone(state.approvals);
  recover(state);
  assert.equal(state.status, 'ready'); assert.equal(state.wave, null);
  assert.deepEqual(state.approvals, approvals);
  assert.equal(state.waveHistory[0].id, old);
  assert.equal(state.waveHistory[0].status, 'blocked');
  assert.match(state.waveHistory[0].reason, /OAuth expired/);
  assert.equal(existsSync(join(state.root, 'docs/security.md')), false);
  let called = 0;
  await runParallelWave(state, { runners: {
    'claude-code': async () => { called++; return reply('qa'); },
    codex: async () => { called++; return reply('security'); },
  }, verify });
  assert.equal(called, 2);
  assert.equal(state.status, 'awaiting-gate');
  assert.notEqual(state.waveHistory[1].id, old);
  assert.equal(state.waveHistory[1].status, 'verified');
  assert.deepEqual(state.approvals, approvals);
  assert.equal(budgetSnapshot(state.executionBudget).calls, 6);
});

test('failed wave recovery supports legacy runs without an explicit shared budget', async t => {
  const state = fixture(t);
  assert.equal(state.executionBudget, null);
  await runParallelWave(state, { runners: {
    'claude-code': async () => { throw Error('OAuth expired'); }, codex: async () => reply('security'),
  }, verify });
  recover(state);
  assert.equal(state.status, 'ready'); assert.equal(state.wave, null);
  assert.equal(state.waveHistory[0].status, 'blocked');
  assert.equal(state.approvals.length, 0);
});

test('failed wave recovery refuses changed tree, incomplete calls and consumed attempt limit', async t => {
  for (const mutation of ['tree', 'call', 'limit', 'responses', 'partial', 'route', 'active-lease']) {
    const state = await failedWave(t), old = state.wave.id;
    let lease;
    if (mutation === 'tree') writeFileSync(join(state.root, 'unexpected.txt'), 'changed');
    if (mutation === 'call') delete state.dispatchEvidence.records[0].finishedAt;
    if (mutation === 'limit') state.maxAttempts = 1;
    if (mutation === 'responses') state.wave.responses = {};
    if (mutation === 'partial') state.results.qa = { verification: { state: 'verified' } };
    if (mutation === 'route') state.hostRoutes.qa = 'codex';
    if (mutation === 'active-lease') {
      state.wave.id = `${old}-active`;
      for (const record of state.dispatchEvidence.records) record.id = record.id.replace(old, state.wave.id);
      [lease] = requireAgents(state.executionBudget,
        [{ callId: `${state.wave.id}:qa`, host: 'claude-code', role: 'qa', depth: 1 }]);
    }
    const retainedId = state.wave.id;
    try { assert.throws(() => recover(state), /parallel recovery/); }
    finally { if (lease) releaseAgent(state.executionBudget, lease); }
    assert.equal(state.status, 'blocked'); assert.equal(state.wave.id, retainedId);
    assert.equal(state.waveHistory?.length || 0, 0);
    assert.equal(state.approvals.length, 0);
  }
});

test('invalid second-role contract blocks before the first proposal is applied', async t => {
  for (const mutate of [
    proposal => { proposal.verdict = 'NOT_APPROVED'; },
    proposal => { delete proposal.meta.report; },
    proposal => { proposal.meta.report = 'docs/unrelated.md'; },
  ]) {
    const state = fixture(t);
    const security = JSON.parse(reply('security').finalText);
    mutate(security);
    await runParallelWave(state, { runners: {
      'claude-code': async () => reply('qa'),
      codex: async () => ({ ...reply('security'), finalText: JSON.stringify(security) }),
    }, verify });
    assert.equal(state.status, 'blocked');
    assert.equal(existsSync(join(state.root, 'docs/qa.md')), false);
    assert.equal(existsSync(join(state.root, 'docs/security.md')), false);
    assert.deepEqual(state.results, {});
    assert.equal(state.pending, null);
  }
});

test('persisted fetched wave resumes without invoking either host again', async t => {
  const state = fixture(t);
  delete state.dispatchEvidence; // Saved legacy run has no invocation telemetry.
  // The controller has already received both model results, then crashed before
  // applying. The saved responses are the only authority for resume.
  state.wave = { id: 'saved', roles: ['qa', 'security'], status: 'fetched', receipt: treeReceipt(state.root),
    hosts: { qa: 'claude-code', security: 'codex' }, context: { record: { mode: 'inline', results: [] }, text: '' },
    responses: { qa: reply('qa'), security: reply('security') } };
  const restored = JSON.parse(JSON.stringify(state));
  await runParallelWave(restored, { runners: { 'claude-code': async () => assert.fail('duplicate Claude dispatch'),
    codex: async () => assert.fail('duplicate Codex dispatch') }, verify });
  assert.equal(restored.status, 'awaiting-gate');
  assert.equal(restored.wave, null);
  assert.equal(restored.waveHistory[0].id, 'saved');
  assert.equal(restored.dispatchEvidence.records.length, 2, 'only fresh verifiers are observed');
  assert.ok(restored.dispatchEvidence.records.every(r => r.kind === 'verifier'));
  assert.equal(dispatchEvidenceSummary(restored).workerCalls, null, 'legacy worker history is unknown');
});

test('current fetched wave retains observed workers and adds verifiers once after resume', async t => {
  const state = fixture(t); let fetched;
  await runParallelWave(state, { runners: { 'claude-code': async () => reply('qa'), codex: async () => reply('security') },
    verify: async () => assert.fail('must interrupt before verification'), save: s => {
      if (s.wave?.status === 'fetched') { fetched = structuredClone(s); throw Error('simulated interruption after fetched snapshot'); }
    } });
  assert.equal(state.status, 'blocked');
  assert.equal(existsSync(join(state.root, 'docs/qa.md')), false);
  assert.equal(dispatchEvidenceSummary(fetched).workerCalls, 2);
  const ids = fetched.dispatchEvidence.records.map(r => r.id);
  await runParallelWave(fetched, { runners: { codex: async () => assert.fail('duplicate worker'),
    'claude-code': async () => assert.fail('duplicate worker') }, verify });
  assert.equal(fetched.status, 'awaiting-gate');
  assert.equal(dispatchEvidenceSummary(fetched).workerCalls, 2);
  assert.equal(dispatchEvidenceSummary(fetched).verifierCalls, 2);
  assert.deepEqual(fetched.dispatchEvidence.records.slice(0, 2).map(r => r.id), ids);
  assert.equal(fetched.approvals.length, 0);
});

test('resume after first verified role applies only the retained second response', async t => {
  const state = fixture(t);
  const receipt = treeReceipt(state.root);
  const context = { record: { mode: 'inline', results: [] }, text: '' };
  state.wave = { id: 'partly-applied', roles: ['qa', 'security'], status: 'fetched', receipt,
    hosts: { qa: 'claude-code', security: 'codex' }, context,
    responses: { qa: reply('qa'), security: reply('security') } };
  await runStage(state, { prepared: { response: state.wave.responses.qa, receipt, context }, verify });
  assert.equal(state.status, 'ready');
  assert.deepEqual(Object.keys(state.results), ['qa']);
  assert.equal(existsSync(join(state.root, 'docs/security.md')), false);
  const firstAttempt = state.results.qa.attemptId;
  const restored = JSON.parse(JSON.stringify(state));
  await runParallelWave(restored, { runners: { 'claude-code': async () => assert.fail('duplicate Claude dispatch'),
    codex: async () => assert.fail('duplicate Codex dispatch') }, verify });
  assert.equal(restored.status, 'awaiting-gate');
  assert.equal(restored.results.qa.attemptId, firstAttempt);
  assert.deepEqual(restored.attempts.map(attempt => attempt.role), ['qa', 'security']);
  assert.equal(restored.waveHistory[0].status, 'verified');
  assert.equal(existsSync(join(state.root, 'docs/security.md')), true);
  approve(restored, restored.pending.token);
  approve(restored, restored.pending.token);
  assert.equal(restored.status, 'done');
});

test('resumed fetched wave revalidates both contracts before applying either', async t => {
  const state = fixture(t);
  const invalid = JSON.parse(reply('security').finalText);
  delete invalid.meta.report;
  state.wave = { id: 'saved-invalid', roles: ['qa', 'security'], status: 'fetched', receipt: treeReceipt(state.root),
    hosts: { qa: 'claude-code', security: 'codex' }, context: { record: { mode: 'inline', results: [] }, text: '' },
    responses: { qa: reply('qa'), security: { ...reply('security'), finalText: JSON.stringify(invalid) } } };
  await runParallelWave(state, { runners: { 'claude-code': async () => assert.fail('duplicate dispatch'),
    codex: async () => assert.fail('duplicate dispatch') }, verify });
  assert.equal(state.status, 'blocked');
  assert.match(state.reason, /missing artifact/);
  assert.equal(existsSync(join(state.root, 'docs/qa.md')), false);
  assert.deepEqual(state.results, {});
});

test('fetched wave refuses changed tree on resume', async t => {
  const state = fixture(t);
  state.wave = { id: 'saved', roles: ['qa', 'security'], status: 'fetched', receipt: treeReceipt(state.root),
    hosts: { qa: 'claude-code', security: 'codex' }, context: { record: { mode: 'inline', results: [] }, text: '' },
    responses: { qa: reply('qa'), security: reply('security') } };
  mkdirSync(join(state.root, 'src'));
  writeFileSync(join(state.root, 'src', 'changed.js'), 'export const changed = true;\n');
  await runParallelWave(state, { runners: { 'claude-code': async () => assert.fail('duplicate dispatch'),
    codex: async () => assert.fail('duplicate dispatch') }, verify });
  assert.equal(state.status, 'blocked');
  assert.match(state.reason, /working tree changed/);
  assert.equal(existsSync(join(state.root, 'docs/qa.md')), false);
});

test('route validation and Claude auth states fail closed', t => {
  const state = fixture(t);
  assert.equal(parallelPair({ ...state, hostRoutes: { qa: 'codex', security: 'codex' } }), null);
  assert.throws(() => newRun({ root: state.root, pluginRoot: state.pluginRoot, prompt: 'x', allowed: ['docs'],
    entry: 'qa', hostRoutes: { missing: 'claude-code' } }), /unknown routed role/);
  assert.throws(() => newRun({ root: state.root, pluginRoot: state.pluginRoot, prompt: 'x', allowed: ['docs'],
    entry: 'qa', hostRoutes: { qa: 'other' } }), /unsupported host/);
  assert.equal(detectClaude({ run: (_bin, args) => args[0] === '--version'
    ? { status: 0, stdout: '2.1' } : { status: 0, stdout: '{"loggedIn":false}' } }).state, 'no-auth');
  assert.equal(parseClaudeResult('{"type":"result","is_error":false,"result":"{\\"verdict\\":\\"PASS\\"}"}').state, 'ok');
  const structured = parseClaudeResult(JSON.stringify({ type: 'result', is_error: false,
    result: '**QA report**', structured_output: { verdict: 'PASS', summary: 'checked', meta: {}, files: [] } }));
  assert.deepEqual(JSON.parse(structured.finalText), { verdict: 'PASS', summary: 'checked', meta: {}, files: [] });
  assert.equal(parseClaudeResult('{"type":"result","is_error":true,"result":"failed"}').state, 'unreadable');
});

test('a sequential role uses its selected host and records provenance', async t => {
  const state = fixture(t);
  state.queue = ['qa'];
  // A one-role fixture must have no join before its gate can be raised.
  state.graph.qa.join = [];
  state.graph.qa.next = [];
  const called = [];
  await runStage(state, { runners: {
    'claude-code': async options => { called.push(options.bin); return reply('qa'); },
    codex: async () => assert.fail('wrong host'),
  }, verify });
  assert.deepEqual(called, ['claude']);
  assert.equal(state.results.qa.host, 'claude-code');
  assert.equal(state.attempts[0].host, 'claude-code');
  assert.equal(state.status, 'awaiting-gate');
});
