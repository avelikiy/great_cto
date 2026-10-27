// The graph guards a dispatch it can prove wrong (ADR-039).
//
// On Claude Code the pipeline graph is advice: pipeline-dispatcher tells the
// model what to run next and the model decides. Measured over every local
// transcript (great_cto-1puj.1), one wrong turn dominated: after product-owner
// the model went to design-advisor and on to senior-dev, and in 84 of 93 cases
// architect never ran — the architecture stage and gate:arch skipped for UI
// features in 12 projects, reported by nothing.
//
// One rule per measured hole, observed before it is enforced. This module is
// pure; scripts/hooks/graph-guard.mjs does the reading and writing.
import { parseVerdictLog } from './verdict-record.mjs';

// The success tokens of the two stages, as shared/pipeline.toml declares them.
const PO_ON = ['APPROVED', 'DONE', 'BRIEF_READY', 'NO_BUILD'];
const ARCH_ON = ['APPROVED', 'DONE'];
const BUILD = new Set(['design-advisor', 'senior-dev', 'mobile-app-builder']);
const MODES = new Set(['observe', 'enforce', 'off']);

/** Newest record in a verdict log whose verdict is one of `on`, or null. */
export function latestSuccess(text, on) {
  const ok = new Set(on);
  let best = null;
  for (const rec of parseVerdictLog(text || '').records) {
    if (!ok.has(String(rec.verdict).toUpperCase())) continue;
    if (!best || String(rec.ts) > String(best.ts)) best = rec;
  }
  return best;
}

export { PO_ON, ARCH_ON };

/**
 * Rule 1 — architecture before build after a brief.
 * A brief exists (product-owner succeeded) and no architect success is newer
 * than it, yet a build or design stage is being dispatched.
 */
export function architectureBeforeBuild({ target, po, arch }) {
  const pass = { violated: false };
  if (!BUILD.has(target) || !po) return pass;
  if (String(po.verdict).toUpperCase() === 'NO_BUILD') return pass;
  if (String(po.meta?.depth || '').toLowerCase() === 'small') return pass;
  if (arch && String(arch.ts) >= String(po.ts)) return pass;
  return {
    violated: true,
    rule: 'architecture-before-build',
    why: `${target} after the product brief of ${po.ts}, but architect has not run since — the graph puts architect and gate:arch before design and build`,
  };
}

/**
 * Rule 2 — the edge being taken carries its contract.
 * `produces` in shared/pipeline.toml is what a stage must name before the graph
 * moves on. The Codex controller checks it before a transition; on Claude Code
 * nothing did, and measured over local verdicts since 2026-10-01 security-officer
 * named its report in 1 of 30 runs (its prompt never asked). Of the stages whose
 * `next` holds the target, the one that succeeded last is the edge being taken.
 * A receipt counts by its files; a value with a `/` must exist on disk.
 *
 * `latest(agent, on)` and `exists(path)` are injected: this module reads nothing.
 */
export function edgeContract({ target, graph, latest, exists }) {
  const pass = { violated: false };
  if (!graph || typeof graph !== 'object') return pass;
  let edge = null;
  for (const [stage, rule] of Object.entries(graph)) {
    if (!Array.isArray(rule?.next) || !rule.next.includes(target)) continue;
    const agent = stage.split('.')[0];
    const rec = latest(agent, rule.on || []);
    if (rec && (!edge || String(rec.ts) > String(edge.rec.ts))) edge = { agent, rule, rec };
  }
  if (!edge || !Array.isArray(edge.rule.produces) || !edge.rule.produces.length) return pass;
  for (const key of edge.rule.produces) {
    if (key === 'receipt') {
      if (Object.keys(edge.rec.receipt?.files || {}).length) continue;
      return { violated: true, rule: 'edge-contract', why: `${target} after ${edge.agent} (${edge.rec.ts}), whose verdict carries no receipt — the graph requires one before this edge` };
    }
    const val = edge.rec.meta?.[key];
    if (!val) return { violated: true, rule: 'edge-contract', why: `${target} after ${edge.agent} (${edge.rec.ts}), whose verdict names no \`${key}\` — the graph requires it before this edge` };
    if (typeof val === 'string' && val.includes('/') && !exists(val)) {
      return { violated: true, rule: 'edge-contract', why: `${target} after ${edge.agent} (${edge.rec.ts}), whose \`${key}=${val}\` does not exist` };
    }
  }
  return pass;
}

/** observe → record, enforce → deny, off or an approved exception → allow. */
export function decide({ mode, violation, excepted = false }) {
  if (!violation?.violated || mode === 'off' || excepted) return { action: 'allow' };
  return { action: mode === 'enforce' ? 'deny' : 'record' };
}

/** `graph-guard:` in PROJECT.md; anything unknown is observe. */
export function guardMode(projectMd) {
  const m = String(projectMd || '').match(/^graph-guard:\s*(\S+)/m);
  const v = m ? m[1].toLowerCase() : 'observe';
  return MODES.has(v) ? v : 'observe';
}

/** subagent_type in any of its spellings → the stage name. */
export const stageName = (s) => String(s || '').replace(/^great[-_]cto[:-]/, '');
