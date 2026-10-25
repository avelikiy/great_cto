import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createRun, reassess, gate} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {scenario, readJSON, writeJSON, runFile, sha} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

function inventory(root, prefix = '') {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    const relative = prefix ? `${prefix}/${name}` : name, path = join(root, relative);
    return lstatSync(path).isDirectory() ? inventory(root, relative) : [{path: relative, digest: sha(readFileSync(path))}];
  });
}
for (const failure of ['invalid-policy', 'corrupt-pointer']) test(`N09 ${failure} UNKNOWN retains exact previously captured negative origins without approval fallback`, t => {
  const f = createRun(t);
  const journal = {journalId: 'synthetic-retained-history.log', originId: f.registration.journalOriginId, snapshotId: 'synthetic:retained-snapshot', complete: true,
    records: ['A', 'B'].map(id => ({rawDigest: sha(`retained raw negative ${id}`), outcome: 'FAIL', role: 'qa-engineer',
      rawRecord: {v: 1, agent: 'qa-engineer', verdict: 'FAIL', summary: `SYNTHETIC_PRIVATE_NEGATIVE_${id}`}}))};
  scenario(f, {journals: [journal]}); reassess(f);
  const known = gate(f); assert.equal(known.result.openObligations.length, 2); assert.ok(known.result.openObligations.every(row => row.origin && row.findingId));
  const runBytes = readFileSync(runFile(f, f.state.id));
  const generationPath = join(f.store, 'runs', f.state.id, 'generations', `${f.state.shipEvidence.revision}.json`);
  const generationBytes = readFileSync(generationPath);
  if (failure === 'invalid-policy') writeJSON(f.policyPath, {...readJSON(f.policyPath), approvedBy: 'SYNTHETIC_PRIVATE_NOT_AUTHORITY'});
  else writeJSON(join(f.store, 'runs', f.state.id, 'current.json'), {version: 'ship-store-pointer/v1', generation: f.state.shipEvidence.revision, digest: '0'.repeat(64)});
  const storeBefore = inventory(f.store); const out = gate(f);
  assert.equal(out.state, 'UNKNOWN'); assert.equal(out.contextDigest, null, 'no current validated context is asserted during failed assessment');
  assert.equal(out.publicationEligibility, 'NOT_CHECKED'); assert.equal(out.result.authority, 'NONE'); assert.equal(out.result.releaseEligibility, 'NOT_CHECKED');
  assert.deepEqual(out.result.openObligations, known.result.openObligations, 'exact anchored historical negatives remain visible');
  assert.deepEqual(out.result.resolvedObligations, []); assert.deepEqual(out.result.supersededObligations, []); assert.ok(out.result.mandatoryReviews.every(row => !row.satisfied));
  const text = JSON.stringify(out); assert.ok(!text.includes('SYNTHETIC_PRIVATE_')); assert.ok(!text.includes(f.base));
  assert.deepEqual(readFileSync(runFile(f, f.state.id)), runBytes); assert.deepEqual(readFileSync(generationPath), generationBytes); assert.deepEqual(inventory(f.store), storeBefore);
});
