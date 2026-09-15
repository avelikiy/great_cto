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
import { newRun, runStage as stage, approve, buildStageContext, CONTEXT_BUDGET_BYTES } from '../../scripts/lib/codex-pipeline.mjs';

const runStage = (state, options = {}) => stage(state, { verify: async () => ({ state: 'verified', findings: [], checks: ['test fixture'] }), ...options });
const sha = (t) => createHash('sha256').update(t).digest('hex');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'codex-context-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginRoot = join(root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'),
    '[transitions.writer]\non = ["DONE"]\nproduces = ["report"]\nnext = ["reviewer"]\n[transitions.reviewer]\non = ["PASS"]\nnext = []');
  for (const role of ['writer', 'reviewer']) writeFileSync(join(pluginRoot, `agents/${role}.md`), `You are ${role}.`);
  const store = join(root, 'store');
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
