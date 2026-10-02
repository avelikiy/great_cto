import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { newRun, runStage } from '../../scripts/lib/codex-pipeline.mjs';
import { preregisterBenchmark, scenarios } from '../../scripts/lib/adaptive-benchmark-protocol.mjs';
import { benchmarkPolicySnapshot, bindBenchmarkTrial, collectBenchmarkObservation } from '../../scripts/lib/adaptive-benchmark-collector.mjs';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { beginWork } from '../../scripts/lib/work-tasks.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const roles = ['code-reviewer', 'qa-engineer', 'security-officer'];

async function fixture(t, { execute = true } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'benchmark-collector-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'worker'), outside = join(base, 'operator'), pluginRoot = join(base, 'plugin');
  mkdirSync(root); mkdirSync(outside, { mode: 0o700 }); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  const graph = roles.map((r, i) => `[transitions.${r}]\non=["PASS"]\nproduces=["report"]\nnext=${JSON.stringify(roles[i + 1] ? [roles[i + 1]] : [])}\n`).join('\n');
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), graph);
  writeFileSync(join(root, '.gitignore'), '.great_cto/\n');
  execFileSync('git', ['init', '-q', root]); execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  const state = newRun({ root, pluginRoot, entry: roles[0], allowed: ['docs'], prompt: scenarios[0].task });
  state.acceptance = scenarios[0].checks;
  const packageBytes = Buffer.from('adaptive package fixture, not a released artifact');
  const scorerBytes = Buffer.from('unit scorer fixture, not a representative hidden harness');
  const protocol = preregisterBenchmark({ artifacts: {
    legacy: { commit: 'a'.repeat(40), artifactSha256: sha('legacy fixture') },
    adaptive: { commit: 'b'.repeat(40), artifactSha256: sha(packageBytes) } },
    policies: { legacy: { ...benchmarkPolicySnapshot(state), maxAttempts: 2 }, adaptive: benchmarkPolicySnapshot(state) },
    hostModelPolicy: 'unit callbacks only, no model execution' });
  const registration = { version: 1, protocol, trial: { task: scenarios[0].id, repetition: 0, arm: 'adaptive' },
    requiredRoles: roles, scorer: { id: 'fixture-scorer', sha256: sha(scorerBytes) } };
  bindBenchmarkTrial(state, registration);
  const options = { registrationFile: join(outside, 'registration.json'), stateFile: join(outside, 'state.json'),
    artifactFile: join(outside, 'package.tgz'), scorerFile: join(outside, 'scorer.mjs'), scoreFile: join(outside, 'score.json') };
  const put = (file, value) => writeFileSync(file, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value), { mode: 0o600 });
  put(options.registrationFile, registration); put(options.artifactFile, packageBytes); put(options.scorerFile, scorerBytes);
  if (execute) for (const role of roles) await runStage(state, {
    execute: async () => ({ state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'PASS', summary: 'fixture only',
      meta: { report: `docs/${role}.md` }, files: [{ path: `docs/${role}.md`, before: null, content: 'fixture report' }] }) }),
    verify: async () => ({ state: 'verified', checks: ['fixture verification callback'], findings: [] }) });
  assert.equal(state.status, execute ? 'done' : 'ready');
  const report = { version: 1, source: 'operator-attestation', runId: state.id,
    registrationDigest: state.benchmarkBinding.registrationDigest, scorer: registration.scorer,
    receipt: treeReceipt(root), criteria: state.acceptance.map(text => ({ text, state: 'passed', evidence: 'synthetic unit score evidence' })) };
  const save = () => {
    put(options.stateFile, state); options.stateSha256 = sha(readFileSync(options.stateFile));
    report.stateSha256 = options.stateSha256; put(options.scoreFile, report); options.scoreSha256 = sha(readFileSync(options.scoreFile));
  };
  save(); return { root, state, registration, report, options, save, put };
}

test('actual fixture controller collects bound dispatches and explicit score, without provider or readiness claims', async t => {
  const f = await fixture(t), before = readFileSync(f.options.stateFile), row = collectBenchmarkObservation(f.options);
  assert.equal(row.status, 'completed'); assert.equal(row.accepted, true);
  assert.equal(row.workerCalls, 3); assert.equal(row.verifierCalls, 3);
  assert.ok(row.activeMs >= 0);
  for (const field of ['humanPauses', 'actionableFindings', 'escapedDefects', 'actualCostUsd']) assert.equal(row[field], null);
  assert.equal(row.evidence.benchmarkEligible, false);
  assert.equal(row.evidence.graphFloorCoverageVerified, false);
  assert.equal(row.evidence.executionArtifactProvenanceVerified, false);
  assert.deepEqual(readFileSync(f.options.stateFile), before);
  assert.ok(!JSON.stringify(row).includes(scenarios[0].task), 'does not expose prompt or score criterion payload');
});

test('independently assessed acceptance failure is completed false, not a failed launch', async t => {
  const f = await fixture(t); f.report.criteria[0].state = 'failed'; f.save();
  assert.equal(collectBenchmarkObservation(f.options).accepted, false);
  assert.equal(collectBenchmarkObservation(f.options).status, 'completed');
});

for (const status of ['done', 'awaiting-gate', 'blocked', 'cancelled']) {
  test(`${status} without a score remains unassessed/blocked/failed with acceptance null`, async t => {
    const f = await fixture(t); f.state.status = status; f.save();
    const row = collectBenchmarkObservation({ ...f.options, scoreFile: null, scoreSha256: null });
    assert.equal(row.accepted, null);
    assert.equal(row.status, status === 'blocked' ? 'blocked' : status === 'cancelled' ? 'failed' : 'unassessed');
  });
}

test('missing legacy/incomplete telemetry never supplies invented call counts', async t => {
  const f = await fixture(t); f.state.dispatchEvidence.completeHistory = false; f.save();
  const row = collectBenchmarkObservation({ ...f.options, scoreFile: null, scoreSha256: null });
  assert.equal(row.workerCalls, null); assert.equal(row.activeMs, null);
});

test('binding cannot be retrofitted, replayed or shifted to another registered task', async t => {
  const f = await fixture(t);
  assert.throws(() => bindBenchmarkTrial(f.state, f.registration), /fresh/);
  delete f.state.benchmarkBinding; f.save();
  assert.throws(() => collectBenchmarkObservation(f.options), /binding/);
});

test('fresh binding requires exact task, criteria, policy, mandatory floors and no release authority', async t => {
  for (const mutation of [f => { f.state.prompt = 'different'; }, f => { f.state.acceptance = []; },
    f => { f.state.maxAttempts = 2; }, f => { f.registration.requiredRoles = ['qa-engineer']; },
    f => { f.state.releasePolicy = {}; }, f => { f.state.steps = 1; },
    f => { f.state.dispatchEvidence.records.push({ outcome: 'intent' }); }]) {
    const f = await fixture(t, { execute: false }); delete f.state.benchmarkBinding;
    mutation(f); assert.throws(() => bindBenchmarkTrial(f.state, f.registration));
  }
});

test('edited task/acceptance/policy, registration or package pin is rejected', async t => {
  for (const mutation of [f => { f.state.prompt += ' altered'; }, f => { f.state.acceptance = ['altered']; },
    f => { f.state.maxAttempts = 2; }, f => { f.registration.scorer.id = 'changed'; f.put(f.options.registrationFile, f.registration); },
    f => { f.put(f.options.artifactFile, 'changed package'); }, f => { f.put(f.options.scorerFile, 'changed scorer'); }]) {
    const f = await fixture(t); mutation(f); f.save(); assert.throws(() => collectBenchmarkObservation(f.options));
  }
});

test('state and score bytes must match exact outside pins', async t => {
  const f = await fixture(t);
  f.put(f.options.stateFile, JSON.stringify(f.state) + '\n');
  assert.throws(() => collectBenchmarkObservation(f.options), /state byte pin/);
  f.save(); f.put(f.options.scoreFile, JSON.stringify(f.report) + '\n');
  assert.throws(() => collectBenchmarkObservation(f.options), /score byte pin/);
});

test('score cannot change run identity, source, receipt, scorer or ordered criteria', async t => {
  for (const mutation of [r => { r.runId = 'other'; }, r => { r.registrationDigest = 'other'; },
    r => { r.source = 'worker-self-score'; }, r => { r.receipt = null; }, r => { r.scorer.id = 'other'; },
    r => { r.criteria.reverse(); }, r => { r.criteria[0].evidence = ''; }, r => { r.criteria[0].state = 'unknown'; }]) {
    const f = await fixture(t); mutation(f.report); f.save();
    assert.throws(() => collectBenchmarkObservation(f.options), /report identity\/criteria/);
  }
});

test('current tree drift and stale approval invalidate assessed completion', async t => {
  const f = await fixture(t); writeFileSync(join(f.root, 'unexpected.txt'), 'drift');
  assert.throws(() => collectBenchmarkObservation(f.options), /receipt/);
  const g = await fixture(t); g.state.approvals.push({ role: roles[0], result: 'not-current-result' }); g.save();
  assert.throws(() => collectBenchmarkObservation(g.options), /stale result/);
});

test('unfinished controller, missing mandatory verification and omitted selected reviewer refuse completion', async t => {
  for (const mutation of [s => { s.pending = {}; }, s => { s.active = 'running'; },
    s => { delete s.results['security-officer']; }, s => { s.results['security-officer'].verification.state = 'rework'; },
    s => { s.specialistReview = { roles: ['pci-reviewer'] }; }]) {
    const f = await fixture(t); mutation(f.state); f.save(); assert.throws(() => collectBenchmarkObservation(f.options));
  }
});

test('inside-project, symlink, public and oversized evidence files are refused', async t => {
  const f = await fixture(t); chmodSync(f.options.stateFile, 0o644);
  assert.throws(() => collectBenchmarkObservation(f.options), /unsafe/); chmodSync(f.options.stateFile, 0o600);
  const link = join(f.root, 'state-link.json'); symlinkSync(f.options.stateFile, link);
  assert.throws(() => collectBenchmarkObservation({ ...f.options, stateFile: link }), /unsafe/);
  rmSync(link);
  const inside = join(f.root, 'registration.json'); f.put(inside, f.registration);
  assert.throws(() => collectBenchmarkObservation({ ...f.options, registrationFile: inside }), /external/);
  rmSync(inside);
  f.put(f.options.scoreFile, 'x'.repeat(65537));
  assert.throws(() => collectBenchmarkObservation(f.options), /bounded/);
});

test('actual collector CLI emits a read-only observation and rejects unknown/repeated arguments', async t => {
  const f = await fixture(t), cli = fileURLToPath(new URL('../../scripts/adaptive-benchmark-collect.mjs', import.meta.url));
  const flags = { registrationFile: '--registration', stateFile: '--state', stateSha256: '--state-sha256', artifactFile: '--artifact',
    scorerFile: '--scorer', scoreFile: '--score', scoreSha256: '--score-sha256' };
  const args = Object.entries(f.options).flatMap(([key, value]) => [flags[key], value]);
  const row = JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 }));
  assert.equal(row.workerCalls, 3); assert.equal(row.evidence.benchmarkEligible, false);
  for (const extra of [['--unknown', 'x'], ['--state', f.options.stateFile]]) {
    assert.throws(() => execFileSync(process.execPath, [cli, ...args, ...extra], { stdio: 'pipe' }));
  }
});

test('actual controller CLI saves trial binding before an intentionally failed non-model executable', async t => {
  const f = await fixture(t, { execute: false });
  const state = newRun({ root: f.root, prompt: scenarios[0].task, allowed: ['docs'], entry: 'senior-dev' });
  state.acceptance = scenarios[0].checks;
  const protocol = preregisterBenchmark({ artifacts: f.registration.protocol.artifacts,
    policies: { legacy: { ...benchmarkPolicySnapshot(state), maxAttempts: 2 }, adaptive: benchmarkPolicySnapshot(state) },
    hostModelPolicy: 'fixture only: false executable, no models' });
  const registration = { ...f.registration, protocol }; f.put(f.options.registrationFile, registration);
  const tasks = join(f.root, '..', 'operator', 'tasks'), runs = join(f.root, '..', 'operator', 'runs');
  const work = beginWork({ root: f.root, host: 'codex', goal: state.prompt, acceptance: state.acceptance,
    authority: { mode: 'explicit-paths', writeScope: ['docs'] } }, { store: tasks });
  work.lease.release();
  const cli = fileURLToPath(new URL('../../scripts/codex-pipeline.mjs', import.meta.url));
  const env = { ...process.env, GREAT_CTO_TASKS_DIR: tasks, GREAT_CTO_CODEX_RUNS_DIR: runs,
    GREAT_CTO_CODEX_BIN: '/usr/bin/false' };
  delete env.GREAT_CTO_AGENT_BUDGET_FILE; delete env.GREAT_CTO_AGENT_BUDGET_STORE;
  let launchFailure;
  assert.throws(() => execFileSync(process.execPath, [cli, 'start', '--dir', f.root, '--entry', 'senior-dev',
    '--prompt', state.prompt, '--allow', 'docs', '--task-id', work.task.taskId,
    '--benchmark-trial', f.options.registrationFile], { env, stdio: 'pipe', timeout: 15000 }), error => {
      launchFailure = error; return true;
    });
  const files = readdirSync(runs).filter(name => name.endsWith('.json')); assert.equal(files.length, 1);
  const saved = JSON.parse(readFileSync(join(runs, files[0]), 'utf8'));
  assert.equal(saved.status, 'blocked', String(launchFailure.stderr || launchFailure.message).slice(0, 2000));
  assert.equal(saved.benchmarkBinding.task, scenarios[0].id);
  assert.equal(saved.approvals.length, 0); assert.equal(saved.attempts.length, 1);
  assert.equal(saved.dispatchEvidence.records.length, 1);
  assert.equal(saved.dispatchEvidence.records[0].kind, 'worker');
});

test('malformed private JSON errors never echo the input payload', async t => {
  const f = await fixture(t), marker = 'private fixture payload must not appear in diagnostic';
  f.put(f.options.scoreFile, marker); f.options.scoreSha256 = sha(marker);
  assert.throws(() => collectBenchmarkObservation(f.options), error => {
    assert.equal(error.message, 'invalid benchmark score JSON'); assert.ok(!error.message.includes(marker)); return true;
  });
  f.put(f.options.stateFile, marker); f.options.stateSha256 = sha(marker);
  assert.throws(() => collectBenchmarkObservation(f.options), /invalid benchmark state JSON/);
});

test('policy pin includes admission configuration but not the growing stand-down audit', async t => {
  const f = await fixture(t, { execute: false });
  f.state.gatePolicy = { mode: 'adaptive', level: 'auto', archetype: 'web-service', base: 'fixture-base', skipped: [] };
  const initial = benchmarkPolicySnapshot(f.state);
  f.state.gatePolicy.skipped.push('gate:arch');
  assert.deepEqual(benchmarkPolicySnapshot(f.state), initial);
  f.state.gatePolicy.level = 'strict'; assert.notDeepEqual(benchmarkPolicySnapshot(f.state), initial);
  f.state.gatePolicy.level = 'auto';
  f.state.executionBudget = { limits: { maxConcurrent: 2, maxDepth: 1, maxCallsPerRun: 24 },
    store: 'fixture-store', policyDigest: 'fixture-policy', runKey: 'fixture-run' };
  assert.notDeepEqual(benchmarkPolicySnapshot(f.state), initial);
});
