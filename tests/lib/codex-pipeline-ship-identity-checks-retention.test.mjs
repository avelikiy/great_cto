import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {runStage} from '../../scripts/lib/codex-pipeline.mjs';
import {stableDigest} from '../../scripts/lib/ship-evidence-identity.mjs';
import {createRun, reassess, generation, gate} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {commit, calls, stored} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

for (const host of ['codex', 'claude-code']) test(`N04 actual ${host} failed configured checks persist exact negative evidence without a fake verifier`, async t => {
  const f = createRun(t, {checks: true, hostRoutes: {'qa-engineer': host, 'security-officer': host}});
  writeFileSync(join(f.root, 'src/app.mjs'), 'export const value = 43;\n'); commit(f, 'synthetic candidate fails actual frozen local check'); reassess(f);
  try {await runStage(f.state, {shipBoundary: f.boundary, save: value => f.boundary.save(value), contextStore: f.runs});} catch { /* overall refusal cannot substitute for retained negative evidence */ }
  const attempt = f.state.attempts.findLast(row => row.role === 'qa-engineer');
  assert.ok(attempt?.checks, 'actual controller ran configured checks'); assert.equal(attempt.checks.state, 'failed'); assert.equal(attempt.checks.code, 1);
  assert.equal(calls(f).filter(row => row.kind === 'worker' && row.host === host).length, 1);
  assert.equal(calls(f).filter(row => row.kind === 'verifier').length, 0, 'failed checks need no fabricated verifier dispatch');
  const persisted = stored(f, f.state.id); assert.equal(persisted.approvals.length, 0); assert.equal(persisted.results['qa-engineer'], undefined);
  const captured = generation(f), result = gate(f); assert.notEqual(result.state, 'PASS');
  const failedDigest = stableDigest(attempt.checks);
  const negative = captured.obligations.find(row => row.role === 'qa-engineer' && row.originRecordDigest === failedDigest && row.origin.rawDigest === failedDigest);
  assert.ok(negative, 'failed call finding must persist exact actual result digest rather than only generic refusal');
  assert.ok(result.result.openObligations.some(row => row.findingId === negative.findingId && row.originRecordDigest === failedDigest), 'known failed-call negative remains visible to source-gate consumers');
  const persistedAttempt = persisted.attempts.find(row => row.id === attempt.id);
  assert.equal(stableDigest(persistedAttempt.checks), failedDigest, 'actual run state retains complete failed-check evidence at the obligation digest');
  assert.equal(captured.records.filter(row => row.role === 'qa-engineer' && row.outcome === 'PASS').length, 0);
});
