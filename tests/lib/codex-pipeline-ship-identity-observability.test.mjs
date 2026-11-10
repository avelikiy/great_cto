import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createRun, reassess, reviewAll, gate, generation} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {stored, calls, scenario, git, sha} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';
import {canonical} from '../fixtures/ship-evidence-identity/synthetic.mjs';

function inventory(root, prefix = '') {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const relative = prefix ? `${prefix}/${name}` : name, path = join(root, relative);
    const stat = lstatSync(path);
    return stat.isDirectory() ? inventory(root, relative) : [{path: relative, digest: sha(readFileSync(path))}];
  });
}

for (const host of ['codex', 'claude-code']) test(`P06 actual ${host} bound route with events flag unset preserves clean source and external traces`, async t => {
  const f = createRun(t, {hostRoutes: {'qa-engineer': host, 'security-officer': host}}); reassess(f);
  const projectMetadata = inventory(join(f.root, '.great_cto')), home = inventory(f.home);
  const head = git(f, 'rev-parse', 'HEAD'), tree = git(f, 'rev-parse', 'HEAD^{tree}');
  // Deliberately remove only this fixture process's opt-out. No consent/settings are changed.
  delete process.env.GREAT_CTO_DISABLE_EVENTS;
  assert.equal(Object.hasOwn(process.env, 'GREAT_CTO_DISABLE_EVENTS'), false);
  let failure; try {await reviewAll(f);} catch (error) {failure = error;}
  assert.deepEqual(inventory(join(f.root, '.great_cto')), projectMetadata, 'bound invocation cannot append workspace event feeds');
  assert.equal(git(f, 'status', '--porcelain=v1', '--untracked-files=all'), '', 'bound run must not dirty the reviewed candidate');
  assert.equal(git(f, 'rev-parse', 'HEAD'), head); assert.equal(git(f, 'rev-parse', 'HEAD^{tree}'), tree);
  assert.deepEqual(inventory(f.home), home, 'no global consent/settings mutation even inside isolated fixture home');
  assert.ifError(failure); assert.equal(gate(f).state, 'PASS');
  const persisted = stored(f, f.state.id);
  assert.equal(persisted.dispatchEvidence.completeHistory, true);
  assert.equal(persisted.dispatchEvidence.records.filter(row => row.kind === 'worker' && row.host === host && row.outcome === 'returned').length, 2);
  assert.equal(persisted.dispatchEvidence.records.filter(row => row.kind === 'verifier' && row.host === 'codex' && row.outcome === 'returned').length, 2);
  assert.equal(persisted.executionTrace.complete, true); assert.ok(persisted.executionTrace.nodes.length > 0); assert.ok(persisted.executionTrace.edges.length > 0);
  assert.equal(calls(f).filter(row => row.kind === 'worker').length, 2); assert.equal(calls(f).filter(row => row.kind === 'verifier').length, 2);
});

test('P07 reported generation snapshot digests address complete canonical raw task and journal payloads', t => {
  const f = createRun(t);
  const tasks = [{id: 'synthetic:closed-raw-task', status: 'closed', labels: ['synthetic:raw-preserved'], title: 'SYNTHETIC_PRIVATE_TASK_TITLE', description: 'complete raw task payload survives content addressing'}];
  const rawRecord = {v: 1, agent: 'qa-engineer', verdict: 'PASS', summary: 'SYNTHETIC_PRIVATE_LEGACY_SUMMARY'};
  const journals = [{journalId: 'synthetic-raw-journal.log', originId: f.registration.journalOriginId, snapshotId: 'synthetic:snapshot:complete', complete: true,
    records: [{rawDigest: sha(JSON.stringify(rawRecord)), outcome: 'PASS', role: 'qa-engineer', rawRecord}]}];
  scenario(f, {tasks, journals}); reassess(f);
  const data = generation(f);
  for (const [field, payload] of [['taskSnapshotDigest', tasks], ['journalSnapshotDigest', journals]]) {
    assert.match(data[field], /^[a-f0-9]{64}$/);
    const path = join(f.store, 'runs', f.state.id, 'blobs', `${data[field]}.json`);
    const bytes = readFileSync(path);
    assert.equal(bytes.toString('utf8'), canonical(payload), `${field} names actual canonical complete payload bytes`);
    assert.equal(sha(bytes), data[field], `${field} hash matches referenced blob`);
    assert.deepEqual(JSON.parse(bytes), payload, `${field} retains full raw metadata, not normalized subset/wrapper`);
  }
  const report = gate(f); const publicText = JSON.stringify(report);
  assert.ok(!publicText.includes('SYNTHETIC_PRIVATE_TASK_TITLE')); assert.ok(!publicText.includes('SYNTHETIC_PRIVATE_LEGACY_SUMMARY')); assert.ok(!publicText.includes(f.base));
});
