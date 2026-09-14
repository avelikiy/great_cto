// Deterministic read model over the canonical Evidence Ledger.
//
// The projection is deliberately pure: the same validated event set produces
// the same runs, stages and gates regardless of append order. A corrupt ledger
// never yields a partial success projection; callers get `unreadable` and empty
// materialized collections instead.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEvidence } from './evidence-ledger.mjs';
import { readRuns } from './pipeline-journal.mjs';
import { parseVerdictLog } from './verdict-record.mjs';

const UNCERTAIN = new Set(['not_run', 'unknown', 'unreadable', 'unmeasured']);
const clampLimit = (value) => Math.max(1, Math.min(500, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 100));
const byTimeAndId = (a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)) || String(a.event_id).localeCompare(String(b.event_id));
const revisionOf = (events) => createHash('sha256').update(JSON.stringify(events)).digest('hex');
const provenance = (revision = null) => ({
  source: '.great_cto/evidence-ledger.jsonl',
  schema_version: 1,
  mode: 'dual-write-parity',
  revision,
});

function empty(state, why, invalidLines = 0) {
  return {
    state, why, invalid_lines: invalidLines,
    revision: null,
    provenance: provenance(),
    summary: {
      events: 0, pipeline_runs: 0, stages: 0, pending_gates: 0,
      verdicts: 0, dispatcher_decisions: 0, blocked: 0, failed: 0, uncertain: 0,
    },
    runs: [], decisions: [], harnesses: [], fleet: [], receipts: [], events: [], degraded: [],
    migration: { state: 'unmeasured', comparison: 'count-only', sources: {} },
  };
}

function migrationView(cwd, canonical) {
  const sources = {};
  const runs = readRuns(cwd);
  sources.dispatcher = {
    state: runs.state,
    legacy: runs.rows.length,
    canonical: canonical.dispatcher_decisions,
  };

  let verdictState = 'none';
  let verdictCount = 0;
  let rejected = 0;
  try {
    const dir = join(cwd, '.great_cto', 'verdicts');
    const files = readdirSync(dir).filter((name) => name.endsWith('.log')).sort();
    verdictState = files.length ? 'some' : 'none';
    for (const name of files) {
      const parsed = parseVerdictLog(readFileSync(join(dir, name), 'utf8'), { agent: name.replace(/\.log$/, '') });
      verdictCount += parsed.records.length;
      rejected += parsed.rejected.length;
    }
    if (rejected) verdictState = verdictCount ? 'degraded' : 'unreadable';
  } catch (error) {
    if (error?.code !== 'ENOENT') verdictState = 'unreadable';
  }
  sources.verdicts = { state: verdictState, legacy: verdictCount, canonical: canonical.verdicts, rejected };

  for (const source of Object.values(sources)) {
    source.legacy_only = Math.max(0, source.legacy - source.canonical);
    source.canonical_only = Math.max(0, source.canonical - source.legacy);
  }
  const unreadable = Object.values(sources).some((source) => source.state === 'unreadable');
  const mismatch = Object.values(sources).some((source) => source.legacy !== source.canonical);
  return {
    state: unreadable ? 'unreadable' : mismatch ? 'mismatch' : 'count-match',
    comparison: 'count-only',
    why: unreadable
      ? 'at least one legacy source is unreadable'
      : mismatch ? 'canonical and legacy event counts differ' : 'counts match; semantic parity is not yet proven',
    sources,
  };
}

function ensureRun(runs, event) {
  if (!runs.has(event.run_id)) {
    runs.set(event.run_id, {
      run_id: event.run_id,
      host: event.host,
      state: 'unknown',
      started_at: event.occurred_at,
      updated_at: event.occurred_at,
      reason: null,
      stages: new Map(),
      gates: new Map(),
    });
  }
  const run = runs.get(event.run_id);
  if (!run.host && event.host) run.host = event.host;
  if (event.occurred_at < run.started_at) run.started_at = event.occurred_at;
  if (event.occurred_at > run.updated_at) run.updated_at = event.occurred_at;
  return run;
}

/** Project already-validated rows. Input is never mutated. */
export function projectEvidenceRows(rows = [], { limit = 100 } = {}) {
  const events = [...rows].sort(byTimeAndId);
  if (!events.length) return empty('none', 'no evidence recorded yet');

  const runs = new Map();
  const harnesses = new Map();
  const fleet = new Map();
  const degraded = [];
  let verdicts = 0;
  let dispatcherDecisions = 0;
  let blocked = 0;
  let failed = 0;
  let uncertain = 0;

  for (const event of events) {
    if (event.event_type === 'agent.verdict.recorded') verdicts += 1;
    if (event.event_type === 'pipeline.dispatcher.completed') dispatcherDecisions += 1;
    if (event.state === 'blocked') blocked += 1;
    if (event.state === 'failed') failed += 1;
    if (UNCERTAIN.has(event.state)) {
      uncertain += 1;
      degraded.push(event.reason || `${event.event_type}: ${event.state}`);
    }

    if (event.host) {
      const prior = harnesses.get(event.host);
      harnesses.set(event.host, {
        host: event.host,
        state: event.state,
        events: (prior?.events || 0) + 1,
        updated_at: event.occurred_at,
        event_id: event.event_id,
      });
    }
    if (event.agent) {
      const prior = fleet.get(event.agent);
      const stages = new Set(prior?.stages || []);
      if (event.stage_id) stages.add(event.stage_id);
      fleet.set(event.agent, {
        agent: event.agent,
        state: event.state,
        events: (prior?.events || 0) + 1,
        stages: [...stages].sort(),
        updated_at: event.occurred_at,
        event_id: event.event_id,
      });
    }

    if (!/^pipeline\.(?:run|stage|gate)\./.test(event.event_type)) continue;
    const run = ensureRun(runs, event);
    if (event.reason) run.reason = event.reason;

    if (event.event_type === 'pipeline.run.created') run.state = 'pending';
    else if (event.event_type === 'pipeline.run.completed') run.state = 'completed';
    else if (event.event_type === 'pipeline.stage.blocked' || event.event_type === 'pipeline.stage.manual-action') run.state = 'blocked';
    else if (event.event_type === 'pipeline.stage.started') run.state = 'running';
    else if (event.event_type === 'pipeline.gate.pending') run.state = 'awaiting-gate';
    else if (event.event_type === 'pipeline.gate.approved') run.state = 'running';

    if (event.event_type.startsWith('pipeline.stage.')) {
      const stageId = event.stage_id || 'unknown-stage';
      const prior = run.stages.get(stageId);
      run.stages.set(stageId, {
        stage_id: stageId,
        agent: event.agent,
        attempt: event.attempt,
        state: event.state,
        reason: event.reason,
        started_at: prior?.started_at || event.occurred_at,
        updated_at: event.occurred_at,
        event_id: event.event_id,
      });
    }

    if (event.event_type === 'pipeline.gate.pending' || event.event_type === 'pipeline.gate.approved') {
      const gates = Array.isArray(event.details?.gates) && event.details.gates.length
        ? event.details.gates
        : event.gate_id ? [event.gate_id] : ['unknown-gate'];
      for (const gate of gates) {
        const key = `${event.stage_id || 'pipeline'}:${gate}`;
        const prior = run.gates.get(key);
        run.gates.set(key, {
          gate_id: gate,
          stage_id: event.stage_id,
          state: event.event_type === 'pipeline.gate.approved' ? 'passed' : 'pending',
          opened_at: prior?.opened_at || event.occurred_at,
          updated_at: event.occurred_at,
          event_id: event.event_id,
        });
      }
    }
  }

  const materializedRuns = [...runs.values()].map((run) => ({
    ...run,
    stages: [...run.stages.values()].sort((a, b) => a.started_at.localeCompare(b.started_at) || a.stage_id.localeCompare(b.stage_id)),
    gates: [...run.gates.values()].sort((a, b) => a.opened_at.localeCompare(b.opened_at) || a.gate_id.localeCompare(b.gate_id)),
  })).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.run_id.localeCompare(b.run_id));

  const stages = materializedRuns.reduce((sum, run) => sum + run.stages.length, 0);
  const pendingGates = materializedRuns.reduce((sum, run) => sum + run.gates.filter((gate) => gate.state === 'pending').length, 0);
  const decisions = materializedRuns.flatMap((run) => run.gates.map((gate) => ({ run_id: run.run_id, ...gate })))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.gate_id.localeCompare(b.gate_id));
  const receipts = events.filter((event) => event.diff_sha || event.artifact_sha).map((event) => ({
    event_id: event.event_id,
    event_type: event.event_type,
    occurred_at: event.occurred_at,
    run_id: event.run_id,
    stage_id: event.stage_id,
    diff_sha: event.diff_sha,
    artifact_sha: event.artifact_sha,
  })).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.event_id.localeCompare(b.event_id));
  const revision = revisionOf(events);
  return {
    state: degraded.length ? 'degraded' : 'some',
    why: degraded.length ? `${degraded.length} event(s) carry uncertain evidence` : `${events.length} canonical event(s)`,
    invalid_lines: 0,
    revision,
    provenance: provenance(revision),
    summary: {
      events: events.length,
      pipeline_runs: materializedRuns.length,
      stages,
      pending_gates: pendingGates,
      verdicts,
      dispatcher_decisions: dispatcherDecisions,
      blocked,
      failed,
      uncertain,
      decisions: decisions.length,
      harnesses: harnesses.size,
      fleet: fleet.size,
      receipts: receipts.length,
    },
    runs: materializedRuns,
    decisions,
    harnesses: [...harnesses.values()].sort((a, b) => a.host.localeCompare(b.host)),
    fleet: [...fleet.values()].sort((a, b) => a.agent.localeCompare(b.agent)),
    receipts,
    events: events.slice(-clampLimit(limit)),
    degraded: [...new Set(degraded)],
    migration: { state: 'unmeasured', comparison: 'count-only', sources: {} },
  };
}

/** Read one project and refuse partial projections from corrupt input. */
export function evidenceProjection(cwd, options = {}) {
  const read = readEvidence(cwd);
  let projection;
  if (read.state === 'unreadable') projection = empty('unreadable', read.why, read.invalidLines);
  else if (read.state === 'none') projection = empty('none', read.why, 0);
  else projection = projectEvidenceRows(read.rows, options);
  projection.migration = migrationView(cwd, projection.summary);
  if (projection.state !== 'unreadable' && projection.migration.state !== 'count-match') {
    const legacyOnly = Object.values(projection.migration.sources)
      .reduce((sum, source) => sum + (source.legacy_only || 0), 0);
    if (legacyOnly || projection.migration.state === 'unreadable') {
      projection.state = 'degraded';
      const reason = projection.migration.state === 'unreadable'
        ? projection.migration.why
        : `${legacyOnly} legacy fact(s) have no canonical counterpart`;
      projection.degraded = [...new Set([...projection.degraded, reason])];
      projection.why = reason;
    }
  }
  return projection;
}
