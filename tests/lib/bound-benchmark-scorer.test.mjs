import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { docsBenchmarkFixture } from '../../scripts/lib/docs-benchmark-fixture.mjs';
import { newRun, runStage } from '../../scripts/lib/codex-pipeline.mjs';
import { preregisterBenchmark, scenarios } from '../../scripts/lib/adaptive-benchmark-protocol.mjs';
import { benchmarkPolicySnapshot, bindBenchmarkTrial, collectBenchmarkObservation } from '../../scripts/lib/adaptive-benchmark-collector.mjs';
import { runBoundBenchmarkScorer } from '../../scripts/lib/bound-benchmark-scorer.mjs';
import { signScorerPayload } from '../../scripts/lib/benchmark-scorer-signature.mjs';
import { commitFixture } from '../helpers/committed-fixture.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const source = readFileSync(new URL('../../scripts/benchmark-scorers/docs-low-risk.mjs', import.meta.url));

async function fixture(t, { repair = true, mutateDuring = null, marker = false, execute = true } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'bound-docs-scorer-'))), root = join(base, 'candidate'), operator = join(base, 'operator'), pluginRoot = join(base, 'plugin');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(root); mkdirSync(operator, { mode: 0o700 }); mkdirSync(join(pluginRoot, 'shared'), { recursive: true });
  const recipe = docsBenchmarkFixture();
  const put = (name, bytes) => { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), bytes); };
  for (const [name, text] of Object.entries(recipe.files)) put(name, text); commitFixture(root);
  if (repair) put('docs/README.md', recipe.files['docs/README.md'].replace('guides/getting-started.md', 'guides/quickstart.md').replace('reference/old-api.md', 'reference/api.md'));
  const roles = ['code-reviewer', 'qa-engineer', 'security-officer'];
  writeFileSync(join(pluginRoot, 'shared/pipeline.toml'), roles.map((r, i) => `[transitions.${r}]\non=["PASS"]\nproduces=["report"]\nnext=${JSON.stringify(roles[i + 1] ? [roles[i + 1]] : [])}`).join('\n'));
  const options = Object.fromEntries(['registrationFile', 'stateFile', 'artifactFile', 'scorerFile', 'oracleFile', 'privateKeyFile'].map(name => [name, join(operator, name)]));
  const keys = generateKeyPairSync('ed25519'), der = keys.publicKey.export({ format: 'der', type: 'spki' });
  const privateBytes = keys.privateKey.export({ format: 'pem', type: 'pkcs8' });
  const invoked = join(operator, 'invoked');
  let code = source;
  if (marker) code = Buffer.from(`import {appendFileSync as witness} from 'node:fs'; witness(${JSON.stringify(invoked)}, 'invoked');\n${source}`);
  if (mutateDuring) code = Buffer.from(`import {writeFileSync as mutate} from 'node:fs'; mutate(${JSON.stringify(options[mutateDuring])}, 'mutated fixture');\n${source}`);
  const save = (file, bytes) => writeFileSync(file, typeof bytes === 'object' && !Buffer.isBuffer(bytes) ? JSON.stringify(bytes) : bytes, { mode: 0o600 });
  save(options.oracleFile, recipe.oracle); save(options.scorerFile, code); save(options.privateKeyFile, privateBytes);
  save(options.artifactFile, 'fixture package bytes, NOT running package provenance');
  const state = newRun({ root, pluginRoot, entry: roles[0], prompt: scenarios[0].task, allowed: ['docs'] }); state.acceptance = scenarios[0].checks;
  const protocol = preregisterBenchmark({ artifacts: { legacy: { commit: 'a'.repeat(40), artifactSha256: sha('legacy fixture') },
    adaptive: { commit: 'b'.repeat(40), artifactSha256: sha(readFileSync(options.artifactFile)) } },
    policies: { legacy: { ...benchmarkPolicySnapshot(state), maxAttempts: 2 }, adaptive: benchmarkPolicySnapshot(state) }, hostModelPolicy: 'callbacks, not providers' });
  const registration = { version: 1, protocol, trial: { task: scenarios[0].id, repetition: 0, arm: 'adaptive' }, requiredRoles: roles,
    scorer: { id: 'actual-docs-scorer', sha256: sha(code), oracleSha256: sha(readFileSync(options.oracleFile)),
      authority: { algorithm: 'ed25519', publicKeySpki: der.toString('base64'), publicKeySha256: sha(der) } } };
  bindBenchmarkTrial(state, registration); save(options.registrationFile, registration);
  if (execute) for (const role of roles) await runStage(state, { execute: async () => ({ state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'PASS', summary: 'fixture report',
    meta: { report: `docs/${role}.md` }, files: [{ path: `docs/${role}.md`, before: null, content: 'fixture report' }] }) }),
    verify: async () => ({ state: 'verified', findings: [], checks: ['callback fixture only'] }) });
  save(options.stateFile, state); options.stateSha256 = sha(readFileSync(options.stateFile));
  const scoreFile = join(operator, 'score.json');
  const collect = report => { save(scoreFile, report); return collectBenchmarkObservation({ ...options, scoreFile, scoreSha256: sha(readFileSync(scoreFile)) }); };
  return { root, operator, options, state, registration, privateBytes, invoked, scoreFile, put, save, collect };
}

for (const repair of [false, true]) test(`actual signed scorer process assesses ${repair ? 'repaired' : 'defective'} candidate through serialized collector`, async t => {
  const f = await fixture(t, { repair }), before = readFileSync(f.options.stateFile), report = runBoundBenchmarkScorer(f.options), row = f.collect(JSON.parse(JSON.stringify(report)));
  assert.equal(row.status, 'completed'); assert.equal(row.accepted, repair); assert.notEqual(report.payload.process.pid, process.pid);
  assert.equal(row.evidence.trustedScorerProcessSignatureVerified, true);
  for (const name of ['benchmarkEligible', 'graphFloorCoverageVerified', 'executionArtifactProvenanceVerified']) assert.equal(row.evidence[name], false);
  assert.equal(row.actualCostUsd, null); assert.deepEqual(readFileSync(f.options.stateFile), before); assert.equal(f.state.approvals.length, 0);
});

test('changed score and recomputed byte pin cannot forge the registered signature', async t => {
  const f = await fixture(t), report = runBoundBenchmarkScorer(f.options);
  for (const mutate of [p => { p.criteria[0].evidence = 'invented'; }, p => { p.process.pid++; }, p => { p.receipt.dirty = 'a'.repeat(64); }, p => { p.stateSha256 = 'a'.repeat(64); }]) {
    const bad = structuredClone(report); mutate(bad.payload); assert.throws(() => f.collect(bad), /signature mismatch/);
  }
  const bad = structuredClone(report); bad.signature = Buffer.alloc(64).toString('base64'); assert.throws(() => f.collect(bad), /signature mismatch/);
});

test('even a valid authority signature cannot change task/run/state/artifact/oracle bindings', async t => {
  const f = await fixture(t), report = runBoundBenchmarkScorer(f.options);
  for (const name of ['runId', 'stateSha256', 'registrationDigest', 'artifactSha256', 'oracleSha256', 'scorerSha256', 'candidateInputDigest']) {
    const payload = structuredClone(report.payload); payload[name] = name === 'runId' ? 'another-run' : 'a'.repeat(64);
    assert.throws(() => f.collect(signScorerPayload(payload, f.privateBytes, f.registration.scorer)), /binding mismatch|identity\/criteria mismatch/);
  }
  const payload = structuredClone(report.payload); payload.criteria[0].text = 'other acceptance';
  assert.throws(() => f.collect(signScorerPayload(payload, f.privateBytes, f.registration.scorer)), /identity\/criteria mismatch/);
});

test('signed registration refuses unsigned downgrade and ad-hoc authority substitution', async t => {
  const f = await fixture(t), report = runBoundBenchmarkScorer(f.options);
  assert.throws(() => f.collect({ ...report.payload, version: 1, source: 'operator-attestation', scorer: f.registration.scorer }), /signed scorer report required/);
  const keys = generateKeyPairSync('ed25519'), der = keys.publicKey.export({ format: 'der', type: 'spki' });
  const fake = { ...f.registration.scorer, authority: { algorithm: 'ed25519', publicKeySpki: der.toString('base64'), publicKeySha256: sha(der) } };
  assert.throws(() => f.collect(signScorerPayload(report.payload, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }), fake)), /signature mismatch/);
  f.registration.scorer = fake; f.save(f.options.registrationFile, f.registration);
  assert.throws(() => f.collect(report), /trial binding/);
});

test('private signing key is checked before launch and errors do not echo input', async t => {
  const f = await fixture(t, { marker: true });
  for (const kind of ['public', 'symlink', 'inside', 'wrong', 'malformed']) {
    f.save(f.options.privateKeyFile, f.privateBytes); chmodSync(f.options.privateKeyFile, 0o600);
    let path = f.options.privateKeyFile;
    if (kind === 'public') chmodSync(path, 0o644);
    if (kind === 'symlink') { path = join(f.operator, 'key-link'); symlinkSync(f.options.privateKeyFile, path); }
    if (kind === 'inside') { path = join(f.root, '.great_cto/key'); f.put('.great_cto/key', f.privateBytes); }
    if (kind === 'wrong') f.save(path, generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }));
    if (kind === 'malformed') f.save(path, 'private fixture payload must not appear');
    assert.throws(() => runBoundBenchmarkScorer({ ...f.options, privateKeyFile: path }), error => { assert.doesNotMatch(error.message, /private fixture payload/); return /unsafe|external|registered authority/.test(error.message); });
    assert.equal(existsSync(f.invoked), false);
  }
});

test('collector rejects ignored candidate policy drift and changed oracle after scoring', async t => {
  const f = await fixture(t), report = runBoundBenchmarkScorer(f.options);
  f.put('.great_cto/PROJECT.md', 'archetype: different\n'); assert.throws(() => f.collect(report), /input binding mismatch/);
  const g = await fixture(t), score = runBoundBenchmarkScorer(g.options); g.save(g.options.oracleFile, '{}'); assert.throws(() => g.collect(score), /pin or size/);
});

for (const name of ['stateFile', 'artifactFile', 'registrationFile']) test(`mutation of ${name} during actual scoring produces no signed report`, async t => {
  const f = await fixture(t, { mutateDuring: name }); assert.throws(() => runBoundBenchmarkScorer(f.options), /byte pin|code pin|registration JSON/);
  assert.equal(existsSync(f.scoreFile), false);
});

test('unsettled state cannot launch scoring or retroactively bind its authority', async t => {
  const f = await fixture(t, { execute: false, marker: true }); assert.throws(() => runBoundBenchmarkScorer(f.options), /not settled/);
  assert.equal(existsSync(f.invoked), false);
  f.state.steps = 1; delete f.state.benchmarkBinding; assert.throws(() => bindBenchmarkTrial(f.state, f.registration), /fresh/);
});

test('fresh registration rejects malformed or unsupported signing authority before any dispatch', async t => {
  const f = await fixture(t, { execute: false }); delete f.state.benchmarkBinding;
  for (const mutate of [r => { r.scorer.authority.algorithm = 'rsa'; }, r => { r.scorer.authority.publicKeySpki = 'invalid'; },
    r => { r.scorer.authority.publicKeySha256 = 'a'.repeat(64); }, r => { r.scorer.oracleSha256 = null; }]) {
    const registration = structuredClone(f.registration); mutate(registration);
    assert.throws(() => bindBenchmarkTrial(f.state, registration), /registered scorer authority/);
    assert.equal(f.state.benchmarkBinding, undefined); assert.equal(f.state.attempts.length, 0);
  }
});

test('scorer timeout or invalid output cannot produce signed assessment', async t => {
  // Create separate fresh bound fixtures so code is pinned before any dispatch.
  for (const invalid of ['while(true){}', "process.stdout.write('private fixture output');"]) {
    const g = await fixture(t, { execute: false });
    g.save(g.options.scorerFile, invalid); g.registration.scorer.sha256 = sha(invalid);
    delete g.state.benchmarkBinding; bindBenchmarkTrial(g.state, g.registration); g.save(g.options.registrationFile, g.registration);
    for (const role of ['code-reviewer', 'qa-engineer', 'security-officer']) await runStage(g.state, {
      execute: async () => ({ state: 'ok', code: 0, errors: [], finalText: JSON.stringify({ verdict: 'PASS', summary: 'fixture', meta: { report: `docs/${role}.md` }, files: [{ path: `docs/${role}.md`, before: null, content: 'fixture' }] }) }),
      verify: async () => ({ state: 'verified', findings: [], checks: ['fixture only'] }) });
    g.save(g.options.stateFile, g.state); g.options.stateSha256 = sha(readFileSync(g.options.stateFile));
    assert.throws(() => runBoundBenchmarkScorer({ ...g.options, timeoutMs: 250 }), error => {
      assert.doesNotMatch(error.message, /private fixture output/); return /process did not complete|invalid JSON/.test(error.message);
    });
    assert.equal(existsSync(g.scoreFile), false);
  }
});

test('real scorer and collector CLIs store private report without overwrite or approval', async t => {
  const f = await fixture(t, { marker: true }), cli = fileURLToPath(new URL('../../scripts/adaptive-benchmark-score.mjs', import.meta.url));
  const flags = { registrationFile: '--registration', stateFile: '--state', stateSha256: '--state-sha256', artifactFile: '--artifact', scorerFile: '--scorer', oracleFile: '--oracle', privateKeyFile: '--signing-key' };
  const args = Object.entries(f.options).flatMap(([key, value]) => [flags[key], value]).concat('--out', f.scoreFile);
  const result = JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000 }));
  assert.equal(result.accepted, true); assert.equal(result.benchmarkEligible, false); assert.equal(statSync(f.scoreFile).mode & 0o777, 0o600);
  const before = readFileSync(f.scoreFile), invocations = readFileSync(f.invoked), second = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(second.status, 2); assert.deepEqual(readFileSync(f.scoreFile), before);
  assert.deepEqual(readFileSync(f.invoked), invocations, 'existing output refuses before scorer launch');
  const dangling = join(f.operator, 'dangling-report'); symlinkSync(join(f.operator, 'missing-report'), dangling);
  assert.equal(spawnSync(process.execPath, [cli, ...args.slice(0, -2), '--out', dangling], { encoding: 'utf8' }).status, 2);
  assert.deepEqual(readFileSync(f.invoked), invocations, 'dangling symlink output refuses before scorer launch');
  const inside = join(f.root, '.great_cto/private'); mkdirSync(inside, { mode: 0o700 });
  const badArgs = args.slice(0, -2).concat('--out', join(inside, 'new.json'));
  assert.equal(spawnSync(process.execPath, [cli, ...badArgs], { encoding: 'utf8' }).status, 2);
  assert.equal(existsSync(join(inside, 'new.json')), false); assert.deepEqual(readFileSync(f.invoked), invocations);
  const collectCli = fileURLToPath(new URL('../../scripts/adaptive-benchmark-collect.mjs', import.meta.url));
  const publicArgs = Object.entries(f.options).filter(([key]) => key !== 'privateKeyFile').flatMap(([key, value]) => [flags[key], value]);
  const row = JSON.parse(execFileSync(process.execPath, [collectCli, ...publicArgs, '--score', f.scoreFile, '--score-sha256', result.scoreSha256], { encoding: 'utf8', timeout: 15000 }));
  assert.equal(row.evidence.trustedScorerProcessSignatureVerified, true); assert.equal(row.accepted, true);
  assert.equal(f.state.approvals.length, 0);
});
