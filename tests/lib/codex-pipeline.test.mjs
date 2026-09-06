import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRun, runStage as stage, approve, safePath, validateProposal, verifyStage } from '../../scripts/lib/codex-pipeline.mjs';
const runStage = (state, options = {}) => stage(state, { verify: async () => ({ state: 'verified', findings: [], checks: ['test fixture'] }), ...options });

function fixture(t, graph = '[transitions.writer]\non = ["DONE"]\nproduces = ["report"]\ngate = "gate:code"\nnext = ["reviewer"]\n[transitions.reviewer]\non = ["PASS"]\ngate = "gate:ship"\nnext = []') {
  const root = mkdtempSync(join(tmpdir(), 'codex-host-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pluginRoot = join(root, 'plugin');
  mkdirSync(join(pluginRoot, 'shared'), { recursive: true }); mkdirSync(join(pluginRoot, 'agents'));
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), graph);
  for (const role of ['writer', 'reviewer', 'qa', 'security']) writeFileSync(join(pluginRoot, `agents/${role}.md`), `You are ${role}.`);
  return newRun({ root, pluginRoot, prompt: 'Build a fixture', allowed: ['src', 'docs'], entry: 'writer' });
}
const response = (verdict = 'DONE', files = [{ path: 'src/app.js', before: null, content: 'export const x = 1;\n' }]) =>
  ({ state: 'ok', code: 0, errors: [], text: JSON.stringify({ verdict, summary: 'fixture', meta: { report: 'src/app.js' }, files }), usage: null });

test('role -> guarded write -> human gate -> resume -> terminal gate -> done', async t => {
  const s = fixture(t); const calls = [];
  await runStage(s, { execute: async opts => { calls.push(opts); return response(); } });
  assert.equal(s.status, 'awaiting-gate'); assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /You are writer/);
  assert.equal(calls[0].sandbox, 'read-only'); assert.ok(calls[0].extraArgs.includes('--ignore-user-config'));
  assert.ok(calls[0].extraArgs.includes('plugins')); assert.ok(calls[0].extraArgs.includes('apps'));
  assert.equal(readFileSync(join(s.root, 'src/app.js'), 'utf8'), 'export const x = 1;\n');
  await runStage(s, { execute: async () => { throw Error('must not run across gate'); } });
  assert.throws(() => approve(s, 'wrong'), /token/);
  const oldToken = s.pending.token; approve(s, oldToken);
  await runStage(s, { execute: async opts => { assert.match(opts.prompt, /You are reviewer/); return response('PASS', []); } });
  assert.equal(s.status, 'awaiting-gate'); assert.deepEqual(s.pending.gates, ['gate:ship']);
  assert.throws(() => approve(s, oldToken), /token/);
  approve(s, s.pending.token); assert.equal(s.status, 'done');
});

test('secret in any proposed file prevents ALL writes', async t => {
  const s = fixture(t);
  const files = [{ path: 'src/ok.js', before: null, content: 'okay' }, { path: 'src/secret.js', before: null, content: 'AKIA' + 'A'.repeat(16) }];
  await runStage(s, { execute: async () => response('DONE', files) });
  assert.equal(s.status, 'blocked'); assert.match(s.reason, /secret blocked/);
  assert.equal(existsSync(join(s.root, 'src/ok.js')), false);
  assert.doesNotMatch(s.reason, /AKIA/);
});

test('reject path escapes, protected files, symlinks and changes outside ownership', t => {
  const s = fixture(t);
  for (const path of ['../outside', '/tmp/outside', 'docs/../outside', 'docs/AGENTS.md', '.great_cto/gate.json', '.codex/config.toml', 'other/file', 'src/.env', 'src\\escape']) {
    assert.throws(() => safePath(s.root, path, s.allowed));
  }
  mkdirSync(join(s.root, 'src')); symlinkSync(tmpdir(), join(s.root, 'src/link'));
  assert.throws(() => safePath(s.root, 'src/link/escape', s.allowed), /symlink/);
  symlinkSync(join(tmpdir(), 'nonexistent-codex-target'), join(s.root, 'src/dangling'));
  assert.throws(() => safePath(s.root, 'src/dangling', s.allowed), /symlink/);
});

test('semantic verification failure prevents gate approval and downstream dispatch', async t => {
  const s = fixture(t);
  await runStage(s, { execute: async () => response(), verify: async () => ({ state: 'rework', findings: ['wrong implementation'] }) });
  assert.equal(s.status, 'blocked'); assert.equal(s.pending, null); assert.equal(s.results.writer, undefined);
  assert.match(s.reason, /wrong implementation/);
});

test('verifier runs separately with actual file paths and refuses empty evidence', async t => {
  const s = fixture(t); const proposal = JSON.parse(response().text);
  const result = await verifyStage(s, 'writer', proposal, async opts => {
    assert.match(opts.prompt, /ACTUAL files/); assert.equal(opts.sandbox, 'read-only');
    assert.doesNotMatch(opts.prompt, /export const x/);
    return { ...response(), text: JSON.stringify({ state: 'verified', checks: ['read src/app.js'], findings: [] }) };
  });
  assert.equal(result.state, 'verified');
  await assert.rejects(verifyStage(s, 'writer', proposal, async () => ({ ...response(), text: '{"state":"verified","checks":[],"findings":[]}' })), /empty/);
});

test('stale replacement and duplicate paths rejected', t => {
  const s = fixture(t); mkdirSync(join(s.root, 'src')); writeFileSync(join(s.root, 'src/app.js'), 'user edit');
  assert.throws(() => validateProposal(s, JSON.parse(response().text)), /stale/);
  const proposal = JSON.parse(response().text); proposal.files = [{ path: 'docs/new', content: 'x', before: null }, { path: 'docs/new', content: 'y', before: null }];
  assert.throws(() => validateProposal(s, proposal), /duplicate/);
});

test('approval refuses artifact drift', async t => {
  const s = fixture(t); await runStage(s, { execute: async () => response() });
  writeFileSync(join(s.root, 'src/app.js'), 'changed after review');
  assert.throws(() => approve(s, s.pending.token), /changed since gate/);
});

test('process failure, malformed output, missing evidence and degraded host all block', async t => {
  for (const result of [{ ...response(), code: 1 }, { ...response(), text: 'not JSON' }, response('DONE', []), { ...response(), errors: ['skills truncated'] }]) {
    const s = fixture(t); await runStage(s, { execute: async () => result });
    assert.equal(s.status, 'blocked'); assert.equal(s.results.writer, undefined);
  }
});

test('persist in-flight marker BEFORE launching; refuse replay after interruption', async t => {
  const s = fixture(t); const saved = [];
  await runStage(s, { save: x => saved.push(JSON.parse(JSON.stringify(x))), execute: async () => { assert.equal(saved[0].active, 'writer'); throw Error('interrupted'); } });
  assert.equal(s.active, 'writer');
  await assert.rejects(runStage(s), /interrupted stage/);
});

test('join waits for both branches; duplicate downstream dispatch is suppressed', async t => {
  const s = fixture(t, '[transitions.writer]\non=["DONE"]\nnext=["qa","security"]\n[transitions.qa]\non=["PASS"]\njoin=["security"]\nnext=["reviewer"]\n[transitions.security]\non=["PASS"]\njoin=["qa"]\nnext=["reviewer"]\n[transitions.reviewer]\non=["PASS"]\nnext=[]');
  await runStage(s, { execute: async () => response('DONE', []) });
  await runStage(s, { execute: async () => response('PASS', []) });
  assert.deepEqual(s.queue, ['security']);
  await runStage(s, { execute: async () => response('PASS', []) });
  assert.deepEqual(s.queue, ['reviewer']);
  await runStage(s, { execute: async () => response('PASS', []) });
  assert.equal(s.status, 'done');
});
