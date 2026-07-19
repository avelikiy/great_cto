#!/usr/bin/env node
// Decide whether a global pattern may be activated by `/crystallize approve`.
//
// Approving a pattern edits an agent's behaviour for every future run, and until
// now it did so with no evidence at all: the eval that would back the claimed
// improvement was printed as a recipe AFTER activation, explicitly not run
// because "evals cost real tokens". So a proposal became live on the strength of
// its own claim.
//
// Forcing an eval on every approval would fix that by spending money the operator
// has deliberately chosen not to spend. The rule here is narrower and cheaper:
// require the evidence to EXIST, not to be generated now.
//
//   • a stamped regression  → blocked, always. No override — activating a change
//     already measured as harmful is not a judgement call.
//   • no evidence at all    → blocked, unless the operator passes an explicit
//     --no-eval "<reason>", which is recorded. A bypass is allowed; a SILENT
//     bypass is not.
//   • improvement or noisy  → allowed (noisy is honest: the delta sat inside the
//     noise band, so it is "not shown to help", not "shown to work").
//
// Usage:
//   node scripts/lib/gp-approve-gate.mjs <GP-file> [--no-eval "reason"] [--json]
import { readFileSync, existsSync } from 'node:fs';

/** Pull the eval trace fields a stamp leaves in the GP frontmatter. */
export function readEvidence(text = '') {
  const grab = (key) => {
    const m = String(text).match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  const delta = grab('eval_delta');
  return {
    delta: delta == null ? null : Number(delta),
    confidence: grab('eval_confidence'),
    direction: grab('eval_direction'),
  };
}

/**
 * Pure gate decision.
 * @param {{delta:number|null, confidence:string|null, direction:string|null}} evidence
 * @param {{bypassReason?:string|null}} opts
 * @returns {{ok:boolean, reason:string, evidence:'regression'|'improvement'|'noisy'|'none', bypassed:boolean}}
 */
export function decideApproval(evidence = {}, { bypassReason = null } = {}) {
  const dir = (evidence.direction || '').toLowerCase();
  const hasDelta = typeof evidence.delta === 'number' && !Number.isNaN(evidence.delta);

  // A measured regression is never activatable, with or without a reason.
  if (dir === 'regression' || (hasDelta && evidence.delta < 0 && dir !== 'noisy')) {
    return {
      ok: false, evidence: 'regression', bypassed: false,
      reason: `eval measured a REGRESSION (delta ${evidence.delta}). This pattern must not be activated; reject it or fix the proposal.`,
    };
  }

  if (dir === 'improvement' || dir === 'noisy' || hasDelta) {
    const kind = dir === 'noisy' ? 'noisy' : 'improvement';
    return {
      ok: true, evidence: kind, bypassed: false,
      reason: kind === 'noisy'
        ? `eval delta sat inside the noise band — activating as "not shown to help", not as proven`
        : `eval measured an improvement (delta ${evidence.delta})`,
    };
  }

  if (bypassReason && String(bypassReason).trim()) {
    return {
      ok: true, evidence: 'none', bypassed: true,
      reason: `no eval evidence — activated via explicit override: ${String(bypassReason).trim()}`,
    };
  }

  return {
    ok: false, evidence: 'none', bypassed: false,
    reason: 'no eval evidence on this pattern. Run the eval and stamp it, or re-run with --no-eval "<why this is safe without one>" (the reason is recorded).',
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  const i = argv.indexOf('--no-eval');
  const bypassReason = i > -1 ? argv[i + 1] : null;

  if (!file || !existsSync(file)) {
    process.stderr.write('usage: gp-approve-gate.mjs <GP-file> [--no-eval "reason"] [--json]\n');
    process.exit(2);
  }
  const verdict = decideApproval(readEvidence(readFileSync(file, 'utf8')), { bypassReason });
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  } else {
    process.stdout.write(`${verdict.ok ? 'ALLOW' : 'BLOCK'} — ${verdict.reason}\n`);
  }
  process.exit(verdict.ok ? 0 : 1);
}
