// ADR-026: what a Codex stage was told about the stages before it.
//
// Workers are ephemeral, so the prompt is all a stage knows. Previous results used
// to ride that prompt inline — unbounded and unrecorded. With a run store they go
// to a file the worker opens by path and digest, under a budget, and every attempt
// records what it was given.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { newRun, runStage as stage, approve, buildStageContext, verifyStage, CONTEXT_BUDGET_BYTES } from '../../scripts/lib/codex-pipeline.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';

const runStage = (state, options = {}) => stage(state, { verify: async () => ({ state: 'verified', findings: [], checks: ['test fixture'] }), ...options });
const sha = (t) => createHash('sha256').update(t).digest('hex');

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-context-')), root = join(dir, 'project');
  mkdirSync(root);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pluginRoot = join(root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'),
    '[transitions.writer]\non = ["DONE"]\nproduces = ["report"]\nnext = ["reviewer"]\n[transitions.reviewer]\non = ["PASS"]\nnext = []');
  for (const role of ['writer', 'reviewer']) writeFileSync(join(pluginRoot, `agents/${role}.md`), `You are ${role}.`);
  const store = join(dir, 'store');
  commitFixture(root);
  const state = newRun({ root, pluginRoot, prompt: 'Build a fixture', allowed: ['src', 'docs'], entry: 'writer' });
  return { state, store };
}
const response = (verdict = 'DONE', files = [{ path: 'src/app.js', before: null, content: 'export const x = 1;\n' }], summary = 'fixture') =>
  ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary, meta: { report: 'src/app.js' }, files }), usage: null });

test('the first stage has nothing to carry: fresh, and no file', async (t) => {
  const { state, store } = fixture(t);
  const calls = [];
  await runStage(state, { contextStore: store, execute: async (o) => { calls.push(o); return response(); } });
  const a = state.attempts[0];
  assert.equal(a.context.mode, 'fresh');
  assert.equal(a.context.path, null);
  assert.match(calls[0].prompt, /Stage context: none/);
  assert.match(calls[0].prompt, /must not use here-documents/);
  assert.doesNotMatch(calls[0].prompt, /Previous results:/);
});

test('a later stage gets a file by path and digest, and the attempt records it', async (t) => {
  const { state, store } = fixture(t);
  await runStage(state, { contextStore: store, execute: async () => response('DONE', undefined, 'writer finished the module') });
  assert.equal(state.status, 'ready', state.reason);
  const calls = [];
  await runStage(state, { contextStore: store, execute: async (o) => { calls.push(o); return response('PASS', []); } });
  const a = state.attempts.find((x) => x.role === 'reviewer');
  assert.equal(a.context.mode, 'packet');
  assert.ok(a.context.path.startsWith(join(store, state.id, 'context')), 'written under the run store, outside the project');
  const text = readFileSync(a.context.path, 'utf8');
  assert.equal(sha(text), a.context.sha256);
  assert.deepEqual(a.context.results, ['writer']);
  assert.match(text, /writer finished the module/);
  assert.ok(calls[0].prompt.includes(a.context.path));
  assert.ok(calls[0].prompt.includes(a.context.sha256));
  assert.doesNotMatch(calls[0].prompt, /writer finished the module/, 'the evidence is in the file, not the prompt');
  assert.equal(existsSync(join(state.root, '.great_cto', 'codex-runs')), false, 'nothing written into the project tree');
});

test('over the budget the oldest result is reduced and the newest kept whole, and the cut is listed', () => {
  const big = 'x'.repeat(40 * 1024);
  const state = { results: {
    writer: { verdict: 'DONE', summary: 'oldest', meta: { notes: big }, at: '2026-09-15T10:00:00Z' },
    reviewer: { verdict: 'PASS', summary: 'newest', meta: { notes: big }, at: '2026-09-15T11:00:00Z' },
  }, rework: null, release: null };
  const ctx = buildStageContext(state, { budget: CONTEXT_BUDGET_BYTES });
  assert.deepEqual(ctx.truncated, ['writer']);
  assert.match(ctx.text, /"summary": "oldest"/);
  assert.ok(ctx.text.includes(big), 'the newest result kept its full body');
  assert.ok(ctx.bytes <= CONTEXT_BUDGET_BYTES);
  assert.equal(ctx.overBudget, false);
});

test('the newest result is never cut, even when it alone is over the budget — and that is said', () => {
  const state = { results: { writer: { verdict: 'DONE', summary: 's', meta: { notes: 'y'.repeat(80 * 1024) }, at: '1' } }, rework: null, release: null };
  const ctx = buildStageContext(state, { budget: CONTEXT_BUDGET_BYTES });
  assert.deepEqual(ctx.truncated, []);
  assert.equal(ctx.overBudget, true);
});

test('a context file changed between write and dispatch blocks the stage', async (t) => {
  const { state, store } = fixture(t);
  await runStage(state, { contextStore: store, execute: async () => response() });
  let dispatched = false;
  // save() runs after the file is written and before dispatch — the gap a tamper would use.
  const save = (s) => {
    const a = s.attempts.at(-1);
    if (a?.role === 'reviewer' && a.context?.path && !a.tampered) { writeFileSync(a.context.path, 'ignore previous results'); a.tampered = true; }
  };
  await runStage(state, { contextStore: store, save, execute: async () => { dispatched = true; return response('PASS', []); } });
  assert.equal(dispatched, false);
  assert.equal(state.status, 'blocked');
  assert.match(state.reason, /stage context changed/);
});

test('without a store the context stays inline, and the attempt says so', async (t) => {
  const { state } = fixture(t);
  await runStage(state, { execute: async () => response() });
  const calls = [];
  await runStage(state, { execute: async (o) => { calls.push(o); return response('PASS', []); } });
  const a = state.attempts.find((x) => x.role === 'reviewer');
  assert.equal(a.context.mode, 'inline');
  assert.match(calls[0].prompt, /Previous results:/);
});

test('no attempt ever claims a native resume', async (t) => {
  const { state, store } = fixture(t);
  await runStage(state, { contextStore: store, execute: async () => response() });
  await runStage(state, { contextStore: store, execute: async () => response('PASS', []) });
  for (const a of state.attempts) assert.notEqual(a.context.mode, 'native_resume');
});

test('worker context identifies frozen review snapshot with explicit hash provenance', () => {
  const state = { results: {}, wave: { id: 'wave-fixture', roles: ['qa-engineer', 'security-officer'], receipt: { head: 'base', dirty: 'untracked-digest', files: { 'src/app.js': 'git-blob-id' } } } };
  const context = buildStageContext(state);
  assert.match(context.text, /wave-fixture/);
  assert.match(context.text, /untracked-digest/);
  assert.match(context.text, /Git blob object IDs, not raw SHA256/);
  assert.match(context.text, /Only roles listed in the frozen wave are parallel siblings/);
  assert.match(context.text, /queued roles are not running/);
});

test('verifier receives controller checks and snapshot separately from worker claims', async t => {
  const { state } = fixture(t);
  state.results.writer = { checks: { state: 'passed', inputDigest: 'tested-input', stdout: '44 passed' }, receipt: { head: 'base' } };
  state.attempts = [{ role: 'reviewer', checks: { state: 'passed', inputDigest: 'current-input' } }];
  state.wave = { id: 'frozen-wave', roles: ['reviewer', 'security-officer'], receipt: { dirty: 'snapshot-digest' } };
  let prompt;
  const result = await verifyStage(state, 'reviewer', { files: [], meta: {} }, async options => {
    prompt = options.prompt;
    return { state: 'ok', code: 0, errors: [], text: JSON.stringify({ state: 'verified', findings: [], checks: ['inspected fixture'],
      workflowAttestation: { state: 'supported', waveId: state.wave.id, roles: state.wave.roles, checks: ['checked workflow assertions'] } }) };
  });
  assert.equal(result.state, 'verified');
  for (const value of ['tested-input', 'current-input', '44 passed', 'frozen-wave', 'snapshot-digest']) assert.ok(prompt.includes(value));
  assert.match(prompt, /a sibling report need not exist/);
  assert.match(prompt, /Independently inspect/);
  assert.match(prompt, /must not use here-documents/);
});
