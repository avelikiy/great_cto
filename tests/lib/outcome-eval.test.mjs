import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendEvidence } from '../../scripts/lib/evidence-ledger.mjs';
import {
  appendOutcome, evaluateOutcomeRows, evaluateReleaseRegression, normalizeOutcome, outcomeEvaluation, readOutcomes,
} from '../../scripts/lib/outcome-eval.mjs';

const evidence = (run, project = 'project') => ({
  v: 1, event_id: `evt_${run.padEnd(32, '0').slice(0, 32)}`, event_type: 'pipeline.run.completed',
  occurred_at: '2026-09-14T10:00:00.000Z', project_id: project, run_id: run,
  stage_id: null, attempt: null, host: 'codex', agent: 'reviewer', gate_id: null,
  parent_event_id: null, idempotency_key: `${run}:done`, state: 'completed', reason: null,
  diff_sha: null, artifact_sha: null, details: {},
});
const outcome = (run, overrides = {}) => {
  const row = {
    occurred_at: '2026-09-14T10:00:00.000Z', project_id: 'project', run_id: run,
    outcome: 'accepted', role: 'reviewer', host: 'codex', model: 'gpt-5',
    policy_version: 'policy-v1', benchmark_version: 'bench-v1', cost_usd: 1,
    latency_ms: 100, rework_rounds: 0, escaped_defects: 0, rollback_count: 0, gate_overrides: 0,
    ...overrides,
  };
  return normalizeOutcome({
    projectId: row.project_id, runId: row.run_id, occurredAt: row.occurred_at, outcome: row.outcome,
    role: row.role, host: row.host, model: row.model, policyVersion: row.policy_version,
    benchmarkVersion: row.benchmark_version, costUsd: row.cost_usd, latencyMs: row.latency_ms,
    reworkRounds: row.rework_rounds, escapedDefects: row.escaped_defects,
    rollbackCount: row.rollback_count, gateOverrides: row.gate_overrides,
  });
};

test('outcomes join only by project and run identity, never timestamp proximity', () => {
  const result = evaluateOutcomeRows([evidence('run-a'), evidence('run-b')], [
    outcome('run-a'), outcome('run-nearby', { occurred_at: '2026-09-14T10:00:00.000Z' }),
  ], { thresholds: { min_sample_size: 1, min_link_coverage: 0.5 } });
  assert.equal(result.coverage.eligible, 2);
  assert.equal(result.coverage.linked, 1);
  assert.equal(result.coverage.ratio, 0.5);
  assert.equal(result.metrics.sample_size, 1);
});

test('coverage boundary is 90 percent and sample size is explicit', () => {
  const events = Array.from({ length: 20 }, (_, i) => evidence(`run-${i}`));
  const eighteen = Array.from({ length: 18 }, (_, i) => outcome(`run-${i}`));
  const seventeen = eighteen.slice(0, 17);
  assert.equal(evaluateOutcomeRows(events, eighteen).state, 'measured');
  const low = evaluateOutcomeRows(events, seventeen);
  assert.equal(low.state, 'insufficient_data');
  assert.match(low.why, /85\.0%/);
  assert.equal(evaluateOutcomeRows(events.slice(0, 19), eighteen).state, 'insufficient_data');
});

test('dataset revision is deterministic across append order', () => {
  const events = [evidence('run-b'), evidence('run-a')];
  const outcomes = [outcome('run-b'), outcome('run-a')];
  const a = evaluateOutcomeRows(events, outcomes, { thresholds: { min_sample_size: 1 } });
  const b = evaluateOutcomeRows([...events].reverse(), [...outcomes].reverse(), { thresholds: { min_sample_size: 1 } });
  assert.equal(a.dataset_revision, b.dataset_revision);
  assert.match(a.dataset_revision, /^[a-f0-9]{64}$/);
});

test('recommendations never mutate policy files', () => {
  const root = mkdtempSync(join(tmpdir(), 'gcto-outcome-policy-'));
  try {
    mkdirSync(join(root, '.great_cto'));
    const policy = join(root, '.great_cto', 'PROJECT.md');
    writeFileSync(policy, 'second-opinion: codex\n');
    const before = readFileSync(policy, 'utf8');
    const events = Array.from({ length: 20 }, (_, i) => evidence(`run-${i}`));
    const outcomes = Array.from({ length: 20 }, (_, i) => outcome(`run-${i}`, { outcome: i < 10 ? 'accepted' : 'rejected' }));
    const result = evaluateOutcomeRows(events, outcomes);
    assert.equal(result.mutation.applied, false);
    assert.ok(result.recommendations.some((row) => row.action === 'review_model_routing'));
    assert.equal(readFileSync(policy, 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('release gate blocks regressions and refuses undersized datasets', () => {
  const baseline = Array.from({ length: 20 }, (_, i) => outcome(`base-${i}`));
  const candidate = Array.from({ length: 20 }, (_, i) => outcome(`candidate-${i}`, {
    outcome: i < 14 ? 'accepted' : 'rejected', cost_usd: 1.3, latency_ms: 130,
    escaped_defects: i < 2 ? 1 : 0, rollback_count: i === 0 ? 1 : 0,
  }));
  const blocked = evaluateReleaseRegression(baseline, candidate);
  assert.equal(blocked.state, 'regressed');
  assert.equal(blocked.passed, false);
  assert.ok(blocked.regressions.some((row) => row.metric === 'acceptance_rate'));
  assert.ok(blocked.regressions.some((row) => row.metric === 'cost_usd_mean'));
  assert.equal(evaluateReleaseRegression(baseline.slice(0, 19), candidate).state, 'insufficient_data');
  assert.throws(() => evaluateReleaseRegression([...baseline, baseline[0]], candidate), /duplicate run/);
});

test('release gate CLI returns non-zero for a regression', () => {
  const root = mkdtempSync(join(tmpdir(), 'gcto-outcome-gate-'));
  try {
    const baseline = Array.from({ length: 20 }, (_, i) => outcome(`base-${i}`));
    const candidate = Array.from({ length: 20 }, (_, i) => outcome(`candidate-${i}`, {
      outcome: i < 14 ? 'accepted' : 'rejected', cost_usd: 1.3,
    }));
    const baselinePath = join(root, 'baseline.json');
    const candidatePath = join(root, 'candidate.json');
    writeFileSync(baselinePath, JSON.stringify({ outcomes: baseline }));
    writeFileSync(candidatePath, JSON.stringify({ outcomes: candidate }));
    const result = spawnSync(process.execPath, ['scripts/outcome-eval.mjs', 'gate', '--baseline', baselinePath, '--candidate', candidatePath], {
      cwd: new URL('../..', import.meta.url), encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).state, 'regressed');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('append is idempotent, conflict-safe, and corrupt ledgers never look measured', () => {
  const root = mkdtempSync(join(tmpdir(), 'gcto-outcomes-'));
  try {
    appendEvidence(root, { eventType: 'pipeline.run.completed', projectId: 'project', runId: 'run-1',
      host: 'codex', idempotencyKey: 'run-1:done', state: 'completed' });
    const entry = { projectId: 'project', runId: 'run-1', outcome: 'accepted', model: 'openai/gpt-5' };
    assert.equal(appendOutcome(root, entry, { now: new Date('2026-09-14T10:00:00Z') }).state, 'appended');
    assert.equal(appendOutcome(root, entry, { now: new Date('2026-09-15T10:00:00Z') }).state, 'duplicate');
    assert.equal(appendOutcome(root, { ...entry, outcome: 'rejected' }).state, 'conflict');
    assert.equal(outcomeEvaluation(root).state, 'insufficient_data');
    writeFileSync(join(root, '.great_cto', 'outcomes.jsonl'), 'torn\n');
    assert.equal(readOutcomes(root).state, 'unreadable');
    assert.equal(outcomeEvaluation(root).state, 'unreadable');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
