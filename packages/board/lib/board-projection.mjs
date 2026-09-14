import { BUILD_VERSION } from './config.mjs';
import path from 'node:path';
import { getTasks } from './beads.mjs';
import { getMetrics } from './metrics.mjs';
import { getInbox, inboxElsewhere } from './data-readers.mjs';
import { getShareState } from './share.mjs';
import { listProjects } from './projects.mjs';
import { secondOpinionForTree } from '../../../scripts/lib/second-opinion-for-tree.mjs';
import { evidenceProjection } from '../../../scripts/lib/evidence-projection.mjs';

function decisionEvidenceFor(projection, task) {
  const base = {
    source: projection?.provenance?.source || '.great_cto/evidence-ledger.jsonl',
    revision: projection?.revision || null,
    projection_state: projection?.state || 'none',
  };
  if (projection?.state === 'unreadable') {
    return { ...base, freshness: 'unreadable', observed_at: null, why: projection.why || 'evidence ledger is unreadable' };
  }
  const gate = (String(task?.title || '').match(/gate:[a-z0-9-]+/i) || [])[0]?.toLowerCase() || null;
  if (!gate) return { ...base, freshness: 'unmeasured', observed_at: null, why: 'decision row has no gate identity' };
  const fact = (projection?.decisions || []).find((d) => String(d.gate_id || '').toLowerCase() === gate);
  if (!fact) return { ...base, freshness: 'unmeasured', observed_at: null, gate_id: gate, why: 'no canonical gate event recorded' };
  return {
    ...base,
    freshness: fact.state !== 'pending' ? 'stale' : projection.state === 'degraded' ? 'degraded' : 'current',
    observed_at: fact.updated_at || null,
    gate_id: gate,
    run_id: fact.run_id || null,
    event_id: fact.event_id || null,
    evidence_state: fact.state || 'unknown',
    why: fact.state === 'pending'
      ? projection.state === 'degraded'
        ? `canonical ledger agrees that this gate is waiting, but the projection is degraded: ${projection.why || 'see projection state'}`
        : 'canonical ledger agrees that this gate is waiting'
      : `task is waiting but canonical ledger says ${fact.state || 'unknown'}`,
  };
}

function boardInbox(cwd, { includeElsewhere = true } = {}) {
  const inbox = getInbox(cwd);
  const canonical = evidenceProjection(cwd, { limit: 100 });
  inbox.pending_gates = (inbox.pending_gates || []).map((gate) => ({
    ...gate,
    evidence: decisionEvidenceFor(canonical, gate),
  }));
  const second_opinion = secondOpinionForTree(cwd);
  let elsewhere;
  if (includeElsewhere) {
    try { elsewhere = inboxElsewhere(listProjects(), cwd, { readInbox: getInbox }); }
    catch (e) { elsewhere = { state: 'unreadable', why: String(e?.message || e) }; }
  }
  return { ...inbox, ...(includeElsewhere ? { elsewhere } : {}), second_opinion };
}

function buildBootSnapshot(cwd) {
  return {
    project: path.basename(cwd),
    version: { version: BUILD_VERSION },
    tasks: getTasks(cwd),
    metrics: getMetrics(cwd, 30),
    share: getShareState(cwd),
    projects: listProjects(),
    // Cross-project attention is deliberately excluded from the boot critical
    // path: walking every other Beads database serially destroys the latency
    // budget. Its absence is unknown, never an asserted zero.
    inbox: boardInbox(cwd, { includeElsewhere: false }),
  };
}

export { decisionEvidenceFor, boardInbox, buildBootSnapshot };
