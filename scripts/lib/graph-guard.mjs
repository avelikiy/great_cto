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
