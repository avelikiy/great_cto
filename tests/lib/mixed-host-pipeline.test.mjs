import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { newRun, parallelPair, runParallelWave, runStage, approve } from '../../scripts/lib/codex-pipeline.mjs';
import { detectClaude, parseClaudeResult } from '../../scripts/lib/claude-exec.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';

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

test('two hosts execute concurrently, proposals apply once, and gates remain human-owned', async t => {
  const state = fixture(t), started = [];
  assert.deepEqual(parallelPair(state), ['qa', 'security']);
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const runner = role => async options => {
    started.push(role);
    assert.equal(options.sandbox, 'read-only');
    assert.match(options.prompt, new RegExp(`You are the ${role} specialist`));
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

test('persisted fetched wave resumes without invoking either host again', async t => {
  const state = fixture(t);
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
