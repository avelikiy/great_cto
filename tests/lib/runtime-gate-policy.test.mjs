import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessChange, pinChangeBase, runtimeGatePolicy, nativeRuntimePolicy } from '../../scripts/lib/runtime-gate-policy.mjs';
import { newRun, advance } from '../../scripts/lib/codex-pipeline.mjs';
import { recordStandDown } from '../../scripts/lib/stand-down.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-gates-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'project'); mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(root, 'README.md'), 'initial'); git('add', '.'); git('commit', '-qm', 'initial');
  const base = pinChangeBase(root, 'HEAD');
  const put = (name, content = 'change') => { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), content); };
  const options = { root, base, level: 'gates-only', archetype: 'web-service' };
  return { dir, root, base, put, git, options };
}

test('opt-in T0 and T1 remove only architecture pause, retaining product/import/ship', t => {
  const f = fixture(t); f.put('README.md');
  let p = runtimeGatePolicy(f.options);
  assert.equal(p.assessment.tier, 'T0'); assert.deepEqual(p.removed, ['arch']);
  assert.deepEqual(p.activeGates, ['product', 'import', 'ship']);
  f.put('src/util.js'); p = runtimeGatePolicy(f.options);
  assert.equal(p.assessment.tier, 'T1'); assert.deepEqual(p.removed, ['arch']);
  assert.equal(nativeRuntimePolicy({ ...f.options, env: {} }), null);
  const native = { ...f.options, env: { GREAT_CTO_ADAPTIVE_GATES: '1', GREAT_CTO_CHANGE_BASE: f.base } };
  assert.ok(nativeRuntimePolicy(native).activeGates.includes('arch'));
  assert.deepEqual(nativeRuntimePolicy({ ...native, record: r => recordStandDown(f.root, r) }).activeGates, p.activeGates);
  assert.deepEqual(nativeRuntimePolicy(native).activeGates, p.activeGates);
  f.put('src/util.js', 'different bytes'); assert.ok(nativeRuntimePolicy(native).activeGates.includes('arch'));
  assert.ok(nativeRuntimePolicy({ ...native, record: () => ({ recorded: false }) }).activeGates.includes('arch'));
});

test('unknown evidence fails closed and branch names are not accepted as runtime pins', t => {
  const f = fixture(t);
  assert.equal(runtimeGatePolicy(f.options).activeGates, null);
  f.put('README.md');
  for (const base of [null, 'HEAD', '0'.repeat(40), '--help']) assert.equal(assessChange(f.root, base).known, false);
  assert.throws(() => pinChangeBase(f.root, '--help'));
});

test('sensitive paths, policy prompts, locks and untracked files force hard floor even at auto', t => {
  for (const path of ['src/auth/login.js', 'db/migrations/001.sql', 'src/payments/send.js', 'agents/security.md', 'scripts/codex-pipeline.mjs', '.github/workflows/ci.yml', 'package-lock.json']) {
    const f = fixture(t); f.put(path);
    const p = runtimeGatePolicy({ ...f.options, level: 'auto', labels: ['tier:t0'], changedFiles: ['README.md'] });
    assert.equal(p.assessment.tier, 'T2', path);
    for (const gate of ['security', 'compliance', 'ship', 'import']) assert.ok(p.activeGates.includes(gate), gate);
  }
});

test('strict/expert policies and regulated floors survive low-risk diffs', t => {
  const f = fixture(t); f.put('README.md');
  for (const level of ['strict', 'expert', 'step-by-step']) {
    const p = runtimeGatePolicy({ ...f.options, level }); assert.deepEqual(p.removed, []); assert.ok(p.activeGates.includes('arch'));
  }
  const p = runtimeGatePolicy({ ...f.options, archetype: 'fintech' });
  for (const gate of ['security', 'compliance', 'ship', 'import']) assert.ok(p.activeGates.includes(gate));
  assert.ok(runtimeGatePolicy({ ...f.options, level: 'auto' }).activeGates.includes('ship'));
});

test('historical import paths retain T2 floors in shared and native policy',t=>{
 for(const path of ['src/import/history.mjs','src/imports/run.ts','src/importer.ts','jobs/backfill.js','src/data-import.ts','src/etl/batch.py']){
  const f=fixture(t);f.put(path);
  for(const level of ['gates-only','auto']){
   const p=runtimeGatePolicy({...f.options,level});assert.equal(p.assessment.tier,'T2',path);assert.deepEqual(p.removed,[]);
   for(const gate of ['security','compliance','ship','import',...(level==='gates-only'?['arch']:[])])assert.ok(p.activeGates.includes(gate),path+':'+gate);
  }
  const p=nativeRuntimePolicy({...f.options,env:{GREAT_CTO_ADAPTIVE_GATES:'1',GREAT_CTO_CHANGE_BASE:f.base},
   record:()=>{throw Error('must not record stand-down for import');}});
  assert.equal(p.assessment.tier,'T2');assert.deepEqual(p.removed,[]);
 }
 const f=fixture(t);f.put('src/import-map-helper.ts');assert.equal(assessChange(f.root,f.base).tier,'T1');
});

test('tracked staged/unstaged union, rename source and bulk changes are observed', t => {
  const f = fixture(t); f.put('src/payments/send.js'); f.git('add', '.'); f.git('commit', '-qm', 'sensitive');
  f.git('mv', 'src/payments/send.js', 'README-renamed.md');
  assert.equal(assessChange(f.root, f.base).tier, 'T0'); // source did not exist at pinned base
  const newBase = pinChangeBase(f.root, 'HEAD');
  assert.equal(assessChange(f.root, newBase).tier, 'T2'); // deletion/rename source is included
  for (let i = 0; i < 10; i++) f.put(`src/util${i}.js`);
  assert.equal(assessChange(f.root, f.base).tier, 'T2');
});

function controlled(f, gatePolicy) {
  const pluginRoot = join(f.dir, 'plugin'); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), '[transitions.architect]\non=["DONE"]\ngate="gate:arch"\nnext=["senior-dev"]\n[transitions.senior-dev]\non=["DONE"]\ngate="gate:ship"\nnext=[]\n[transitions.security-officer]\non=["DONE"]\ngate=["gate:security", "gate:compliance"]\nnext=[]');
  return newRun({ root: f.root, pluginRoot, prompt: 'fixture', allowed: ['docs'], entry: 'architect', gatePolicy });
}

test('Codex legacy enforces all gates; adaptive mode skips arch but still stops at ship', t => {
  const f = fixture(t); f.put('README.md');
  const s = controlled(f, null); s.queue = []; s.results.architect = { verdict: 'DONE', digest: 'a', receipt: treeReceipt(f.root) }; advance(s);
  assert.deepEqual(s.pending.gates, ['gate:arch']);
  s.pending = null; s.released = []; s.gatePolicy = { mode: 'adaptive', ...f.options, skipped: [] }; advance(s);
  assert.equal(s.status, 'ready'); assert.deepEqual(s.queue, ['senior-dev']);
  s.queue = []; s.results['senior-dev'] = { verdict: 'DONE', digest: 'b', receipt: treeReceipt(f.root) }; advance(s);
  assert.deepEqual(s.pending.gates, ['gate:ship']);
});

test('Codex blocks escalation after bypass and rejects invalid opt-in configuration', t => {
  const f = fixture(t); f.put('README.md');
  const s = controlled(f, { mode: 'adaptive', level: 'gates-only', archetype: 'web-service', base: f.base });
  s.queue = []; s.results.architect = { verdict: 'DONE', digest: 'a', receipt: treeReceipt(f.root) }; advance(s);
  f.put('src/auth/login.js'); advance(s);
  assert.equal(s.status, 'blocked'); assert.match(s.reason, /risk escalated/);
  assert.throws(() => newRun({ root: f.root, pluginRoot: s.pluginRoot, prompt: 'x', allowed: ['docs'], entry: 'architect', gatePolicy: { mode: 'adaptive', level: 'typo', base: f.base, archetype: 'web-service' } }), /invalid adaptive/);
  assert.throws(() => newRun({ root: f.root, pluginRoot: s.pluginRoot, prompt: 'x', allowed: ['docs'], entry: 'architect', gatePolicy: { mode: 'adaptive', level: 'ship-only', base: f.base, archetype: 'web-service' } }), /mandatory.*briefing/);
});

test('Codex blocks when historical import appears after a low-risk stand-down',t=>{
 const f=fixture(t);f.put('README.md');
 const s=controlled(f,{mode:'adaptive',level:'gates-only',archetype:'data-platform',base:f.base});
 s.queue=[];s.results.architect={verdict:'DONE',digest:'a',receipt:treeReceipt(f.root)};advance(s);
 assert.equal(s.status,'ready');assert.deepEqual(s.gatePolicy.skipped,['gate:arch']);
 f.put('src/import/history.mjs');advance(s);assert.equal(s.status,'blocked');assert.match(s.reason,/risk escalated/);
});

test('custom gates cannot vanish and graphs without the high-risk floor cannot advance', t => {
  const f = fixture(t); f.put('README.md');
  const s = controlled(f, { mode: 'adaptive', level: 'gates-only', archetype: 'web-service', base: f.base });
  s.graph.architect.gate = 'gate:custom-authorization'; s.queue = []; s.results.architect = { verdict: 'DONE', digest: 'a', receipt: treeReceipt(f.root) };
  advance(s); assert.deepEqual(s.pending.gates, ['gate:custom-authorization']);
  s.pending = null; f.put('src/auth/login.js'); delete s.graph['security-officer'];
  advance(s); assert.equal(s.status, 'blocked'); assert.match(s.reason, /high-risk gate floor/);
});

test('a disconnected floor declaration is not approval of a high-risk terminal run', t => {
  const f = fixture(t); f.put('src/auth/login.js');
  const s = controlled(f, { mode: 'adaptive', level: 'gates-only', archetype: 'web-service', base: f.base });
  s.queue = []; s.graph.architect.gate = []; s.graph.architect.next = [];
  s.results.architect = { verdict: 'DONE', digest: 'a', receipt: treeReceipt(f.root) }; advance(s);
  assert.equal(s.status, 'blocked'); assert.match(s.reason, /without approved/);
});

test('native hook integration records architecture stand-down but cannot bypass verifier', t => {
  const f = fixture(t); f.put('.gitignore', '.great_cto/\nshared/\n'); f.git('add', '.'); f.git('commit', '-qm', 'ignore controller fixtures');
  const base = pinChangeBase(f.root, 'HEAD');
  const now = new Date().toISOString();
  f.put('.great_cto/PROJECT.md', 'approval-level: gates-only\narchetype: web-service\n');
  f.put('.great_cto/verdicts/architect.log', `${now} | architect | APPROVED | arch=docs/ARCH.md feature=x | cost=$0.10\n`);
  f.put('docs/ARCH.md', '# Architecture\n' + 'A small reversible change with independent validation and retained human release authority.\n'.repeat(5));
  const hook = fileURLToPath(new URL('../../scripts/hooks/pipeline-dispatcher.mjs', import.meta.url));
  const invoke = () => spawnSync(process.execPath, [hook], { cwd: f.root, encoding: 'utf8', env: { ...process.env, GREAT_CTO_DISABLE_DISPATCHER: '', GREAT_CTO_ADAPTIVE_GATES: '1', GREAT_CTO_CHANGE_BASE: base }, input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'great_cto-architect' } }) });
  const unchecked = invoke(); assert.equal(unchecked.status, 0); assert.match(unchecked.stdout, /VERIFY|verif/i);
  f.put('.great_cto/scores.jsonl', JSON.stringify({ v: 1, ts: now, agent: 'architect', name: 'independent-verify', state: 'verified', value: 1, scorer: 'mechanical', run_ts: now }) + '\n');
  const verified = invoke(); assert.equal(verified.status, 0); assert.match(verified.stdout, /removed=arch/); assert.match(verified.stdout, /PIPELINE-NEXT/);
  f.put('shared/pipeline.toml', readFileSync(fileURLToPath(new URL('../../shared/pipeline.toml', import.meta.url)), 'utf8'));
  const view = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/lib/pipeline-position.mjs', import.meta.url)), '--json'], { cwd: f.root, encoding: 'utf8', env: { ...process.env, GREAT_CTO_ADAPTIVE_GATES: '1', GREAT_CTO_CHANGE_BASE: base } });
  assert.equal(view.status, 0, view.stderr); assert.equal(JSON.parse(view.stdout).adaptive.audit, 'recorded');
});
