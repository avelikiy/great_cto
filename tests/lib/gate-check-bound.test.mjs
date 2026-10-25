import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {evaluateBoundGate, createShipControllerBoundary} from '../../scripts/lib/gate-check-bound.mjs';
import {stableDigest} from '../../scripts/lib/ship-evidence-identity.mjs';
import {createRun, reassess, reviewAll, gate, generation, readers} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {scenario, calls, runFile, stored, readJSON, writeJSON, sha, invokeBound} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

test('P07 exact actual wrapper completions satisfy bound source only; outer fixture/publication authority stays NONE', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); const result = gate(f);
  assert.equal(result.state, 'PASS'); assert.equal(result.version, 'ship-bound-gate/v1'); assert.equal(result.publicationEligibility, 'NOT_CHECKED');
  assert.equal(result.result.authority, 'NONE'); assert.equal(result.result.releaseEligibility, 'NOT_CHECKED'); assert.equal(result.result.evidenceClass, 'LOCAL_FIXTURE');
  const data = generation(f); assert.equal(data.records.length, 2); assert.equal(data.completionDigests.length, 2);
  assert.ok(data.records.every(r => r.evidenceClass === 'SOURCE_REVIEW' && r.authority === 'CONTROLLED_REVIEW'));
  assert.equal(calls(f).filter(c => c.kind === 'verifier').length, 2);
});
test('N11 all seven foreign blocked tasks, blocking labels and two historical negatives survive wrapper PASS', async t => {
  const f = createRun(t);
  const tasks = Array.from({length: 7}, (_, i) => ({id: `foreign:${i}`, status: 'blocked', labels: []}));
  tasks.push({id: 'foreign:label', status: 'open', labels: ['state:blocked']});
  const journal = {journalId: 'historical.log', originId: f.registration.journalOriginId, snapshotId: 'snap:one', complete: true,
    records: ['A', 'B'].map(id => ({rawDigest: sha(`negative:${id}`), outcome: 'FAIL', role: 'qa-engineer', rawRecord: {v: 1, agent: 'qa-engineer', verdict: 'FAIL'}}))};
  scenario(f, {tasks, journals: [journal]});
  reassess(f); await reviewAll(f);
  const before = readFileSync(runFile(f, f.state.id)); const result = gate(f);
  assert.notEqual(result.state, 'PASS'); assert.equal(result.publicationEligibility, 'NOT_CHECKED');
  assert.deepEqual(readFileSync(runFile(f, f.state.id)), before, 'read-only evaluation cannot persist registry changes');
  assert.equal(result.result.openObligations.length, 2);
  assert.equal(result.result.blockingTasks.length, 8);
});
test('N09 unreadable tasks/journals, malformed labels and policy drift refuse without private raw output', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f);
  for (const delta of [{taskReadError: true}, {journalReadError: true}, {tasks: [{id: 'x', status: 'open', labels: 'SYNTHETIC_PRIVATE_SECRET'}]}]) {
    scenario(f, {taskReadError: false, journalReadError: false, tasks: [], ...delta}); const out = gate(f); assert.equal(out.state, 'UNKNOWN');
    assert.ok(!JSON.stringify(out).includes('SYNTHETIC_PRIVATE_SECRET')); assert.ok(!JSON.stringify(out).includes(f.base));
  }
  scenario(f, {tasks: []}); writeJSON(f.policyPath, {...f.policy, assignmentLifetimeMs: f.policy.assignmentLifetimeMs + 1}); assert.notEqual(gate(f).state, 'PASS');
});
test('N15 persisted generation/pointer mismatches and stale expectedRevision fail closed', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f);
  const stale = evaluateBoundGate({root: f.root, store: f.store, runId: f.state.id, expectedRevision: f.state.shipEvidence.revision - 1}, {runStore: f.runs, ...readers(f)}); assert.equal(stale.state, 'UNKNOWN');
  const pointer = join(f.store, 'runs', f.state.id, 'current.json'); const old = readFileSync(pointer); writeJSON(pointer, {version: 'ship-store-pointer/v1', generation: 1, digest: '0'.repeat(64)}); assert.equal(gate(f).state, 'UNKNOWN'); writeFileSync(pointer, old);
  const path = join(f.store, 'runs', f.state.id, 'generations', `${f.state.shipEvidence.revision}.json`); const bytes = readFileSync(path); writeFileSync(path, '{}'); assert.equal(gate(f).state, 'UNKNOWN'); writeFileSync(path, bytes);
});
test('P07 bound real CLI exits0 only exact current source; --as stays diagnostic exit2 and fake trust flags refuse', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); f.release();
  const good = invokeBound(f, f.state.id, f.state.shipEvidence.revision); assert.equal(good.status, 0, good.stderr); assert.equal(JSON.parse(good.stdout).state, 'PASS');
  for (const flags of [['--as', 'security-officer'], ['--expected', '{}'], ['--trusted'], ['--role', 'security-officer']]) assert.equal(invokeBound(f, f.state.id, f.state.shipEvidence.revision, flags).status, 2);
  writeFileSync(join(f.root, 'src/app.mjs'), 'drift'); const moved = invokeBound(f, f.state.id, f.state.shipEvidence.revision); assert.equal(moved.status, 2); assert.ok(!moved.stdout.includes(f.root));
});
test('N09 actual CLI reads fake bd failure as UNKNOWN and never contacts real DB', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); f.release(); scenario(f, {taskReadError: true});
  const out = invokeBound(f, f.state.id, f.state.shipEvidence.revision); assert.equal(out.status, 2); assert.equal(JSON.parse(out.stdout).state, 'UNKNOWN');
  assert.ok(readFileSync(f.bdCallsPath, 'utf8').includes('list')); assert.ok(!out.stdout.includes('SYNTHETIC_PRIVATE_TASK_READ_ERROR'));
});
test('P03/N07 persisted origin IDs survive resnapshot/append and truncation retains both negative occurrences', async t => {
  const f = createRun(t);
  const record = {rawDigest: sha('identical historical negative'), outcome: 'FAIL', role: 'qa-engineer', rawRecord: {v: 1, agent: 'qa-engineer', verdict: 'FAIL'}};
  const journal = {journalId: 'legacy.log', originId: f.registration.journalOriginId, snapshotId: 'snapshot:first', complete: true, records: [record, record]};
  scenario(f, {journals: [journal]}); reassess(f); await reviewAll(f);
  const before = gate(f).result.openObligations; assert.equal(before.length, 2); assert.equal(new Set(before.map(row => row.findingId)).size, 2);
  scenario(f, {journals: [{...journal, snapshotId: 'snapshot:second', records: [...journal.records, {rawDigest: sha('generic positive'), outcome: 'PASS', role: 'qa-engineer', rawRecord: {v: 1, agent: 'qa-engineer', verdict: 'PASS'}}]}]});
  f.boundary.save(f.state);
  assert.deepEqual(gate(f).result.openObligations.map(row => row.findingId), before.map(row => row.findingId));
  scenario(f, {journals: [{...journal, snapshotId: 'snapshot:truncated', records: []}]}); const truncated = gate(f);
  assert.equal(truncated.state, 'UNKNOWN'); assert.deepEqual(truncated.result.openObligations.map(row => row.findingId), before.map(row => row.findingId));
});
test('N09 actual journal malformed sibling yields UNKNOWN without exposing raw private bytes', async t => {
  const f = createRun(t); reassess(f); await reviewAll(f); f.release();
  writeFileSync(join(f.journals, 'qa-engineer.log'), 'SYNTHETIC_PRIVATE_REJECTED_LINE {not-json}\n', {mode: 0o600});
  const out = invokeBound(f, f.state.id, f.state.shipEvidence.revision); assert.equal(out.status, 2); assert.equal(JSON.parse(out.stdout).state, 'UNKNOWN');
  assert.ok(!out.stdout.includes('SYNTHETIC_PRIVATE_REJECTED_LINE')); assert.ok(!out.stdout.includes(f.journals));
});
