import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs, {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import {runStage, runParallelWave, approve, advance, recover, cancel, verifyStage} from '../../scripts/lib/codex-pipeline.mjs';
import {runCodexExec} from '../../scripts/lib/codex-exec.mjs';
import {runClaudeExec} from '../../scripts/lib/claude-exec.mjs';
import {runChecks} from '../../scripts/lib/codex-checks.mjs';
import {createRun, reassess, reviewAll, gate, generation, boundary} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {scenario, calls, runFile, stored, artifactHashes, leaseOwnerPath, readJSON, writeJSON, commit, parallelGraph, sha} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

test('P06 provisional mandatory review stops before dispatch; explicit clean reassessment issues current assignments', async t => {
  const f = createRun(t); assert.equal(f.state.version, 1); assert.equal(f.state.shipEvidence.revision, 1); assert.equal(f.state.shipEvidence.phase, 'PROVISIONAL');
  assert.deepEqual(generation(f).assignments, []); assert.equal(generation(f).expected, null);
  await runStage(f.state, {shipBoundary: f.boundary, save: state => f.boundary.save(state), contextStore: f.runs});
  assert.equal(calls(f).length, 0); assert.equal(f.state.shipEvidence.phase, 'NEEDS_REASSESSMENT'); assert.notEqual(gate(f).state, 'PASS');
  const before = f.state.shipEvidence.revision; reassess(f); assert.equal(f.state.shipEvidence.revision, before + 1); assert.ok(f.state.shipEvidence.contextDigest);
});
test('N02 reassessment refuses dirty source and preserves attempts/budget; no automatic commit/rebind', t => {
  const f = createRun(t); const before = readFileSync(runFile(f, f.state.id)); const head = readJSON(join(f.store, 'runs', f.state.id, 'current.json'));
  writeFileSync(join(f.root, 'docs/qa-engineer.md'), 'uncommitted prepared report'); assert.throws(() => reassess(f));
  assert.deepEqual(readFileSync(runFile(f, f.state.id)), before); assert.deepEqual(readJSON(join(f.store, 'runs', f.state.id, 'current.json')), head);
  commit(f); reassess(f); assert.equal(f.state.maxAttempts, 3); assert.deepEqual(f.state.attempts, []);
});
test('N08 required devtools reviewer absent from graph refuses reassessment rather than waiving role', t => {
  const f = createRun(t); writeFileSync(join(f.root, '.great_cto/PROJECT.md'), 'primary: devtools\narchetype: devtools\ncompliance: []\npacks: []\n'); commit(f);
  const before = readFileSync(runFile(f, f.state.id)); assert.throws(() => reassess(f)); assert.deepEqual(readFileSync(runFile(f, f.state.id)), before); assert.notEqual(gate(f).state, 'PASS');
});
for (const host of ['codex', 'claude-code']) test(`P06 actual ${host} worker plus actual Codex verifier yields source-bound completions`, async t => {
  const f = createRun(t, {hostRoutes: {'qa-engineer': host, 'security-officer': host}}); const artifacts = artifactHashes(f); reassess(f);
  const revisions = []; await reviewAll(f, {save: state => {const n = stored(f, state.id).shipEvidence.revision; const saved = f.boundary.save(state); assert.equal(typeof saved?.then, 'undefined'); assert.equal(saved.revision, n + 1); revisions.push(saved.revision);}});
  assert.equal(gate(f).state, 'PASS'); assert.deepEqual(artifactHashes(f), artifacts);
  const rows = calls(f); assert.equal(rows.filter(r => r.kind === 'worker' && r.host === host).length, 2); assert.equal(rows.filter(r => r.kind === 'verifier' && r.host === 'codex').length, 2);
  assert.equal(new Set(rows.map(r => r.pid)).size, 4); assert.ok(revisions.length > 2);
  const data = generation(f); assert.equal(data.records.length, 2); assert.equal(data.completionDigests.length, 2);
  for (const digest of data.completionDigests) {
    const envelope = readJSON(join(f.store, 'runs', f.state.id, 'blobs', `${digest}.json`));
    assert.equal(envelope.version, 'ship-completion/v1'); assert.notEqual(envelope.workerCallId, envelope.verifierCallId);
    assert.equal(envelope.host, host); assert.equal(envelope.sourceBeforeDigest, f.state.shipEvidence.contextDigest); assert.equal(envelope.sourceAfterDigest, f.state.shipEvidence.contextDigest);
  }
  assert.ok(data.assignments.every(a => data.records.some(r => r.reviewerInvocationId === a.reviewerInvocationId)));
  assert.ok(f.state.pending.gates.includes('gate:ship')); assert.equal(f.state.pending.shipEvidenceRevision, f.state.shipEvidence.revision); assert.equal(f.state.pending.shipEvidenceContextDigest, f.state.shipEvidence.contextDigest);
});
test('N13 ordinary verified:true/authority/origin/independence metadata cannot mint completion capability', t => {
  const f = createRun(t); reassess(f); const before = readFileSync(runFile(f, f.state.id));
  const fake = {reviewerInvocationId: 'synthetic-self', authority: 'CONTROLLED_REVIEW', origin: 'CONTROLLER', independentOf: ['other'], verified: true};
  assert.throws(() => f.boundary.completeReview(f.state, {capability: fake, proposal: {verdict: 'PASS', files: [], meta: {report: 'docs/qa-engineer.md'}}, verification: {state: 'verified', findings: [], checks: ['claimed']}}), {code: 'SHIP_CAPABILITY_INVALID'});
  assert.deepEqual(readFileSync(runFile(f, f.state.id)), before); assert.equal(generation(f).records.length, 0);
});
test('N13 direct library approve/advance with missing or lookalike boundary refuses before mutation', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); assert.ok(f.state.pending);
  const before = JSON.stringify(f.state); const token = f.state.pending.token;
  assert.throws(() => approve(f.state, token)); assert.equal(JSON.stringify(f.state), before);
  const lookalike = {assertApproval() {return {revision: f.state.shipEvidence.revision, contextDigest: f.state.shipEvidence.contextDigest};}, assertCurrent() {}, save() {}};
  assert.throws(() => approve(f.state, token, {shipBoundary: lookalike}), {code: 'SHIP_CAPABILITY_INVALID'}); assert.equal(JSON.stringify(f.state), before);
  assert.throws(() => advance(f.state)); assert.equal(JSON.stringify(f.state), before);
  const result = approve(f.state, token, {shipBoundary: f.boundary}); assert.equal(typeof result?.then, 'undefined'); f.boundary.save(f.state);
  assert.equal(f.state.approvals.filter(a => a.gate === 'gate:ship').length, 1);
});
for (const delta of [
  {workerFiles: [{path: 'docs/qa-engineer.md', before: null, content: 'worker replacement'}]},
  {missingArtifact: true}, {verifierState: 'unverifiable'}, {transportFailure: 'worker'}, {transportFailure: 'verifier'},
]) test(`N13 unsupported/negative output ${JSON.stringify(delta)} cannot become a source approval`, async t => {
  const f = createRun(t); reassess(f); scenario(f, delta); const artifacts = artifactHashes(f);
  try {await reviewAll(f);} catch { /* fail-closed guard can reject save after invalidation */ }
  assert.notEqual(gate(f).state, 'PASS'); assert.deepEqual(artifactHashes(f), artifacts);
  assert.equal(stored(f, f.state.id).approvals.length, 0); assert.equal(stored(f, f.state.id).released.length, 0);
  assert.equal(generation(f).records.filter(r => r.outcome === 'PASS').length, 0);
});
for (const host of ['codex', 'claude-code']) for (const kind of ['worker', 'checks', 'verifier']) for (const loss of ['source', 'lease']) test(`N15 ${host} ${kind} await ${loss} loss fences persisted effects`, async t => {
  const f = createRun(t, {checks: kind === 'checks', hostRoutes: {'qa-engineer': host, 'security-officer': host}}); reassess(f);
  const ownerPath = leaseOwnerPath(f), oldOwner = readFileSync(ownerPath); let checkpoint = null;
  f.cleanupFns.unshift(() => writeFileSync(ownerPath, oldOwner));
  const fault = () => {checkpoint = readFileSync(runFile(f, f.state.id)); if (loss === 'source') writeFileSync(join(f.root, 'src/app.mjs'), 'source moved after awaited actual result'); else writeJSON(ownerPath, {...readJSON(ownerPath), token: JSON.parse(oldOwner).token + ':synthetic-transfer'});};
  const realRunner = host === 'codex' ? runCodexExec : runClaudeExec;
  const options = {
    shipBoundary: f.boundary, contextStore: f.runs, save: state => f.boundary.save(state),
    runners: {[host]: async args => {const out = await realRunner(args); if (kind === 'worker') fault(); return out;}},
    checks: async (...args) => {const out = await runChecks(...args); if (kind === 'checks') fault(); return out;},
    verify: async (...args) => {const out = await verifyStage(...args); if (kind === 'verifier') fault(); return out;},
  };
  try {await runStage(f.state, options);} catch { /* expected fail-closed */ }
  assert.ok(checkpoint, 'fault ran only after real awaited call finished');
  assert.deepEqual(readFileSync(runFile(f, f.state.id)), checkpoint, 'rejected late result cannot change last persisted state');
  assert.equal(stored(f, f.state.id).approvals.length, 0); assert.equal(stored(f, f.state.id).results['qa-engineer'], undefined);
  writeFileSync(ownerPath, oldOwner);
});
test('P06 parallel real mixed-host wave persists each completion with synchronous generation-fenced saves', async t => {
  const f = createRun(t, {graph: parallelGraph, hostRoutes: {'qa-engineer': 'codex', 'security-officer': 'claude-code'}}); reassess(f);
  assert.deepEqual([...f.state.queue].sort(), ['qa-engineer', 'security-officer']);
  const revisions = []; await reviewAll(f, {parallel: true, save: state => {const previous = stored(f, state.id).shipEvidence.revision; const out = f.boundary.save(state); assert.equal(out.revision, previous + 1); revisions.push(out.revision);}});
  assert.equal(gate(f).state, 'PASS'); assert.equal(generation(f).completionDigests.length, 2); assert.equal(new Set(revisions).size, revisions.length);
  assert.equal(calls(f).filter(r => r.kind === 'worker').length, 2); assert.equal(calls(f).filter(r => r.kind === 'verifier' && r.host === 'codex').length, 2);
});
test('N15 parallel sibling source drift cannot release either result or transition', async t => {
  const f = createRun(t, {graph: parallelGraph, hostRoutes: {'qa-engineer': 'codex', 'security-officer': 'claude-code'}}); reassess(f); scenario(f, {sourceDriftAt: 'worker'});
  try {await reviewAll(f, {parallel: true});} catch { /* expected */ }
  const saved = stored(f, f.state.id); assert.equal(saved.approvals.length, 0); assert.equal(saved.released.length, 0); assert.deepEqual(saved.results, {}); assert.notEqual(gate(f).state, 'PASS');
});
test('N15 parallel awaited sibling lease transfer fences both completions and preserves last persisted revision', async t => {
  const f = createRun(t, {graph: parallelGraph, hostRoutes: {'qa-engineer': 'codex', 'security-officer': 'claude-code'}}); reassess(f);
  const path = leaseOwnerPath(f), owner = readFileSync(path); let checkpoint;
  f.cleanupFns.unshift(() => writeFileSync(path, owner));
  const runners = {codex: async args => {const result = await runCodexExec(args); checkpoint = readFileSync(runFile(f, f.state.id)); writeJSON(path, {...readJSON(path), token: JSON.parse(owner).token + ':synthetic-transfer'}); return result;}, 'claude-code': runClaudeExec};
  try {await reviewAll(f, {parallel: true, runners});} catch { /* expected lease refusal */ }
  assert.ok(checkpoint); assert.deepEqual(readFileSync(runFile(f, f.state.id)), checkpoint);
  const saved = stored(f, f.state.id); assert.deepEqual(saved.results, {}); assert.equal(saved.approvals.length, 0); assert.equal(saved.released.length, 0); writeFileSync(path, owner);
});
test('N15 recovery/cancel saves increment once and revoke satisfaction without automatic reassessment', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const before = f.state.shipEvidence.revision;
  f.boundary.invalidate(f.state, {reason: 'operator-recovery'}); f.boundary.save(f.state);
  assert.equal(f.state.shipEvidence.revision, before + 1); assert.equal(f.state.shipEvidence.phase, 'INVALIDATED'); assert.notEqual(gate(f).state, 'PASS');
  cancel(f.state); f.boundary.save(f.state); assert.equal(f.state.shipEvidence.revision, before + 2); assert.equal(f.state.status, 'cancelled'); assert.throws(() => reassess(f));
});
test('N15 orphan immutable N+1 from failed rename is never overwritten with another proposed state', t => {
  const f = createRun(t); reassess(f); const n = f.state.shipEvidence.revision; const path = runFile(f, f.state.id); const before = readFileSync(path);
  scenario(f, {tasks: [{id: 'snapshot:first', status: 'closed', labels: []}]});
  const original = fs.renameSync;
  fs.renameSync = (from, to) => {if (to === path) throw Object.assign(new Error('synthetic rename failure'), {code: 'EIO'}); return original(from, to);}; syncBuiltinESMExports();
  try {assert.throws(() => f.boundary.save({...f.state, reason: 'first proposed metadata'}));} finally {fs.renameSync = original; syncBuiltinESMExports();}
  assert.deepEqual(readFileSync(path), before); const orphan = join(f.store, 'runs', f.state.id, 'generations', `${n + 1}.json`); const orphanBytes = readFileSync(orphan);
  scenario(f, {tasks: [{id: 'snapshot:second', status: 'closed', labels: []}]});
  assert.throws(() => f.boundary.save({...f.state, reason: 'different proposed metadata'}), {code: 'SHIP_GENERATION_CONFLICT'});
  assert.deepEqual(readFileSync(orphan), orphanBytes); assert.deepEqual(readFileSync(path), before);
});
test('N15 pointer error after rename reports committed revision, refuses replay and preserves one approval', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const token = f.state.pending.token;
  approve(f.state, token, {shipBoundary: f.boundary}); const n = f.state.shipEvidence.revision;
  const pointer = join(f.store, 'runs', f.state.id, 'current.json'); const original = fs.writeFileSync;
  fs.writeFileSync = (path, ...args) => {if (String(path) === pointer || String(path).startsWith(`${pointer}.`)) throw Object.assign(new Error('synthetic pointer cache failure'), {code: 'EIO'}); return original(path, ...args);}; syncBuiltinESMExports();
  let error; try {f.boundary.save(f.state);} catch (caught) {error = caught;} finally {fs.writeFileSync = original; syncBuiltinESMExports();}
  assert.equal(error?.code, 'SHIP_COMMITTED_OBSERVATION_UNKNOWN'); assert.equal(error.persistedRevision, n + 1);
  const saved = stored(f, f.state.id); assert.equal(saved.shipEvidence.revision, n + 1); assert.equal(saved.approvals.filter(a => a.gate === 'gate:ship').length, 1);
  assert.throws(() => approve(saved, token, {shipBoundary: f.boundary}));
});
