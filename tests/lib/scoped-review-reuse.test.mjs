import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { scopedReviewInput, attestScopedReview, scopedReviewCandidate } from '../../scripts/lib/scoped-review-reuse.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'scoped-review-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'project');
  const put = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  put('src/auth.mjs', 'export const secure = true;');
  put('.great_cto/PROJECT.md', 'archetype: fintech\n');
  put('.gitignore', 'ignored.txt\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  const role = 'pci-reviewer';
  const state = { id: 'prior-run', root, graphHash: 'frozen-graph', prompt: 'Review payment boundary',
    graph: { [role]: { on: ['PASS'], produces: ['report'], gate: ['gate:ship'] } },
    specialistPolicy: { workflow: 'existing-change' }, specialistReview: { roles: [role] },
    writes: {}, attempts: [], results: {}, approvals: [{ gate: 'gate:ship' }] };
  const dependencies = ['src/auth.mjs'];
  const input = scopedReviewInput(state, role, dependencies);
  const report = 'docs/specialist-reviews/pci.md'; put(report, 'No card-data processing; inspect auth boundary.');
  state.writes[report] = sha(readFileSync(join(root, report)));
  const verification = { state: 'verified', findings: [], checks: ['read report and source'],
    dependencyAttestation: { state: 'complete', inputDigest: input.digest, checks: ['traced imports and checked project inventory'] } };
  const result = { attemptId: 'original-attempt', digest: 'result-digest', verdict: 'PASS', meta: { report }, verification };
  state.attempts.push({ id: result.attemptId, role, status: 'verified', proposalDigest: 'proposal-digest', verification });
  state.results[role] = result;
  const save = () => {
    const path = join(directory, 'prior.json'), raw = JSON.stringify(state); writeFileSync(path, raw);
    return { path, sha256: sha(raw) };
  };
  const mint = () => { result.scopedReview = attestScopedReview(state, role, input, result); return save(); };
  return { state, role, input, result, dependencies, root, directory, put, save, mint,
    next: () => ({ ...structuredClone(state), id: 'next-run', results: {}, approvals: [], attempts: [] }) };
}

test('candidate requires fresh attestation and never imports prior approvals/results', t => {
  const f = fixture(t), source = f.mint(), next = f.next();
  const candidate = scopedReviewCandidate(next, f.role, f.dependencies, source);
  assert.equal(candidate.requiresFreshAttestation, true); assert.equal(candidate.gateAuthority, false);
  assert.match(candidate.content, /No card-data/);
  assert.equal(candidate.prior.runId, 'prior-run');
  assert.deepEqual(next.results, {}); assert.deepEqual(next.approvals, []);
});

for (const field of ['task', 'project', 'contract', 'graph', 'phase', 'acceptance', 'checks-policy', 'dependency']) {
  test(`changed ${field} refuses prior scoped evidence`, t => {
    const f = fixture(t), source = f.mint(), next = f.next();
    if (field === 'task') next.prompt += ' new task';
    if (field === 'project') f.put('.great_cto/PROJECT.md', 'archetype: web-service');
    if (field === 'contract') next.graph[f.role].gate.push('gate:security');
    if (field === 'graph') next.graphHash = 'changed';
    if (field === 'phase') next.specialistStages = { [f.role]: { role: f.role, phase: 'threat-review' } };
    if (field === 'acceptance') next.acceptance = ['new acceptance'];
    if (field === 'checks-policy') next.checkPolicy = { required: ['new-check'] };
    if (field === 'dependency') f.put('src/auth.mjs', 'export const secure = false;');
    assert.throws(() => scopedReviewCandidate(next, f.role, f.dependencies, source), /matching independently scoped/);
  });
}

for (const role of ['code-reviewer', 'qa-engineer', 'security-officer', 'ai-eval-engineer']) {
  test(`mandatory ${role} is never reusable`, t => {
    const f = fixture(t); f.state.specialistReview.roles.push(role);
    assert.throws(() => scopedReviewInput(f.state, role, f.dependencies), /not eligible/);
  });
}

test('plain verified does not attest dependency completeness', t => {
  const f = fixture(t); delete f.result.verification.dependencyAttestation;
  assert.throws(() => attestScopedReview(f.state, f.role, f.input, f.result), /complete dependency attestation/);
});
test('mismatched/empty completeness checks and failed required checks cannot mint', t => {
  const f = fixture(t), a = f.result.verification.dependencyAttestation;
  a.inputDigest = 'different';
  assert.throws(() => attestScopedReview(f.state, f.role, f.input, f.result), /attestation/);
  a.inputDigest = f.input.digest; a.checks = [''];
  assert.throws(() => attestScopedReview(f.state, f.role, f.input, f.result), /attestation/);
  a.checks = ['inspected']; f.result.checks = { state: 'failed' };
  assert.throws(() => attestScopedReview(f.state, f.role, f.input, f.result), /checks not passed/);
});
test('edited report and altered prior pin cannot be reused', t => {
  const f = fixture(t), source = f.mint(), next = f.next();
  f.put(f.result.meta.report, 'edited');
  assert.throws(() => scopedReviewCandidate(next, f.role, f.dependencies, source), /controller-bound/);
  writeFileSync(source.path, '{}');
  assert.throws(() => scopedReviewCandidate(next, f.role, f.dependencies, source), /pin changed/);
});
test('in-workspace prior state and symlink evidence refused', t => {
  const f = fixture(t), source = f.mint(), next = f.next();
  const raw = readFileSync(source.path); f.put('prior.json', raw);
  assert.throws(() => scopedReviewCandidate(next, f.role, f.dependencies, { path: join(f.root, 'prior.json'), sha256: sha(raw) }), /outside worker/);
  rmSync(join(f.root, 'src/auth.mjs')); symlinkSync(source.path, join(f.root, 'src/auth.mjs'));
  assert.throws(() => scopedReviewInput(next, f.role, f.dependencies), /symlink/);
});
test('missing, untracked, ignored, duplicate and escaping inputs refused', t => {
  const f = fixture(t);
  f.put('untracked.txt', 'input'); f.put('ignored.txt', 'input');
  for (const dependencies of [[], ['src/auth.mjs', 'src/auth.mjs'], ['../escape'], ['untracked.txt'], ['ignored.txt'], ['missing.txt']]) {
    assert.throws(() => scopedReviewInput(f.state, f.role, dependencies));
  }
  rmSync(join(f.root, 'src/auth.mjs'));
  assert.throws(() => scopedReviewInput(f.state, f.role, f.dependencies), /ENOENT/);
});
test('reused attempts cannot mint a recursive evidence chain', t => {
  const f = fixture(t); f.state.attempts[0].reuse = { prior: 'older-run' };
  assert.throws(() => attestScopedReview(f.state, f.role, f.input, f.result), /original independently verified/);
});
test('force-tracked ignored input is still refused', t => {
  const f = fixture(t); f.put('ignored.txt', 'forced tracked runtime input');
  execFileSync('git', ['add', '-f', 'ignored.txt'], { cwd: f.root });
  assert.throws(() => scopedReviewInput(f.state, f.role, ['ignored.txt']), /ignored dependency/);
});
test('input changes during fresh verifier inspection refuse minting', t => {
  const f = fixture(t); f.put('src/auth.mjs', 'changed while verifier ran');
  assert.throws(() => attestScopedReview(f.state, f.role, f.input, f.result), /changed during attestation/);
});
