import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import * as reader from '../../scripts/lib/bound-run-proposal.mjs';
const uuid = '12345678-1234-1234-1234-123456789abc';
const base = 'a'.repeat(40), fingerprint = 'b'.repeat(64);
const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const sha = v => createHash('sha256').update(v).digest('hex');
const policy = 'archetype: devtools\napproval-level: gates-only\n';
function fixture(t) {
  const dir = fs.mkdtempSync(join(fs.realpathSync(homedir()), '.bound-run-test-'));
  fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'project'), store = join(dir, 'store');
  fs.mkdirSync(root, { mode: 0o700 }); fs.mkdirSync(store, { mode: 0o700 });
  fs.mkdirSync(join(root, '.great_cto'), { mode: 0o700 });
  const projectFile = join(root, '.great_cto', 'PROJECT.md'), stateFile = join(store, `${uuid}.json`);
  fs.writeFileSync(projectFile, policy, { mode: 0o600 });
  const plan = { version: 1, state: 'planned', advisory: true, planningOnly: false, reusablePass: false,
    fingerprint, scope: 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested',
    assessment: { known: true, tier: 'T1', base, fingerprint: 'c'.repeat(64), files: ['src/view.ts'],
      reasons: ['auto:T1:behavioral(1)'], escalatedFromLabel: null },
    reviewers: mandatory.map(agent => ({ agent, reasons: ['mandatory independent delivery review'], files: [] })) };
  const state = { version: 1, id: uuid, root, specialistPolicy: { mode: 'adaptive', workflow: 'existing-change',
    base, contracts: [], projectDigest: sha(policy) },
  specialistReview: { roles: [...mandatory], fingerprint, plan, hardGates: ['gate:ship'], reusablePass: false } };
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 }); save();
  return { state, save, root, store, projectFile, stateFile, args: { projectRoot: root, projectId: sha(root),
    runId: uuid, phase: 'review', storeDir: store } };
}
function unavailable(result, reason, status = 200) {
  assert.equal(result.status, status); assert.equal(result.body.state, 'unavailable');
  assert.equal(result.body.reason, reason); assert.equal(result.body.binding, null); assert.equal(result.body.proposal, null);
  assert.equal(result.body.currentTreeAssessment, false); assert.equal(result.body.reusablePass, false);
}
test('reader exports exact asynchronous adapter entry points', () => {
  assert.equal(typeof reader.readBoundRunBinding, 'function'); assert.equal(typeof reader.readBoundRunProposal, 'function');
});
test('review snapshot binds exact bytes and projects retained review/gate floor', async t => {
  const f = fixture(t); const r = await reader.readBoundRunBinding(f.args);
  assert.equal(r.status, 200); assert.equal(r.body.state, 'available');
  assert.equal(r.body.kind, 'controlled-run-proposal-binding');
  assert.equal(r.body.binding.snapshotDigest, sha(fs.readFileSync(f.stateFile)));
  assert.equal(r.body.binding.policyDigest, sha(policy)); assert.equal(r.body.binding.base, base);
  assert.equal(r.body.binding.planFingerprint, fingerprint); assert.match(r.body.binding.epochDigest, /^[a-f0-9]{64}$/);
  const p = await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: r.body.binding });
  assert.equal(p.status, 200); assert.equal(p.body.state, 'available');
  assert.equal(p.body.proposal.assessmentState, 'known'); assert.deepEqual(p.body.binding, r.body.binding);
  for (const gate of ['product', 'arch', 'import', 'ship']) assert.ok(p.body.proposal.requiredGates.includes(gate));
  for (const role of mandatory) assert.ok(p.body.proposal.requiredRoles.includes(role));
  assert.equal(p.body.controller, 'codex'); assert.equal(p.body.provenance, 'stored-snapshot');
  assert.equal(p.body.advisory, true); assert.equal(p.body.changesExecution, false);
  for (const limit of ['stored-snapshot-not-revalidated', 'content-identity-not-historical-epoch', 'proposal-not-execution-evidence']) assert.ok(p.body.limitations.includes(limit));
});
test('realistic planning-only preparation allows descriptor and never invokes graph projector', async t => {
  const f = fixture(t); const phase = structuredClone(f.state.specialistReview);
  phase.plan.planningOnly = true; phase.plan.assessment = { known: false, tier: 'T2', base, files: [],
    reasons: ['assessment-unavailable:empty change has no risk evidence'] };
  phase.roles = ['design-advisor-prebuild']; phase.selected = ['design-advisor']; phase.hardGates = ['gate:plan'];
  phase.plan.reviewers.push({ agent: 'design-advisor', reasons: ['declared contract'], files: [] });
  f.state.specialistPolicy.workflow = 'phased-change'; f.state.specialistPolicy.contracts = ['design-advisor'];
  f.state.specialistStages = { 'design-advisor-prebuild': { role: 'design-advisor', phase: 'contract' } };
  f.state.specialistPreparation = phase; f.save(); const args = { ...f.args, phase: 'preparation' };
  const b = await reader.readBoundRunBinding(args); assert.equal(b.body.state, 'available');
  const p = await reader.readBoundRunProposal({ ...args, focusId: 'fintech-crypto', binding: b.body.binding },
    { projector: () => { assert.fail('preparation must not invoke projector'); } });
  unavailable(p, 'planning-only-evidence'); assert.equal(f.state.specialistPreparation.plan.planningOnly, true);
});
test('same content in separate phases has distinct canonical epoch and absent selection is null', async t => {
  const f = fixture(t); const review = await reader.readBoundRunBinding(f.args);
  const identity = { assessmentFingerprint: 'c'.repeat(64), base, hardGates: ['gate:ship'], phase: 'review',
    planFingerprint: fingerprint, policyDigest: sha(policy), roles: mandatory, selected: null };
  assert.equal(review.body.binding.epochDigest, sha(JSON.stringify(identity)));
  f.state.specialistPreparation = structuredClone(f.state.specialistReview);
  f.state.specialistPreparation.plan.planningOnly = true; f.state.specialistPreparation.roles = [];
  f.state.specialistPreparation.selected = []; f.state.specialistPreparation.hardGates = ['gate:plan'];
  f.state.specialistStages = {}; f.state.specialistPolicy.workflow = 'phased-change';
  f.save(); const preparation = await reader.readBoundRunBinding({ ...f.args, phase: 'preparation' });
  assert.equal(preparation.body.state, 'available'); assert.notEqual(preparation.body.binding.epochDigest, review.body.binding.epochDigest);
});
for (const field of ['snapshotDigest', 'epochDigest', 'planFingerprint', 'policyDigest', 'base']) test(`mismatched ${field} clears full binding`, async t => {
  const f = fixture(t); const b = await reader.readBoundRunBinding(f.args);
  b.body.binding[field] = 'd'.repeat(field === 'base' ? 40 : 64);
  unavailable(await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding }), 'snapshot-changed', 409);
});
test('unrelated state mutation invalidates snapshot without changing epoch', async t => {
  const f = fixture(t); const a = await reader.readBoundRunBinding(f.args); f.state.status = 'PRIVATE_STATUS'; f.save();
  const b = await reader.readBoundRunBinding(f.args); assert.equal(a.body.binding.epochDigest, b.body.binding.epochDigest);
  unavailable(await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: a.body.binding }), 'snapshot-changed', 409);
});
test('missing and other-root records are indistinguishable', async t => {
  const f = fixture(t); f.state.root = f.store; f.save(); const foreign = await reader.readBoundRunBinding(f.args);
  fs.unlinkSync(f.stateFile); const missing = await reader.readBoundRunBinding(f.args);
  assert.deepEqual(foreign, missing); unavailable(missing, 'unavailable', 404);
});
for (const [name, mutate, reason] of [
  ['version', s => { s.version = 2; }, 'unsupported-evidence'],
  ['missing phase', s => { delete s.specialistReview; }, 'unsupported-evidence'],
  ['native record', s => { delete s.specialistPolicy; }, 'unsupported-evidence'],
  ['id mismatch', s => { s.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; }, 'invalid-evidence'],
  ['fingerprint', s => { s.specialistReview.fingerprint = 'd'.repeat(64); }, 'invalid-evidence'],
  ['base', s => { s.specialistReview.plan.assessment.base = 'd'.repeat(40); }, 'invalid-evidence'],
  ['policy digest', s => { s.specialistPolicy.projectDigest = 'd'.repeat(64); }, 'invalid-evidence'],
  ['unknown role', s => { s.specialistReview.roles.push('invented-reviewer'); }, 'invalid-evidence'],
  ['embedder alias', s => { s.specialistReview.roles.push('writer'); }, 'invalid-evidence'],
  ['duplicate role', s => { s.specialistReview.roles.push('code-reviewer'); }, 'invalid-evidence'],
  ['unknown reviewer', s => { s.specialistReview.plan.reviewers.push({ agent: 'invented-reviewer', files: [], reasons: ['private'] }); }, 'invalid-evidence'],
  ['unknown gate', s => { s.specialistReview.hardGates.push('gate:invented'); }, 'invalid-evidence'],
  ['prebuild in review', s => { s.specialistReview.roles.push('design-advisor-prebuild'); }, 'invalid-evidence'],
  ['wrong planning flag', s => { s.specialistReview.plan.planningOnly = true; }, 'invalid-evidence'],
  ['missing required reviewer', s => { s.specialistReview.roles.pop(); }, 'invalid-evidence'],
  ['unbounded reviewers', s => { s.specialistReview.plan.reviewers = Array(2001).fill(s.specialistReview.plan.reviewers[0]); }, 'invalid-evidence'],
]) test(`${name} fails closed without private details`, async t => {
  const f = fixture(t); mutate(f.state); f.save(); unavailable(await reader.readBoundRunBinding(f.args), reason);
});
for (const [key, value] of [['runId', '../secret'], ['runId', uuid.toUpperCase()], ['phase', 'latest'], ['projectId', 'private-name'], ['storeDir', 'relative']]) test(`invalid ${key} rejects before filesystem access`, async t => {
  const f = fixture(t); let reads = 0;
  const io = new Proxy({}, { get() { reads++; throw Error('no filesystem access expected'); } });
  unavailable(await reader.readBoundRunBinding({ ...f.args, [key]: value }, { fs: io }), 'invalid-selection', 400);
  assert.equal(reads, 0);
});
for (const [name, fault] of [
  ['unsafe store mode', f => fs.chmodSync(f.store, 0o750)],
  ['unsafe state mode', f => fs.chmodSync(f.stateFile, 0o640)],
  ['hard link', f => fs.linkSync(f.stateFile, join(f.store, 'other'))],
  ['symlink state', f => { fs.renameSync(f.stateFile, `${f.stateFile}.original`); fs.symlinkSync(`${f.stateFile}.original`, f.stateFile); }],
  ['oversized state', f => fs.writeFileSync(f.stateFile, Buffer.alloc(1048577))],
  ['oversized policy', f => fs.writeFileSync(f.projectFile, Buffer.alloc(65537))],
]) test(`${name} is unsafe evidence`, async t => {
  const f = fixture(t); fault(f); unavailable(await reader.readBoundRunBinding(f.args), 'unsafe-evidence');
});
test('UTF8 and JSON decoding reject malformed bytes', async t => {
  const f = fixture(t);
  for (const bytes of [Buffer.from([0xff]), Buffer.from('{broken'), Buffer.from('[]')]) {
    fs.writeFileSync(f.stateFile, bytes); unavailable(await reader.readBoundRunBinding(f.args), 'invalid-evidence');
  }
});
test('only exact state and selected policy are read, with no directory listing or writes', async t => {
  const f = fixture(t); const opened = [], reads = []; let total = 0;
  const io = { ...fs, openSync(path, flags) { opened.push(path); assert.ok(flags & fs.constants.O_NOFOLLOW); assert.ok(flags & fs.constants.O_NONBLOCK); return fs.openSync(path, flags); },
    readSync(...args) { reads.push(args[3]); const n = fs.readSync(...args); total += n; return n; } };
  for (const name of ['readdirSync', 'readFileSync', 'writeFileSync', 'mkdirSync', 'chmodSync']) io[name] = () => assert.fail(`forbidden ${name}`);
  assert.equal((await reader.readBoundRunBinding(f.args, { fs: io })).body.state, 'available');
  assert.deepEqual(opened, [f.stateFile, f.projectFile]); assert.ok(total <= 1114114); assert.ok(Math.max(...reads) <= 1048577);
});
test('mutations during state read are detected with no retry', async t => {
  const f = fixture(t); let calls = 0;
  const io = { ...fs, readSync(...args) { const n = fs.readSync(...args); if (++calls === 1) fs.appendFileSync(f.stateFile, ' '); return n; } };
  unavailable(await reader.readBoundRunBinding(f.args, { fs: io }), 'snapshot-changed', 409); assert.ok(calls <= 2);
});
test('canaries in untrusted metadata never enter fresh envelopes and worker host cannot attest native execution', async t => {
  const f = fixture(t); const canary = 'PRIVATE_CANARY_PROMPT_TOKEN_FILE';
  f.state.prompt = canary; f.state.reason = canary; f.state.hostRoutes = { 'code-reviewer': 'claude-code' };
  f.state.specialistReview.plan.assessment.files = [`src/${canary}.ts`];
  f.state.specialistReview.plan.reviewers[0].reasons = [canary]; f.save();
  const b = await reader.readBoundRunBinding(f.args);
  const p = await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding });
  assert.equal(p.body.state, 'available'); assert.equal(p.body.controller, 'codex');
  assert.ok(!JSON.stringify(p).includes(canary)); assert.ok(!JSON.stringify(p).includes(f.root));
  assert.equal(p.body.currentTreeAssessment, false); assert.equal(p.body.reusablePass, false);
  assert.ok(Buffer.byteLength(JSON.stringify(p.body)) <= 98304); assert.ok(Buffer.byteLength(JSON.stringify(p.body.proposal)) <= 65536);
});
test('policy change after descriptor is snapshot-changed even if stored policy relation is stale', async t => {
  const f = fixture(t); const b = await reader.readBoundRunBinding(f.args);
  fs.appendFileSync(f.projectFile, '# changed policy bytes\n');
  unavailable(await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding }), 'snapshot-changed', 409);
});
test('changed malformed phase after descriptor is snapshot-changed before structural interpretation', async t => {
  const f = fixture(t); const b = await reader.readBoundRunBinding(f.args);
  f.state.specialistReview.plan.version = 3; f.save();
  unavailable(await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding }), 'snapshot-changed', 409);
});
const statWith = (stat, patch) => Object.assign(Object.create(stat), patch);
for (const [name, choose, patch] of [
  ['wrong store owner', f => f.store, { uid: BigInt(process.geteuid()) + 1000n }],
  ['wrong state owner', f => f.stateFile, { uid: BigInt(process.geteuid()) + 1000n }],
  ['writable sticky ancestor', f => f.root.substring(0, f.root.lastIndexOf('/')), { mode: 0o41777n }],
  ['FIFO file', f => f.stateFile, { isFile: () => false }],
  ['symlink ancestor', f => f.root.substring(0, f.root.lastIndexOf('/')), { isSymbolicLink: () => true }],
]) test(`${name} rejects before any file open`, async t => {
  const f = fixture(t); let opened = 0; const target = choose(f);
  const io = { ...fs, lstatSync(path, ...args) { const s = fs.lstatSync(path, ...args); return path === target ? statWith(s, patch) : s; },
    openSync(...args) { opened++; return fs.openSync(...args); } };
  unavailable(await reader.readBoundRunBinding(f.args, { fs: io }), 'unsafe-evidence'); assert.equal(opened, 0);
});
test('file swapped between lstat and open is snapshot-changed', async t => {
  const f = fixture(t); const io = { ...fs, fstatSync(...args) { return statWith(fs.fstatSync(...args), { ino: 100000000000n }); } };
  unavailable(await reader.readBoundRunBinding(f.args, { fs: io }), 'snapshot-changed', 409);
});
test('policy changed at final revalidation is snapshot-changed without a second read', async t => {
  const f = fixture(t); let policyStats = 0, opens = 0;
  const io = { ...fs, lstatSync(path, ...args) { if (path === f.projectFile && ++policyStats === 3) fs.appendFileSync(path, ' '); return fs.lstatSync(path, ...args); },
    openSync(...args) { opens++; return fs.openSync(...args); } };
  unavailable(await reader.readBoundRunBinding(f.args, { fs: io }), 'snapshot-changed', 409); assert.equal(opens, 2);
});
test('project canonical directory replacement is snapshot-changed', async t => {
  const f = fixture(t); let checks = 0;
  const io = { ...fs, lstatSync(path, ...args) { const s = fs.lstatSync(path, ...args); return path === f.root && ++checks >= 3 ? statWith(s, { ino: s.ino + 1n }) : s; } };
  unavailable(await reader.readBoundRunBinding(f.args, { fs: io }), 'snapshot-changed', 409);
});
for (const text of ['archetype: unknown\n', 'archetype: devtools\narchetype: fintech\n',
  'archetype: devtools\napproval-level: nonsense\n', 'archetype: devtools\napproval-level: \n']) {
  test(`malformed declaration ${JSON.stringify(text)} never downgrades gates`, async t => {
    const f = fixture(t); fs.writeFileSync(f.projectFile, text); f.state.specialistPolicy.projectDigest = sha(text); f.save();
    unavailable(await reader.readBoundRunBinding(f.args), 'invalid-evidence');
  });
}
test('policy contracts outside saved reviewer array survive graph without becoming review roles', async t => {
  const f = fixture(t); f.state.specialistPolicy.workflow = 'phased-change';
  f.state.specialistPolicy.contracts = ['design-advisor']; f.save();
  const b = await reader.readBoundRunBinding(f.args); assert.equal(b.body.state, 'available');
  const p = await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding });
  assert.equal(p.body.state, 'available'); assert.ok(p.body.proposal.requiredRoles.includes('design-advisor'));
  assert.deepEqual(f.state.specialistReview.roles, mandatory);
});
test('phase hard gates and current regulated policy survive inspection', async t => {
  const f = fixture(t); const text = 'archetype: fintech\napproval-level: auto\n'; fs.writeFileSync(f.projectFile, text);
  f.state.specialistPolicy.projectDigest = sha(text); f.state.specialistReview.hardGates = ['gate:qa', 'gate:ship']; f.save();
  const b = await reader.readBoundRunBinding(f.args);
  const p = await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding });
  assert.equal(p.body.state, 'available');
  for (const g of ['import', 'ship', 'qa', 'security', 'compliance']) assert.ok(p.body.proposal.requiredGates.includes(g));
});
test('preparation stage mapping cannot impersonate a different contract', async t => {
  const f = fixture(t); const phase = structuredClone(f.state.specialistReview);
  phase.plan.planningOnly = true; phase.roles = ['design-advisor-prebuild']; phase.selected = ['design-advisor'];
  f.state.specialistPreparation = phase; f.state.specialistPolicy.workflow = 'phased-change';
  f.state.specialistStages = { 'design-advisor-prebuild': { role: 'auth-engineer', phase: 'contract' } }; f.save();
  unavailable(await reader.readBoundRunBinding({ ...f.args, phase: 'preparation' }), 'invalid-evidence');
});
test('preparation unknown assessment is supported only for exact clean-tree evidence', async t => {
  const f = fixture(t); const phase = structuredClone(f.state.specialistReview);
  phase.plan.planningOnly = true; phase.roles = []; phase.selected = [];
  phase.plan.assessment = { known: false, tier: 'T2', base, files: [], reasons: ['assessment-unavailable:PRIVATE_CANARY'] };
  f.state.specialistPreparation = phase; f.state.specialistStages = {}; f.state.specialistPolicy.workflow = 'phased-change'; f.save();
  unavailable(await reader.readBoundRunBinding({ ...f.args, phase: 'preparation' }), 'invalid-evidence');
});
test('invalid expected binding and focus perform zero filesystem operations', async t => {
  const f = fixture(t); let calls = 0; const io = new Proxy({}, { get() { calls++; throw Error('private'); } });
  for (const extra of [{ binding: null, focusId: 'fintech-crypto' }, { binding: {}, focusId: 'invented' }])
    unavailable(await reader.readBoundRunProposal({ ...f.args, ...extra }, { fs: io }), 'invalid-selection', 400);
  assert.equal(calls, 0);
});
test('unknown-version or overflow projector output fails without a partial graph', async t => {
  const f = fixture(t); const b = await reader.readBoundRunBinding(f.args);
  for (const graph of [{ schemaVersion: 2 }, { schemaVersion: 1, assessmentState: 'unavailable', nodes: [{ id: 'private' }] }])
    unavailable(await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding }, { projector: () => graph }), 'invalid-evidence');
});
test('failed read clears allocated source bytes even when post-read validation throws', async t => {
  const f = fixture(t); let buffer;
  const io = { ...fs, readSync(...args) { buffer = args[1]; const n = fs.readSync(...args); fs.appendFileSync(f.stateFile, ' '); return n; } };
  unavailable(await reader.readBoundRunBinding(f.args, { fs: io }), 'snapshot-changed', 409);
  assert.ok(buffer.every(b => b === 0));
});
test('raw error reason cannot enter denial envelope', async t => {
  const f = fixture(t); const io = { ...fs, lstatSync() { throw Object.assign(Error('PRIVATE_CANARY'), { reason: 'PRIVATE_CANARY' }); } };
  const r = await reader.readBoundRunBinding(f.args, { fs: io }); unavailable(r, 'unsafe-evidence');
  assert.ok(!JSON.stringify(r).includes('PRIVATE_CANARY'));
});
test('state disappearing during final revalidation returns changed rather than a missing-run result', async t => {
  const f = fixture(t); let stats = 0;
  const io = { ...fs, lstatSync(path, ...args) { if (path === f.stateFile && ++stats === 3) fs.unlinkSync(path); return fs.lstatSync(path, ...args); } };
  unavailable(await reader.readBoundRunBinding(f.args, { fs: io }), 'snapshot-changed', 409);
});
test('strict expected binding key set rejects caller-supplied filesystem dependencies', async t => {
  const f = fixture(t); const b = await reader.readBoundRunBinding(f.args);
  unavailable(await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: { ...b.body.binding, store: 'PRIVATE' } }), 'invalid-selection', 400);
});
for (const [phase, hardGates] of [
  ['review', []], ['review', ['gate:ship']], ['review', ['gate:security', 'gate:compliance']],
  ['review', ['gate:ship', 'gate:security']], ['review', ['gate:ship', 'gate:compliance']],
  ['preparation', []], ['preparation', ['gate:ship']], ['preparation', ['gate:plan']],
  ['preparation', ['gate:plan', 'gate:security']], ['preparation', ['gate:plan', 'gate:compliance']],
  ['preparation', ['gate:security', 'gate:compliance']],
]) test(`${phase} rejects regulatory writer floor missing from ${JSON.stringify(hardGates)}`, async t => {
  const f = fixture(t); const selectedPhase = structuredClone(f.state.specialistReview);
  selectedPhase.plan.reviewers.push({ agent: 'pci-reviewer', reasons: ['required regulatory review'], files: [] });
  selectedPhase.hardGates = hardGates;
  if (phase === 'review') selectedPhase.roles.push('pci-reviewer');
  else {
    selectedPhase.plan.planningOnly = true; selectedPhase.roles = ['pci-reviewer-prebuild']; selectedPhase.selected = ['pci-reviewer'];
    f.state.specialistPolicy.workflow = 'phased-change';
    f.state.specialistStages = { 'pci-reviewer-prebuild': { role: 'pci-reviewer', phase: 'threat-review' } };
  }
  f.state[phase === 'review' ? 'specialistReview' : 'specialistPreparation'] = selectedPhase; f.save();
  unavailable(await reader.readBoundRunBinding({ ...f.args, phase }), 'invalid-evidence');
});
for (const [phase, hardGates] of [['review', []], ['preparation', ['gate:ship']]])
  test(`${phase} rejects missing ordinary writer gate`, async t => {
    const f = fixture(t); const selectedPhase = structuredClone(f.state.specialistReview);
    selectedPhase.hardGates = hardGates;
    if (phase === 'preparation') {
      selectedPhase.plan.planningOnly = true; selectedPhase.roles = []; selectedPhase.selected = [];
      f.state.specialistPolicy.workflow = 'phased-change'; f.state.specialistStages = {};
    }
    f.state[phase === 'review' ? 'specialistReview' : 'specialistPreparation'] = selectedPhase; f.save();
    unavailable(await reader.readBoundRunBinding({ ...f.args, phase }), 'invalid-evidence');
  });
test('T1 regulatory review preserves valid writer floor and additional phase gates', async t => {
  const f = fixture(t); f.state.specialistReview.plan.reviewers.push({ agent: 'pci-reviewer', reasons: ['regulatory'], files: [] });
  f.state.specialistReview.roles.push('pci-reviewer');
  f.state.specialistReview.hardGates = ['gate:security', 'gate:compliance', 'gate:ship', 'gate:qa']; f.save();
  const b = await reader.readBoundRunBinding(f.args); assert.equal(b.body.state, 'available');
  const p = await reader.readBoundRunProposal({ ...f.args, focusId: 'fintech-crypto', binding: b.body.binding });
  assert.equal(p.body.state, 'available'); assert.ok(p.body.proposal.requiredRoles.includes('pci-reviewer'));
  for (const gate of ['security', 'compliance', 'ship', 'qa']) assert.ok(p.body.proposal.requiredGates.includes(gate));
});
test('regulatory preparation accepts full writer floor plus extra gates without graph invocation', async t => {
  const f = fixture(t); const phase = structuredClone(f.state.specialistReview);
  phase.plan.planningOnly = true; phase.plan.reviewers.push({ agent: 'pci-reviewer', reasons: ['regulatory'], files: [] });
  phase.roles = ['pci-reviewer-prebuild']; phase.selected = ['pci-reviewer'];
  phase.hardGates = ['gate:plan', 'gate:security', 'gate:compliance', 'gate:qa'];
  f.state.specialistPolicy.workflow = 'phased-change';
  f.state.specialistStages = { 'pci-reviewer-prebuild': { role: 'pci-reviewer', phase: 'threat-review' } };
  f.state.specialistPreparation = phase; f.save(); const args = { ...f.args, phase: 'preparation' };
  const b = await reader.readBoundRunBinding(args); assert.equal(b.body.state, 'available');
  unavailable(await reader.readBoundRunProposal({ ...args, focusId: 'fintech-crypto', binding: b.body.binding },
    { projector: () => assert.fail('preparation has no graph') }), 'planning-only-evidence');
});
