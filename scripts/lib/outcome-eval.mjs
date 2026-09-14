// Outcome evaluation closes the loop from canonical execution evidence to
// product/release outcomes. Joins are identity-based: timestamps are metadata,
// never a substitute for run_id.

import {
  closeSync, fsyncSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { readEvidence } from './evidence-ledger.mjs';

export const OUTCOME_SCHEMA_VERSION = 1;
export const OUTCOME_LEDGER_FILE = 'outcomes.jsonl';
export const OUTCOME_POLICY_VERSION = 'outcome-policy-v1';
export const OUTCOME_BENCHMARK_VERSION = 'outcome-benchmark-v1';
export const DEFAULT_OUTCOME_THRESHOLDS = Object.freeze({
  min_sample_size: 20,
  min_link_coverage: 0.90,
  max_acceptance_rate_drop: 0.05,
  max_cost_increase: 0.20,
  max_latency_increase: 0.20,
  max_escaped_defect_rate_increase: 0.02,
  max_rollback_rate_increase: 0.02,
  max_gate_override_rate_increase: 0.02,
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]*$/;
const VERSION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const OUTCOMES = new Set(['accepted', 'rejected', 'rolled_back']);
const sleepCell = new Int32Array(new SharedArrayBuffer(4));

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('outcome values must be finite');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('outcome values must be JSON-safe');
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const semanticDigest = (value) => {
  const { occurred_at: _occurredAt, ...semantic } = value;
  return digest(semantic);
};
const requiredId = (value, name, max = 256) => {
  if (typeof value !== 'string' || !value || value.length > max || !IDENTIFIER.test(value)) {
    throw new TypeError(`${name} must be a bounded identifier`);
  }
  return value;
};
const optionalId = (value, name, max = 128) => value == null ? null : requiredId(value, name, max);
const requiredVersionId = (value, name, max = 256) => {
  if (typeof value !== 'string' || !value || value.length > max || !VERSION_IDENTIFIER.test(value)) {
    throw new TypeError(`${name} must be a bounded version identifier`);
  }
  return value;
};
const optionalVersionId = (value, name, max = 256) => {
  if (value == null) return null;
  return requiredVersionId(value, name, max);
};
const nonNegative = (value, name, integer = false) => {
  if (value == null) return 0;
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new TypeError(`${name} must be a non-negative ${integer ? 'integer' : 'number'}`);
  }
  return value;
};

export function normalizeOutcome(entry, { now = new Date() } = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('outcome must be an object');
  const projectId = requiredId(entry.projectId, 'projectId', 128);
  const runId = requiredId(entry.runId, 'runId');
  if (!OUTCOMES.has(entry.outcome)) throw new TypeError('outcome must be accepted, rejected, or rolled_back');
  const date = entry.occurredAt == null ? new Date(now) : new Date(entry.occurredAt);
  if (!Number.isFinite(date.getTime())) throw new TypeError('occurredAt must be a valid date');
  const policyVersion = requiredVersionId(entry.policyVersion || OUTCOME_POLICY_VERSION, 'policyVersion');
  const benchmarkVersion = requiredVersionId(entry.benchmarkVersion || OUTCOME_BENCHMARK_VERSION, 'benchmarkVersion');
  const semantic = {
    v: OUTCOME_SCHEMA_VERSION,
    occurred_at: date.toISOString(),
    project_id: projectId,
    run_id: runId,
    outcome: entry.outcome,
    role: optionalId(entry.role, 'role'),
    host: optionalId(entry.host, 'host', 64),
    model: optionalVersionId(entry.model, 'model'),
    policy_version: policyVersion,
    benchmark_version: benchmarkVersion,
    cost_usd: nonNegative(entry.costUsd, 'costUsd'),
    latency_ms: nonNegative(entry.latencyMs, 'latencyMs', true),
    rework_rounds: nonNegative(entry.reworkRounds, 'reworkRounds', true),
    escaped_defects: nonNegative(entry.escapedDefects, 'escapedDefects', true),
    rollback_count: nonNegative(entry.rollbackCount ?? (entry.outcome === 'rolled_back' ? 1 : 0), 'rollbackCount', true),
    gate_overrides: nonNegative(entry.gateOverrides, 'gateOverrides', true),
  };
  return { ...semantic, outcome_id: `out_${digest([projectId, runId]).slice(0, 32)}` };
}

function persistedOutcome(row) {
  if (row?.v !== OUTCOME_SCHEMA_VERSION) return false;
  try {
    const normalized = normalizeOutcome({
      projectId: row.project_id, runId: row.run_id, occurredAt: row.occurred_at,
      outcome: row.outcome, role: row.role, host: row.host, model: row.model,
      policyVersion: row.policy_version, benchmarkVersion: row.benchmark_version,
      costUsd: row.cost_usd, latencyMs: row.latency_ms, reworkRounds: row.rework_rounds,
      escapedDefects: row.escaped_defects, rollbackCount: row.rollback_count,
      gateOverrides: row.gate_overrides,
    });
    return JSON.stringify(canonical(row)) === JSON.stringify(canonical(normalized));
  } catch { return false; }
}

export function readOutcomes(cwd) {
  const path = join(cwd, '.great_cto', OUTCOME_LEDGER_FILE);
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return { state: 'none', why: 'no outcomes recorded yet', rows: [], invalidLines: 0 };
    return { state: 'unreadable', why: `${path}: ${String(error?.message || error)}`, rows: [], invalidLines: null };
  }
  const rows = [];
  let invalidLines = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (persistedOutcome(row)) rows.push(row); else invalidLines += 1;
    } catch { invalidLines += 1; }
  }
  if (invalidLines) return { state: 'unreadable', why: `${invalidLines} invalid outcome line(s)`, rows, invalidLines };
  return { state: rows.length ? 'some' : 'none', why: rows.length ? `${rows.length} outcome(s)` : 'no outcomes recorded yet', rows, invalidLines: 0 };
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
function acquireLock(path, timeoutMs = 2000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    try { const fd = openSync(path, 'wx', 0o600); writeSync(fd, `${process.pid}\n`); return fd; }
    catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const owner = Number(readFileSync(path, 'utf8'));
        if (Date.now() - statSync(path).mtimeMs > 30000 && !processAlive(owner)) { unlinkSync(path); continue; }
      } catch (readError) { if (readError?.code === 'ENOENT') continue; }
      Atomics.wait(sleepCell, 0, 0, 10);
    }
  }
  const error = new Error(`outcome ledger lock busy after ${timeoutMs}ms`); error.code = 'EBUSY'; throw error;
}

export function appendOutcome(cwd, entry, options = {}) {
  const outcome = normalizeOutcome(entry, options);
  const path = join(cwd, '.great_cto', OUTCOME_LEDGER_FILE);
  const lockPath = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  let lockFd;
  try {
    lockFd = acquireLock(lockPath, options.lockTimeoutMs);
    const current = readOutcomes(cwd);
    if (current.state === 'unreadable') return { state: 'unreadable', why: `cannot prove idempotency: ${current.why}`, outcome: null };
    const prior = current.rows.find((row) => row.outcome_id === outcome.outcome_id);
    if (prior) return semanticDigest(prior) === semanticDigest(outcome)
      ? { state: 'duplicate', why: 'outcome already recorded', outcome: prior }
      : { state: 'conflict', why: `run ${outcome.run_id} already has a different outcome`, outcome: prior };
    const fd = openSync(path, 'a', 0o600);
    try {
      const bytes = Buffer.from(`${JSON.stringify(outcome)}\n`, 'utf8');
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(fd, bytes, offset, bytes.length - offset);
        if (written < 1) throw new Error('outcome ledger append made no progress');
        offset += written;
      }
      fsyncSync(fd);
    } finally { closeSync(fd); }
    return { state: 'appended', why: '', outcome };
  } catch (error) {
    return { state: error?.code === 'EBUSY' ? 'busy' : 'unreadable', why: String(error?.message || error), outcome: null };
  } finally {
    if (lockFd !== undefined) { try { closeSync(lockFd); } catch {} try { unlinkSync(lockPath); } catch {} }
  }
}

function ratio(n, d) { return d ? n / d : null; }
function aggregate(rows) {
  const count = rows.length;
  const accepted = rows.filter((row) => row.outcome === 'accepted').length;
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  return {
    sample_size: count,
    accepted,
    acceptance_rate: ratio(accepted, count),
    cost_usd_total: sum('cost_usd'),
    cost_usd_mean: ratio(sum('cost_usd'), count),
    latency_ms_mean: ratio(sum('latency_ms'), count),
    rework_rounds_total: sum('rework_rounds'),
    escaped_defects: sum('escaped_defects'),
    escaped_defect_rate: ratio(rows.filter((row) => row.escaped_defects > 0).length, count),
    rollbacks: sum('rollback_count'),
    rollback_rate: ratio(rows.filter((row) => row.rollback_count > 0).length, count),
    gate_overrides: sum('gate_overrides'),
    gate_override_rate: ratio(rows.filter((row) => row.gate_overrides > 0).length, count),
  };
}

function dimension(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key] || 'unknown';
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([value, members]) => ({ value, ...aggregate(members) }));
}

export function evaluateOutcomeRows(evidenceRows, outcomeRows, options = {}) {
  const thresholds = { ...DEFAULT_OUTCOME_THRESHOLDS, ...(options.thresholds || {}) };
  const completed = new Map();
  for (const event of evidenceRows) {
    if (event.event_type === 'pipeline.run.completed') completed.set(`${event.project_id}\0${event.run_id}`, event);
  }
  const eligible = [...completed.values()].sort((a, b) => a.project_id.localeCompare(b.project_id) || a.run_id.localeCompare(b.run_id));
  const outcomes = new Map(outcomeRows.map((row) => [`${row.project_id}\0${row.run_id}`, row]));
  const linked = eligible.flatMap((event) => {
    const outcome = outcomes.get(`${event.project_id}\0${event.run_id}`);
    if (!outcome) return [];
    return [{ ...outcome, host: outcome.host || event.host, role: outcome.role || event.agent }];
  }).sort((a, b) => a.project_id.localeCompare(b.project_id) || a.run_id.localeCompare(b.run_id));
  const coverage = ratio(linked.length, eligible.length);
  const sufficient = eligible.length >= thresholds.min_sample_size && coverage !== null && coverage >= thresholds.min_link_coverage;
  const dataset = {
    schema_version: OUTCOME_SCHEMA_VERSION,
    benchmark_version: options.benchmarkVersion || OUTCOME_BENCHMARK_VERSION,
    policy_version: options.policyVersion || OUTCOME_POLICY_VERSION,
    eligible_runs: eligible.map((row) => ({ project_id: row.project_id, run_id: row.run_id })),
    outcomes: linked,
  };
  return {
    state: sufficient ? 'measured' : 'insufficient_data',
    why: eligible.length < thresholds.min_sample_size
      ? `sample size ${eligible.length} is below ${thresholds.min_sample_size}`
      : coverage === null ? 'no eligible completed runs'
        : coverage < thresholds.min_link_coverage ? `link coverage ${(coverage * 100).toFixed(1)}% is below ${(thresholds.min_link_coverage * 100).toFixed(0)}%`
          : 'sample and coverage thresholds met',
    schema_version: OUTCOME_SCHEMA_VERSION,
    benchmark_version: dataset.benchmark_version,
    policy_version: dataset.policy_version,
    dataset_revision: digest(dataset),
    thresholds,
    coverage: { eligible: eligible.length, linked: linked.length, ratio: coverage },
    metrics: aggregate(linked),
    dimensions: {
      role: dimension(linked, 'role'), host: dimension(linked, 'host'), model: dimension(linked, 'model'),
      policy_version: dimension(linked, 'policy_version'), benchmark_version: dimension(linked, 'benchmark_version'),
    },
    recommendations: sufficient ? recommendationsFor(linked) : [],
    mutation: { applied: false, why: 'recommendations require explicit operator approval' },
  };
}

function recommendationsFor(rows) {
  const candidates = [];
  for (const group of dimension(rows, 'model')) {
    if (group.sample_size >= 10 && group.acceptance_rate < 0.8) {
      candidates.push({ action: 'review_model_routing', target: group.value, reason: `acceptance ${(group.acceptance_rate * 100).toFixed(1)}% across n=${group.sample_size}` });
    }
  }
  for (const group of dimension(rows, 'policy_version')) {
    if (group.sample_size >= 10 && (group.rollback_rate > 0.02 || group.escaped_defect_rate > 0.02)) {
      candidates.push({ action: 'review_policy', target: group.value, reason: `quality regression across n=${group.sample_size}` });
    }
  }
  return candidates;
}

export function outcomeEvaluation(cwd, options = {}) {
  const evidence = readEvidence(cwd);
  if (evidence.state === 'unreadable') return { state: 'unreadable', why: evidence.why, coverage: { eligible: 0, linked: 0, ratio: null }, recommendations: [] };
  const outcomes = readOutcomes(cwd);
  if (outcomes.state === 'unreadable') return { state: 'unreadable', why: outcomes.why, coverage: { eligible: 0, linked: 0, ratio: null }, recommendations: [] };
  return evaluateOutcomeRows(evidence.rows, outcomes.rows, options);
}

const delta = (candidate, baseline) => baseline === 0 ? (candidate === 0 ? 0 : Number.MAX_VALUE) : (candidate - baseline) / baseline;
export function evaluateReleaseRegression(baselineRows, candidateRows, options = {}) {
  for (const [name, rows] of [['baseline', baselineRows], ['candidate', candidateRows]]) {
    if (!Array.isArray(rows)) throw new TypeError(`${name} must be an outcome array`);
    const identities = new Set();
    for (const row of rows) {
      if (!persistedOutcome(row)) throw new TypeError(`${name} contains a non-canonical outcome`);
      const identity = `${row.project_id}\0${row.run_id}`;
      if (identities.has(identity)) throw new TypeError(`${name} contains duplicate run ${row.run_id}`);
      identities.add(identity);
    }
  }
  const thresholds = { ...DEFAULT_OUTCOME_THRESHOLDS, ...(options.thresholds || {}) };
  const baseline = aggregate(baselineRows);
  const candidate = aggregate(candidateRows);
  if (baseline.sample_size < thresholds.min_sample_size || candidate.sample_size < thresholds.min_sample_size) {
    return { state: 'insufficient_data', passed: false, why: 'baseline and candidate must both meet minimum sample size', thresholds, baseline, candidate, regressions: [] };
  }
  const checks = [
    ['acceptance_rate', baseline.acceptance_rate - candidate.acceptance_rate, thresholds.max_acceptance_rate_drop],
    ['cost_usd_mean', delta(candidate.cost_usd_mean, baseline.cost_usd_mean), thresholds.max_cost_increase],
    ['latency_ms_mean', delta(candidate.latency_ms_mean, baseline.latency_ms_mean), thresholds.max_latency_increase],
    ['escaped_defect_rate', candidate.escaped_defect_rate - baseline.escaped_defect_rate, thresholds.max_escaped_defect_rate_increase],
    ['rollback_rate', candidate.rollback_rate - baseline.rollback_rate, thresholds.max_rollback_rate_increase],
    ['gate_override_rate', candidate.gate_override_rate - baseline.gate_override_rate, thresholds.max_gate_override_rate_increase],
  ];
  const regressions = checks.filter(([, observed, limit]) => observed > limit)
    .map(([metric, observed, limit]) => ({ metric, observed, limit }));
  return { state: regressions.length ? 'regressed' : 'passed', passed: !regressions.length, why: regressions.length ? `${regressions.length} threshold(s) exceeded` : 'all regression thresholds passed', thresholds, baseline, candidate, regressions };
}
