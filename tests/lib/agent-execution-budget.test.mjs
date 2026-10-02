import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readExecutionBudget, requireAgents, reserveAgents, releaseAgent, reconcileAgent, reconcileBudgetLock, budgetSnapshot, withAgentBudget } from '../../scripts/lib/agent-execution-budget.mjs';
import { newRun, runStage, parallelPair } from '../../scripts/lib/codex-pipeline.mjs';

function fixture(t, limits = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-admission-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'project'); mkdirSync(root);
  const file = join(dir, 'policy.json');
  writeFileSync(file, JSON.stringify({ maxConcurrent: 3, maxDepth: 1, maxCallsPerRun: 24, runId: 'test', ...limits }), { mode: 0o600 });
  const env = { GREAT_CTO_AGENT_BUDGET_FILE: file, GREAT_CTO_AGENT_BUDGET_STORE: join(dir, 'store') };
  const budget = readExecutionBudget(root, { env });
  return { dir, root, file, env, budget };
}
const request = (callId, host = 'codex') => ({ callId, host, role: 'worker', depth: 1 });

test('default is off; unsafe policy paths, permissions and malformed/deeper limits fail closed', t => {
  const f = fixture(t); assert.equal(readExecutionBudget(f.root, { env: {} }), null);
  const inside = join(f.root, 'policy.json'); writeFileSync(inside, '{}', { mode: 0o600 });
  assert.throws(() => readExecutionBudget(f.root, { env: { ...f.env, GREAT_CTO_AGENT_BUDGET_FILE: inside } }), /outside/);
  chmodSync(f.file, 0o644); assert.throws(() => readExecutionBudget(f.root, { env: f.env }), /private/); chmodSync(f.file, 0o600);
  writeFileSync(f.file, JSON.stringify({ maxConcurrent: 3, maxDepth: 2, maxCallsPerRun: 24, runId: 'test' }));
  assert.throws(() => readExecutionBudget(f.root, { env: f.env }), /maxDepth/);
});

test('Codex and Claude share slots; total admissions are not refunded on release', t => {
  const f = fixture(t, { maxConcurrent: 2, maxCallsPerRun: 3 });
  const [a, b] = requireAgents(f.budget, [request('a'), request('b', 'claude-code')]);
  assert.match(reserveAgents(f.budget, [request('c')]).error, /concurrency/);
  releaseAgent(f.budget, a);
  const [c] = requireAgents(f.budget, [request('c')]); releaseAgent(f.budget, c); releaseAgent(f.budget, b);
  assert.equal(budgetSnapshot(f.budget).calls, 3);
  assert.match(reserveAgents(f.budget, [request('d')]).error, /call budget/);
});

test('wave reservations are all-or-none; replays are idempotent and token/fence protects newer work', t => {
  const f = fixture(t, { maxConcurrent: 2 });
  const [a] = requireAgents(f.budget, [request('a')]);
  assert.match(reserveAgents(f.budget, [request('b'), request('c', 'claude-code')]).error, /concurrency/);
  assert.equal(budgetSnapshot(f.budget).active.length, 1);
  assert.equal(requireAgents(f.budget, [request('a')])[0].token, a.token);
  assert.equal(budgetSnapshot(f.budget).calls, 1);
  assert.throws(() => releaseAgent(f.budget, { ...a, fence: a.fence + 1 }), /stale/);
  releaseAgent(f.budget, a); const [b] = requireAgents(f.budget, [request('b')]);
  assert.ok(b.fence > a.fence); assert.throws(() => releaseAgent(f.budget, a), /stale/);
  assert.match(reserveAgents(f.budget, [request('a')]).error, /cannot be reused/);
  releaseAgent(f.budget, b);
  const defaultRole = { callId: 'default-role', host: 'codex', depth: 1, ownerPid: null };
  const [defaultLease] = requireAgents(f.budget, [defaultRole]);
  assert.equal(defaultLease.ownerPid, null);
  assert.equal(requireAgents(f.budget, [defaultRole])[0].token, defaultLease.token);
});

test('nested delegation and conflicting policies cannot bypass the shared ledger', t => {
  const f = fixture(t);
  assert.match(reserveAgents(f.budget, [{ ...request('nested'), depth: 2 }]).error, /depth/);
  assert.throws(() => reserveAgents({ ...f.budget, limits: { ...f.budget.limits, maxConcurrent: 16 } }, [request('x')]), /mismatch/);
});

test('a crashed execution is not expired by age or PID; explicit exact reconciliation is required', t => {
  const f = fixture(t, { maxConcurrent: 1 });
  const [lease] = requireAgents(f.budget, [{ ...request('crash'), ownerPid: 99999999 }]);
  assert.match(reserveAgents(f.budget, [request('other')]).error, /concurrency/);
  assert.throws(() => reconcileAgent(f.budget, lease), /confirmation/);
  reconcileAgent(f.budget, { ...lease, confirmedStopped: true });
  assert.equal(budgetSnapshot(f.budget).active.length, 0); assert.equal(budgetSnapshot(f.budget).calls, 1);
});

test('crashed transaction lock recovery requires dead owner, exact token and confirmation', t => {
  const f = fixture(t); const lock = join(f.budget.store, 'lock'); mkdirSync(lock);
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ token: 'dead', pid: process.pid }));
  assert.throws(() => reconcileBudgetLock(f.budget, { token: 'dead', confirmedStopped: true }), /still alive/);
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ token: 'dead', pid: 99999999 }));
  assert.throws(() => reconcileBudgetLock(f.budget, { token: 'wrong', confirmedStopped: true }), /identity/);
  reconcileBudgetLock(f.budget, { token: 'dead', confirmedStopped: true });
  assert.equal(budgetSnapshot(f.budget).active.length, 0);
});

test('worker failure releases admission and independent verification uses its own slot', async t => {
  const f = fixture(t);
  await assert.rejects(withAgentBudget({ executionBudget: f.budget }, { callId: 'worker', host: 'codex', role: 'senior-dev' }, async () => { throw Error('runner failed'); }), /runner failed/);
  await withAgentBudget({ executionBudget: f.budget }, { callId: 'verify', host: 'codex', role: 'verifier' }, async () => assert.equal(budgetSnapshot(f.budget).active.length, 1));
  assert.equal(budgetSnapshot(f.budget).calls, 2); assert.equal(budgetSnapshot(f.budget).active.length, 0);
});

test('reconciled in-flight output cannot pass admission fencing or release a newer worker', async t => {
  const f = fixture(t, { maxConcurrent: 1 });
  await assert.rejects(withAgentBudget({ executionBudget: f.budget }, { callId: 'old', host: 'codex', role: 'worker' }, async () => {
    const old = budgetSnapshot(f.budget).active[0]; reconcileAgent(f.budget, { ...old, confirmedStopped: true });
    requireAgents(f.budget, [request('new')]); return 'stale response';
  }), /stale/);
  assert.equal(budgetSnapshot(f.budget).active[0].callId, 'new');
});

test('racing independent processes cannot oversubscribe the global cap', async t => {
  const f = fixture(t, { maxConcurrent: 3 });
  const moduleUrl = new URL('../../scripts/lib/agent-execution-budget.mjs', import.meta.url).href;
  const code = `import {readExecutionBudget,reserveAgents} from ${JSON.stringify(moduleUrl)}; const b=readExecutionBudget(process.argv[1]); const r=reserveAgents(b,[{callId:process.argv[2],host:process.argv[3],role:'worker',depth:1}]); console.log(JSON.stringify(r));`;
  const outputs = await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, f.root, `race-${i}`, i % 2 ? 'codex' : 'claude-code'], { env: { ...process.env, ...f.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', b => { out += b; }); child.stderr.on('data', b => { err += b; });
    child.on('error', reject); child.on('close', exit => exit === 0 ? resolve(JSON.parse(out)) : reject(Error(err)));
  })));
  assert.equal(outputs.filter(Array.isArray).length, 3); assert.equal(budgetSnapshot(f.budget).active.length, 3);
});

test('native hooks reserve before launch, deny nesting/background and release only foreground success', t => {
  const f = fixture(t, { maxConcurrent: 1 });
  const hook = fileURLToPath(new URL('../../scripts/hooks/agent-execution-budget.mjs', import.meta.url));
  const payload = { cwd: f.root, session_id: 'session', tool_use_id: 'tool1', tool_name: 'Agent', hook_event_name: 'PreToolUse', tool_input: { subagent_type: 'great-cto:qa-engineer', run_in_background: false } };
  const run = (phase, input = payload, env = {}) => spawnSync(process.execPath, [hook, phase], { env: { ...process.env, ...f.env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1', ...env }, input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run('pre', payload, { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '' }).status, 2);
  assert.equal(run('pre', { ...payload, agent_id: 'parent' }).status, 2);
  assert.equal(run('pre', { ...payload, tool_input: { run_in_background: true } }).status, 2);
  assert.equal(run('pre', { ...payload, hook_event_name: 'SubagentStart' }).status, 2);
  assert.equal(run('pre').status, 0); assert.equal(run('pre').status, 0);
  assert.equal(run('pre', { ...payload, tool_use_id: 'tool2' }).status, 2);
  assert.equal(run('post', { ...payload, hook_event_name: 'PostToolUseFailure' }).status, 2);
  assert.equal(budgetSnapshot(f.budget).active.length, 1);
  assert.equal(run('post', { ...payload, hook_event_name: 'PostToolUse', tool_response: { status: 'completed', agentId: 'agent-one' } }).status, 0);
  assert.equal(budgetSnapshot(f.budget).active.length, 0);
  assert.equal(budgetSnapshot(f.budget).calls, 1);
});

test('async launch, missing status and stop intent retain native lease and concurrency pressure', t => {
  const f = fixture(t, { maxConcurrent: 1 });
  const hook = fileURLToPath(new URL('../../scripts/hooks/agent-execution-budget.mjs', import.meta.url));
  const payload = { cwd: f.root, session_id: 'session', tool_use_id: 'tool1', tool_name: 'Agent',
    hook_event_name: 'PreToolUse', tool_input: { subagent_type: 'Explore', run_in_background: false } };
  const run = (phase, input) => spawnSync(process.execPath, [hook, phase], {
    env: { ...process.env, ...f.env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' }, input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run('pre', payload).status, 0);
  for (const response of [undefined, {}, { status: 'async_launched', agentId: 'agent-one' },
    { status: 'running', agentId: 'agent-one' }, { status: 'completed' },
    { status: 'completed', agentId: '../other' }, { status: 'failed', agentId: 'agent-one' }]) {
    const result = run('post', { ...payload, hook_event_name: 'PostToolUse', tool_response: response });
    assert.equal(result.status, 2); assert.match(result.stderr, /retained/);
    assert.equal(budgetSnapshot(f.budget).active.length, 1);
    assert.match(reserveAgents(f.budget, [request('codex-next')]).error, /concurrency/);
  }
  for (const hook_event_name of ['SubagentStop', 'Stop', 'TeammateIdle', 'PostToolUseFailure']) {
    assert.equal(run('post', { ...payload, hook_event_name, tool_response: { status: 'completed', agentId: 'agent-one' } }).status, 2);
    assert.equal(budgetSnapshot(f.budget).active.length, 1);
  }
  assert.equal(run('post', { ...payload, hook_event_name: 'PostToolUse', tool_response: { status: 'completed', agentId: 'agent-one' } }).status, 0);
  assert.equal(budgetSnapshot(f.budget).active.length, 0); assert.equal(budgetSnapshot(f.budget).calls, 1);
});

test('native nested cwd cannot disguise an inside-project budget policy as operator-owned', t => {
  const f = fixture(t); mkdirSync(join(f.root, '.great_cto')); mkdirSync(join(f.root, 'src'));
  writeFileSync(join(f.root, '.great_cto/PROJECT.md'), 'archetype: web-service\n');
  const inside = join(f.root, 'policy.json'); writeFileSync(inside, readFileSync(f.file), { mode: 0o600 });
  const hook = fileURLToPath(new URL('../../scripts/hooks/agent-execution-budget.mjs', import.meta.url));
  const payload = { cwd: join(f.root, 'src'), session_id: 'nested-cwd', tool_use_id: 'tool1', tool_name: 'Agent', hook_event_name: 'PreToolUse', tool_input: {} };
  const env = { ...process.env, ...f.env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1', GREAT_CTO_AGENT_BUDGET_FILE: inside };
  const result = spawnSync(process.execPath, [hook, 'pre'], { env, input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(result.status, 2); assert.match(result.stderr, /outside the worker workspace/);
  assert.equal(budgetSnapshot(f.budget).active.length, 0); assert.equal(budgetSnapshot(f.budget).calls, 0);
});

test('controlled stages account for both worker and verifier, without changing gates', async t => {
  const f = fixture(t); const pluginRoot = join(f.dir, 'plugin'); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.writer]\non=["DONE"]\nproduces=["report"]\ngate="gate:ship"\nnext=[]');
  const state = newRun({ root: f.root, pluginRoot, prompt: 'x', allowed: ['docs'], entry: 'writer' });
  state.executionBudget = f.budget;
  await runStage(state, { execute: async () => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict: 'DONE', summary: 'done', meta: { report: 'docs/report.md' }, files: [{ path: 'docs/report.md', before: null, content: 'report' }] }) }), verify: async () => ({ state: 'verified', findings: [], checks: ['actual report'] }) });
  assert.equal(state.status, 'awaiting-gate'); assert.deepEqual(state.pending.gates, ['gate:ship']);
  assert.equal(budgetSnapshot(f.budget).calls, 2); assert.equal(budgetSnapshot(f.budget).active.length, 0);
  assert.equal(parallelPair({ ...state, executionBudget: { ...f.budget, limits: { ...f.budget.limits, maxConcurrent: 1 } } }), null);
});

test('exhaustion refuses a new worker without fabricating a successful stage', async t => {
  const f = fixture(t, { maxCallsPerRun: 2 });
  for (const id of ['old1', 'old2']) { const [l] = requireAgents(f.budget, [request(id)]); releaseAgent(f.budget, l); }
  const pluginRoot = join(f.dir, 'plugin'); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.writer]\non=["DONE"]\ngate="gate:ship"\nnext=[]');
  const state = newRun({ root: f.root, pluginRoot, prompt: 'x', allowed: ['docs'], entry: 'writer' }); state.executionBudget = f.budget;
  let launched = false;
  await runStage(state, { execute: async () => { launched = true; throw Error('should not launch'); } });
  assert.equal(launched, false); assert.equal(state.status, 'blocked'); assert.match(state.reason, /call budget/);
  assert.equal(state.results.writer, undefined); assert.equal(state.pending, null);
});

test('manifest budget hooks propagate failures rather than swallowing enforcement', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  for (const event of ['PreToolUse', 'PostToolUse']) {
    const commands = manifest.hooks[event].flatMap(group => group.hooks).filter(h => h.command.includes('agent-execution-budget.mjs'));
    assert.equal(commands.length, 1); assert.doesNotMatch(commands[0].command, /\|\| true/); assert.match(commands[0].command, /exit 2/);
  }
});
