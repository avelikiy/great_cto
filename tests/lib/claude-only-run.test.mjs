/**
 * ADR-049, slice S1: a controlled run completes on a machine that has only Claude Code.
 *
 * Every model call here is a fake binary. No test reaches a real host.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { newRun, runStage, approve, verifierHost, runHosts, verifyStage } from '../../scripts/lib/codex-pipeline.mjs';
import { beginWork, readWorkTask, listWorkTasks, controlledTask, linkWork, observeWorkSession, finishWork } from '../../scripts/lib/work-tasks.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const CONTROLLER = join(REPO, 'scripts', 'codex-pipeline.mjs');

/** A Claude CLI stand-in: answers the probes, then one worker or verifier call per process. */
const fakeClaude = ({ loggedIn = true } = {}) => `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('fixture-claude 1.0.0'); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: ${loggedIn}, authMethod: 'fixture' })); process.exit(${loggedIn ? 0 : 1}); }
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  const schema = JSON.parse(args[args.indexOf('--json-schema') + 1]);
  const verifier = prompt.includes('independent verifier');
  const role = verifier ? (prompt.match(/independent verifier for the ([a-z0-9-]+) stage/) || [])[1]
    : (prompt.match(/You are the ([a-z0-9-]+) specialist/) || [])[1];
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ kind: verifier ? 'verifier' : 'worker', role,
    required: schema.required, tools: args[args.indexOf('--tools') + 1], safe: args.includes('--safe-mode'),
    promisesTests: /run tests that work in the read-only sandbox/.test(prompt) }) + '\\n');
  const plan = JSON.parse(process.env.FAKE_CLAUDE_PLAN);
  const structured = verifier ? { state: 'verified', findings: [], checks: ['fixture read the actual files'] } : plan[role];
  if (!structured) { console.log(JSON.stringify({ type: 'result', is_error: true, result: 'no plan for ' + role })); process.exit(1); }
  console.log(JSON.stringify({ type: 'result', is_error: false, structured_output: structured, usage: { input_tokens: 1, output_tokens: 1 } }));
});
`;
/** A Codex stand-in that only records that it was called. A Claude-only run must never reach it. */
const tripwireCodex = marker => `#!/usr/bin/env node
require('node:fs').appendFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' ') + '\\n');
process.exit(9);
`;
const writeBin = (path, source) => { writeFileSync(path, source); chmodSync(path, 0o755); return path; };
const lines = file => existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

function withEnv(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

const GRAPH = '[transitions.writer]\non = ["DONE"]\nproduces = ["report"]\ngate = "gate:code"\nnext = ["reviewer"]\n[transitions.reviewer]\non = ["PASS"]\ngate = "gate:ship"\nnext = []';
function fixtureProject(t) {
  const base = mkdtempSync(join(tmpdir(), 'claude-only-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project'), pluginRoot = join(base, 'plugin');
  mkdirSync(root); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), GRAPH);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  commitFixture(root);
  return { base, root, pluginRoot };
}
const PLAN = {
  writer: { verdict: 'DONE', summary: 'wrote the module', meta: { report: 'src/app.js' }, files: [{ path: 'src/app.js', before: null, content: 'export const x = 1;\n' }] },
  reviewer: { verdict: 'PASS', summary: 'read the module', meta: {}, files: [] },
};

test('one host for every role and the verifier: the route is recorded and unknown hosts are refused', t => {
  const { root, pluginRoot } = fixtureProject(t);
  const run = options => newRun({ root, pluginRoot, prompt: 'Build a fixture', allowed: ['src'], entry: 'writer', ...options });
  const legacy = run({});
  assert.equal(verifierHost(legacy), 'codex');
  assert.deepEqual(runHosts(legacy), ['codex']);
  assert.equal('defaultHost' in legacy, false, 'a run without the option keeps the old state shape');
  const claude = run({ defaultHost: 'claude-code' });
  assert.equal(claude.defaultHost, 'claude-code');
  assert.equal(verifierHost(claude), 'claude-code');
  assert.deepEqual(runHosts(claude), ['claude-code']);
  const mixed = run({ defaultHost: 'claude-code', verifierHost: 'codex', hostRoutes: { reviewer: 'codex' } });
  assert.equal(verifierHost(mixed), 'codex');
  assert.deepEqual(runHosts(mixed), ['claude-code', 'codex']);
  assert.throws(() => run({ defaultHost: 'gemini' }), /unsupported host/);
  assert.throws(() => run({ verifierHost: 'gemini' }), /unsupported verifier host/);
});

test('unlisted roles follow the run host; an explicit route still wins', async t => {
  const { root, pluginRoot } = fixtureProject(t);
  const s = newRun({ root, pluginRoot, prompt: 'Build a fixture', allowed: ['src'], entry: 'writer',
    defaultHost: 'claude-code', verifierHost: 'claude-code', hostRoutes: { reviewer: 'codex' } });
  const seen = [];
  const reply = body => ({ state: 'ok', code: 0, errors: [], text: JSON.stringify(body), usage: null });
  const runner = host => async options => {
    const verifier = options.prompt.includes('independent verifier');
    seen.push(`${host}:${verifier ? 'verifier' : 'worker'}`);
    if (verifier) return reply({ state: 'verified', findings: [], checks: ['read files'] });
    return reply(options.prompt.includes('You are the writer specialist') ? PLAN.writer : PLAN.reviewer);
  };
  const runners = { codex: runner('codex'), 'claude-code': runner('claude-code') };
  // `runners` are worker runners; the verifier's subprocess is stood in for here, on the host the run names.
  const verify = (state, role, proposal) => verifyStage(state, role, proposal, runners[verifierHost(state)]);
  await runStage(s, { runners, verify });
  assert.equal(s.status, 'awaiting-gate', s.reason);
  approve(s, s.pending.token);
  await runStage(s, { runners, verify });
  assert.equal(s.status, 'awaiting-gate', s.reason);
  assert.deepEqual(seen, ['claude-code:worker', 'claude-code:verifier', 'codex:worker', 'claude-code:verifier']);
  assert.deepEqual(s.attempts.map(a => [a.host, a.verifierHost]), [['claude-code', 'claude-code'], ['codex', 'claude-code']]);
});

test('Claude-only run: entry stage -> gate -> approve -> next stage -> gate -> done, and Codex is never called', async t => {
  const { base, root, pluginRoot } = fixtureProject(t);
  const log = join(base, 'claude.log'), codexCalls = join(base, 'codex.calls');
  withEnv(t, { GREAT_CTO_CLAUDE_BIN: writeBin(join(base, 'claude'), fakeClaude()),
    GREAT_CTO_CODEX_BIN: writeBin(join(base, 'codex'), tripwireCodex(codexCalls)),
    FAKE_CLAUDE_LOG: log, FAKE_CLAUDE_PLAN: JSON.stringify(PLAN), GREAT_CTO_DISABLE_EVENTS: '1' });
  const s = newRun({ root, pluginRoot, prompt: 'Build a fixture', allowed: ['src'], entry: 'writer', defaultHost: 'claude-code' });

  // Real runners and the real verifier: only the binary is a fixture.
  await runStage(s);
  assert.equal(s.status, 'awaiting-gate', s.reason);
  assert.deepEqual(s.pending.gates, ['gate:code']);
  assert.equal(readFileSync(join(root, 'src/app.js'), 'utf8'), 'export const x = 1;\n');
  const before = lines(log).length;
  await runStage(s); // a pending gate is a stop: nothing is dispatched across it
  assert.equal(lines(log).length, before);
  approve(s, s.pending.token);
  assert.equal(s.status, 'ready');
  await runStage(s);
  assert.equal(s.status, 'awaiting-gate', s.reason);
  assert.deepEqual(s.pending.gates, ['gate:ship']);
  approve(s, s.pending.token);
  assert.equal(s.status, 'done');

  assert.equal(existsSync(codexCalls), false, 'a Claude-only run must not invoke Codex');
  const calls = lines(log);
  assert.deepEqual(calls.map(c => `${c.kind}:${c.role}`), ['worker:writer', 'verifier:writer', 'worker:reviewer', 'verifier:reviewer']);
  // The verifier is a fresh restricted session with its own output contract.
  for (const call of calls) { assert.equal(call.safe, true); assert.equal(call.tools, 'Read,Glob,Grep'); }
  assert.deepEqual(calls.filter(c => c.kind === 'worker').map(c => c.required), [['verdict', 'summary', 'meta', 'files'], ['verdict', 'summary', 'meta', 'files']]);
  assert.deepEqual(calls.filter(c => c.kind === 'verifier').map(c => c.required), [['state', 'findings', 'checks'], ['state', 'findings', 'checks']]);
  // An inspection-only verifier is not told it can run tests.
  assert.ok(calls.filter(c => c.kind === 'verifier').every(c => c.promisesTests === false));

  // "Checked by": the verifying host is on the attempt, the result, the trace and the dispatch record.
  assert.deepEqual(s.attempts.map(a => [a.role, a.host, a.verifierHost, a.status]),
    [['writer', 'claude-code', 'claude-code', 'verified'], ['reviewer', 'claude-code', 'claude-code', 'verified']]);
  assert.deepEqual(Object.values(s.results).map(r => r.verifierHost), ['claude-code', 'claude-code']);
  const verifierNodes = s.executionTrace.nodes.filter(n => n.kind === 'verifier');
  assert.equal(verifierNodes.length, 2);
  assert.ok(verifierNodes.every(n => n.host === 'claude-code'));
  const verifierCalls = s.dispatchEvidence.records.filter(r => r.kind === 'verifier');
  assert.deepEqual(verifierCalls.map(r => [r.host, r.role, r.outcome]), [['claude-code', 'claude-verifier', 'returned'], ['claude-code', 'claude-verifier', 'returned']]);
});

// ── the entrypoint ───────────────────────────────────────────────────────────

/** A PATH with node and git and nothing else of ours: no codex, no claude. */
function bareEnv(base, extra = {}) {
  const bin = join(base, 'bin'); mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, 'node'));
  symlinkSync(execFileSync('/usr/bin/which', ['git'], { encoding: 'utf8' }).trim(), join(bin, 'git'));
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, GREAT_CTO_CODEX_RUNS_DIR: join(base, 'runs'), GREAT_CTO_TASKS_DIR: join(base, 'tasks'),
    GREAT_CTO_DISABLE_EVENTS: '1', FAKE_CLAUDE_LOG: join(base, 'claude.log'), ...extra };
  delete env.GREAT_CTO_CODEX_BIN; delete env.GREAT_CTO_WORK_LEASE;
  if (!('GREAT_CTO_CLAUDE_BIN' in extra)) delete env.GREAT_CTO_CLAUDE_BIN;
  return env;
}
function gitProject(base) {
  const root = join(base, 'project'); mkdirSync(root);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  commitFixture(root);
  return root;
}
const controller = (env, ...args) => spawnSync(process.execPath, [CONTROLLER, ...args], { cwd: REPO, env, encoding: 'utf8', timeout: 60000 });
const SHIPPED_PLAN = {
  'product-owner': { verdict: 'BRIEF_READY', summary: 'brief written', meta: { brief: 'docs/product/BRIEF-fixture.md' },
    files: [{ path: 'docs/product/BRIEF-fixture.md', before: null, content: '# Brief\n\nFixture brief.\n' }] },
  architect: { verdict: 'APPROVED', summary: 'architecture written', meta: { arch: 'docs/architecture/ARCH-fixture.md' },
    files: [{ path: 'docs/architecture/ARCH-fixture.md', before: null, content: '# Architecture\n\nFixture architecture.\n' }] },
};

test('start --host claude-code with no Codex on PATH: product decision stops the run, approval starts the next stage', t => {
  const base = mkdtempSync(join(tmpdir(), 'claude-only-cli-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = gitProject(base);
  const env = bareEnv(base, { GREAT_CTO_CLAUDE_BIN: writeBin(join(base, 'claude'), fakeClaude()), FAKE_CLAUDE_PLAN: JSON.stringify(SHIPPED_PLAN) });
  assert.equal(spawnSync('codex', ['--version'], { env }).error?.code, 'ENOENT', 'the fixture PATH must not contain codex');

  const started = controller(env, 'start', '--dir', root, '--allow', 'docs', '--prompt', 'Build a fixture product', '--host', 'claude-code');
  assert.equal(started.status, 0, started.stderr);
  const first = JSON.parse(started.stdout);
  assert.equal(first.status, 'awaiting-gate');
  assert.deepEqual(first.pending.gates, ['gate:product']);
  assert.deepEqual(first.hosts, { default: 'claude-code', verifier: 'claude-code' });
  assert.deepEqual(first.rolesCompleted, ['product-owner']);
  assert.equal(existsSync(join(root, 'docs/architecture/ARCH-fixture.md')), false, 'nothing past the decision is built');

  // The task is a controlled Claude Code task: managed, path-scoped, linked to the run, not a native session.
  const listing = listWorkTasks(root, { store: env.GREAT_CTO_TASKS_DIR });
  assert.equal(listing.tasks.length, 1);
  const task = listing.tasks[0];
  assert.equal(task.host, 'claude-code');
  assert.equal(task.managed, true);
  assert.deepEqual(task.authority, { mode: 'explicit-paths', writeScope: ['docs'] });
  assert.equal(controlledTask(task), true);
  assert.deepEqual(task.links, { runs: [first.id], sessions: [], issues: [] });
  assert.equal(task.phase, 'needs_decision');
  assert.equal(task.budget.maxStageAttempts, 3);
  assert.equal(task.operations[0].state, 'host_returned');

  // Resuming without approval does not move: the stop is the controller's, not the model's.
  const stalled = controller(env, 'resume', first.id);
  assert.equal(JSON.parse(stalled.stdout).status, 'awaiting-gate');
  assert.equal(lines(env.FAKE_CLAUDE_LOG).length, 2);

  const approved = controller(env, 'approve', first.id, '--token', first.pending.token);
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(JSON.parse(approved.stdout).status, 'ready');
  const resumed = controller(env, 'resume', first.id);
  assert.equal(resumed.status, 0, resumed.stderr);
  const second = JSON.parse(resumed.stdout);
  assert.equal(second.status, 'awaiting-gate');
  assert.deepEqual(second.pending.gates, ['gate:arch']);
  assert.deepEqual(second.rolesCompleted, ['product-owner', 'architect']);

  const saved = JSON.parse(readFileSync(second.stateFile, 'utf8'));
  assert.deepEqual(saved.attempts.map(a => [a.role, a.host, a.verifierHost]),
    [['product-owner', 'claude-code', 'claude-code'], ['architect', 'claude-code', 'claude-code']]);
  assert.deepEqual(lines(env.FAKE_CLAUDE_LOG).map(c => `${c.kind}:${c.role}`),
    ['worker:product-owner', 'verifier:product-owner', 'worker:architect', 'verifier:architect']);
  const after = readWorkTask(task.taskId, { store: env.GREAT_CTO_TASKS_DIR, root });
  assert.equal(after.host, 'claude-code');
  assert.deepEqual(after.operations.map(o => [o.kind, o.state]), [['start', 'host_returned'], ['resume', 'host_returned'], ['resume', 'host_returned']]);
  assert.deepEqual(after.evidence.map(e => [e.role, e.verified]), [['product-owner', true], ['architect', true]]);
});

test('start is refused with the reason, and leaves no task and no run, when the chosen host is missing or signed out', t => {
  const base = mkdtempSync(join(tmpdir(), 'claude-only-refusal-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = gitProject(base);
  const args = ['start', '--dir', root, '--allow', 'docs', '--prompt', 'Build a fixture product'];
  const nothingLeft = env => {
    assert.equal(listWorkTasks(root, { store: env.GREAT_CTO_TASKS_DIR }).tasks.length, 0, 'a refused start leaves no task');
    assert.deepEqual(existsSync(env.GREAT_CTO_CODEX_RUNS_DIR) ? readdirSync(env.GREAT_CTO_CODEX_RUNS_DIR) : [], [], 'a refused start leaves no run');
  };

  const absent = bareEnv(base, { GREAT_CTO_CLAUDE_BIN: join(base, 'no-such-claude') });
  const missing = controller(absent, ...args, '--host', 'claude-code');
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Claude Code host unavailable: Claude Code CLI is unavailable/);
  nothingLeft(absent);

  rmSync(join(base, 'bin'), { recursive: true });
  const signedOut = bareEnv(base, { GREAT_CTO_CLAUDE_BIN: writeBin(join(base, 'claude-signed-out'), fakeClaude({ loggedIn: false })) });
  const noAuth = controller(signedOut, ...args, '--host', 'claude-code');
  assert.equal(noAuth.status, 2);
  assert.match(noAuth.stderr, /Claude Code host unavailable: Claude Code is not logged in/);
  nothingLeft(signedOut);

  // The verifier alone on a missing host is refused the same way.
  const verifierOnly = controller(signedOut, ...args, '--verifier-host', 'claude-code');
  assert.equal(verifierOnly.status, 2);
  assert.match(verifierOnly.stderr, /Claude Code host unavailable/);
  nothingLeft(signedOut);

  const noCodex = controller(signedOut, ...args, '--host', 'codex');
  assert.equal(noCodex.status, 2);
  assert.match(noCodex.stderr, /Codex host unavailable: /);
  nothingLeft(signedOut);

  for (const bad of [['--host', 'gemini'], ['--host'], ['--verifier-host', 'gemini']]) {
    const refused = controller(signedOut, ...args, ...bad);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /requires codex or claude-code/);
    nothingLeft(signedOut);
  }
});

test('an existing task starts a controlled Claude run only when it is a controlled Claude task', t => {
  const base = mkdtempSync(join(tmpdir(), 'claude-only-task-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = gitProject(base);
  const env = bareEnv(base, { GREAT_CTO_CLAUDE_BIN: writeBin(join(base, 'claude'), fakeClaude()), FAKE_CLAUDE_PLAN: JSON.stringify(SHIPPED_PLAN) });
  const store = env.GREAT_CTO_TASKS_DIR, goal = 'Build a fixture product';
  const start = (taskId, ...extra) => controller(env, 'start', '--dir', root, '--allow', 'docs', '--prompt', goal, '--task-id', taskId, ...extra);

  // The interactive native route keeps its own authority and never becomes a controlled run.
  const native = beginWork({ root, host: 'claude-code', goal, authority: { mode: 'native-interactive', writeScope: null } }, { store });
  native.lease.release();
  assert.equal(controlledTask(native.task), false);
  assert.equal(native.task.budget.maxStageAttempts, null);
  const refusedNative = start(native.task.taskId, '--host', 'claude-code');
  assert.equal(refusedNative.status, 2);
  assert.match(refusedNative.stderr, /task authority does not match run request/);
  assert.throws(() => linkWork(native.task.taskId, 'runs', '00000000-0000-4000-8000-000000000001', { store, root, host: 'claude-code' }), /controlled/);
  finishWork(native.task.taskId, native.operation.operationId, 0, { store, root });

  const controlled = beginWork({ root, host: 'claude-code', goal, authority: { mode: 'explicit-paths', writeScope: ['docs'] } }, { store });
  controlled.lease.release();
  assert.equal(controlledTask(controlled.task), true);
  assert.equal(controlled.task.budget.maxStageAttempts, 3);
  // A task host is not changed by the start request.
  const wrongHost = start(controlled.task.taskId);
  assert.equal(wrongHost.status, 2);
  assert.match(wrongHost.stderr, /task authority does not match run request/);
  // A native session event in the same folder does not attach to the controlled task.
  const session = '11111111-1111-4111-8111-111111111111';
  assert.throws(() => linkWork(controlled.task.taskId, 'sessions', session, { store, root, host: 'claude-code' }), /native session/);
  assert.equal(observeWorkSession({ hook_event_name: 'Stop', session_id: session, cwd: root }, { store }), null);

  const ok = start(controlled.task.taskId, '--host', 'claude-code');
  assert.equal(ok.status, 0, ok.stderr);
  const out = JSON.parse(ok.stdout);
  assert.equal(out.status, 'awaiting-gate');
  const task = readWorkTask(controlled.task.taskId, { store, root });
  assert.deepEqual(task.links.runs, [out.id]);
  assert.equal(task.phase, 'needs_decision');
});
