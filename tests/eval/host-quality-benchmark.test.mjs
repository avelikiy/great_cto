import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases } from './lib/host-quality-cases.mjs';
import { summarize, arms } from './lib/host-quality-report.mjs';
import { score } from './lib/host-quality-score.mjs';
import { responseFailure } from './lib/host-quality-protocol.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const result = (arm, passed, task = 'money') => ({ arm, task, repetition: 0, status: 'completed',
  final: { passed, total: 12 }, elapsedMs: 10 });
test('arms have equal calls and mixed changes only reviewer host', () => {
  assert.deepEqual(Object.values(arms).map(a => a.length), [3, 3, 3]);
  assert.deepEqual(arms.mixed, ['codex', 'claude-code', 'codex']);
});
test('no data is null, never zero improvement or zero cost', () => {
  const s = summarize([]);
  assert.equal(s.byArm.codex.checkPassRate, null);
  assert.equal(s.byArm.codex.costUsd, null);
  assert.equal(s.comparisons.codex.relativePercent, null);
});
test('paired deltas are task-level, not assertion pseudo-samples', () => {
  const s = summarize([result('codex', 11), result('claude', 12), result('mixed', 12)]);
  assert.equal(s.matchedBlocks, 1);
  assert.equal(s.comparisons.codex.deltaPercentagePoints, 100);
  assert.equal(s.comparisons.codex.relativePercent, null); // zero baseline
  assert.equal(s.comparisons.claude.relativePercent, 0);
});
test('a blocked host prevents matched code-quality comparison', () => {
  const s = summarize([result('codex', 12), result('claude', 12),
    { arm: 'mixed', task: 'money', repetition: 0, status: 'blocked' }]);
  assert.equal(s.matchedBlocks, 0);
  assert.equal(s.comparisons.codex.relativePercent, null);
  assert.equal(s.byArm.mixed.checkPassRate, null);
  assert.equal(s.byArm.mixed.workflowTaskPassRate, 0);
});
test('correct exact decimal implementation passes corpus', async () => {
  const r = await score('export function parseMinor(s) { if(typeof s!=="string" || !/^-?[0-9]+(?:\\.[0-9]{1,2})?$/.test(s)) return null; const negative=s.startsWith("-"); const [whole, fraction=""]= (negative?s.slice(1):s).split("."); const n=BigInt(whole)*100n+BigInt(fraction.padEnd(2,"0")); return (negative?-n:n).toString(); }', cases[0]);
  assert.equal(r.passed, r.total);
});
test('imports and infinite evaluation do not pass', async () => {
  assert.equal((await score('import fs from "node:fs"; export function parseMinor() {}', cases[0])).passed, 0);
  assert.equal((await score('while(true) {}', cases[0])).passed, 0);
});
test('wrong return values and input mutation fail acceptance', async () => {
  const r = await score('export function deduplicate(x) { if (Array.isArray(x)) { x.length=0; return []; } return null; }', cases[2]);
  assert.ok(r.passed < r.total);
  assert.equal(r.checks.find(c => c.id === 'first').passed, false);
});
test('retry corpus detects zero times overflowing exponential', async () => {
  const r = await score('export function retryDelay(a,b,c,r) { return Math.min(c,Math.max(b*2**a,r??0)); }', cases[1]);
  assert.equal(r.checks.find(c => c.id === 'zero-overflow').passed, false);
});
test('expired OAuth is a terminal benchmark blocker even if preflight passed', () => {
  assert.equal(responseFailure({ code: 1, state: 'unreadable', errors: ['Failed to authenticate: OAuth session expired and could not be refreshed'] }), 'host-authentication-failure');
  assert.equal(responseFailure({ code: 0, state: 'ok', errors: [] }), null);
  assert.equal(responseFailure({ code: 0, state: 'ok', errors: ['sandbox violation'] }), 'host-response-failure');
});
test('unfinished work is not recorded as a completed or blocked product', () => {
  const s = summarize([{ arm: 'mixed', task: 'money', repetition: 0, status: 'interrupted' }]);
  assert.equal(s.byArm.mixed.interrupted, 1);
  assert.equal(s.byArm.mixed.blocked, 0);
  assert.equal(s.byArm.mixed.completed, 0);
  assert.equal(s.comparisons.codex.relativePercent, null);
});
test('driver stops all further arms after real-call auth failure', () => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'host-quality-driver-')));
  try {
    const plugin = join(fixture, 'plugin');
    mkdirSync(join(plugin, 'scripts/lib'), { recursive: true });
    mkdirSync(join(plugin, '.claude-plugin'));
    writeFileSync(join(plugin, '.claude-plugin/plugin.json'), JSON.stringify({ version: 'test-fixture' }));
    const modules = {
      'codex-exec.mjs': `import { readFileSync } from 'node:fs'; import { join } from 'node:path'; import { createHash } from 'node:crypto';
        export const detectCodex = () => ({state:'available'});
        export const runCodexExec = async ({prompt,cwd}) => ({code:0,state:'ok',errors:[],finalText:JSON.stringify(
          prompt.includes('Review the current implementation') ? {verdict:'APPROVED',summary:'fixture',meta:{findings:[]},files:[]} :
          {verdict:'DONE',summary:'fixture',meta:{},files:[{path:'src/solution.mjs',before:createHash('sha256').update(readFileSync(join(cwd,'src/solution.mjs'))).digest('hex'),content:'export function parseMinor() { return null; }'}]})});`,
      'claude-exec.mjs': `export const detectClaude = () => ({state:'available'}); export const runClaudeExec = async () => ({code:1,state:'unreadable',errors:['Failed to authenticate: OAuth session expired and could not be refreshed']});`,
      'codex-pipeline.mjs': 'export const validateProposal = (state,proposal) => proposal.files.map(f => ({...f,after:"fixture-hash"}));',
      'codex-role-profiles.mjs': 'export const codexRoleProfile = role => role;',
    };
    for (const [name, source] of Object.entries(modules)) writeFileSync(join(plugin, 'scripts/lib', name), source);
    const output = spawnSync(process.execPath, [join(import.meta.dirname, 'host-quality-benchmark.mjs'), '--live', '--plugin-root', plugin, '--tasks', 'money'], {
      encoding: 'utf8', timeout: 30000, env: { ...process.env, GREAT_CTO_LIVE_BASE_DIR: join(fixture, 'durable') },
    });
    assert.equal(output.status, 2, output.stderr);
    assert.ok(output.stdout.includes('host-authentication-failure'));
    assert.ok(!output.stdout.includes('"arm":"mixed"'));
    assert.equal((output.stdout.match(/"status":"started"/g) || []).length, 4);
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});
