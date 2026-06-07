// scripts/lib/autopilot-gate.mjs — service-autopilot release gate (services-as-software).
//
// An "autopilot" sells the OUTCOME of a service, not a tool to a specialist. That shifts the
// bar: the eval IS the SLA, every autonomous action needs a who/what audit trail and a
// confidence→human escalation boundary, and the product must price per outcome. This module
// makes those four invariants machine-checkable so `gate:judgment-boundary` / `gate:accuracy-sla`
// refuse on a config that only *claims* to be safe.
//
//   - validateConfig(cfg)        → { valid, errors }  (the autopilot manifest is well-formed)
//   - meetsAccuracySLA(cfg, m)   → { ok, failures }   (measured metrics clear the declared SLA)
//   - checkDecisionLog(rows,cfg) → { ok, violations } (every autonomous action is logged +
//                                   either reversible or was gated; low-confidence → escalated)
//
// CLI:
//   node scripts/lib/autopilot-gate.mjs validate <autopilot.json>
//   node scripts/lib/autopilot-gate.mjs sla      <autopilot.json> <metrics.json>
//   node scripts/lib/autopilot-gate.mjs log      <autopilot.json> <decisions.json>
//     exit 0 = clear · 1 = gate blocks · 2 = malformed manifest

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RISK = new Set(['low', 'medium', 'high', 'critical']);

/**
 * Validate an autopilot manifest. Required shape:
 *   {
 *     name, vertical,
 *     judgment: { confidenceThreshold: 0..1, escalateTo: "<human role>" },
 *     accuracySLA: [ { metric, min } … ]        // the contract; ≥1 entry
 *     auditTrail: { enabled: true, fields: [ "who","what","inputs","confidence","timestamp" ] }
 *     unitEconomics: { costPerOutcomeUsd: number, humanBaselineUsd: number }
 *     reversible: true | { gatedActions: [ … ] }   // irreversible actions must be gated
 *   }
 */
export function validateConfig(cfg = {}) {
  const e = [];
  if (!cfg || typeof cfg !== 'object') return { valid: false, errors: ['manifest is not an object'] };
  if (!cfg.name) e.push('missing name');
  if (!cfg.vertical) e.push('missing vertical');

  const j = cfg.judgment || {};
  const t = j.confidenceThreshold;
  if (typeof t !== 'number' || t <= 0 || t >= 1) e.push('judgment.confidenceThreshold must be a number in (0,1) — the assistant↔autopilot boundary');
  if (!j.escalateTo) e.push('judgment.escalateTo (human role) required — where low-confidence cases go');

  const sla = cfg.accuracySLA;
  if (!Array.isArray(sla) || sla.length === 0) e.push('accuracySLA must list ≥1 { metric, min } — the eval is the contract');
  else for (const s of sla) {
    if (!s || !s.metric) e.push('accuracySLA entry missing metric');
    else if (typeof s.min !== 'number' || s.min < 0 || s.min > 1) e.push(`accuracySLA[${s.metric}].min must be 0..1`);
  }

  const a = cfg.auditTrail || {};
  if (a.enabled !== true) e.push('auditTrail.enabled must be true — per-decision liability record');
  else {
    const need = ['who', 'what', 'confidence'];
    const have = (a.fields || []).map((f) => String(f).toLowerCase());
    for (const f of need) if (!have.includes(f)) e.push(`auditTrail.fields missing "${f}"`);
  }

  const u = cfg.unitEconomics || {};
  if (typeof u.costPerOutcomeUsd !== 'number') e.push('unitEconomics.costPerOutcomeUsd required — price per outcome, not per seat');
  if (typeof u.humanBaselineUsd !== 'number') e.push('unitEconomics.humanBaselineUsd required — the service it replaces');

  if (cfg.reversible !== true && !(cfg.reversible && Array.isArray(cfg.reversible.gatedActions))) {
    e.push('reversible must be true, or reversible.gatedActions must list every irreversible action that requires a gate');
  }
  return { valid: e.length === 0, errors: e };
}

/** Measured metrics must each clear the declared SLA floor. metrics = { metric: value(0..1) }. */
export function meetsAccuracySLA(cfg, metrics = {}) {
  const failures = [];
  for (const s of (cfg.accuracySLA || [])) {
    const got = metrics[s.metric];
    if (typeof got !== 'number') { failures.push(`${s.metric}: no measurement (SLA ${s.min})`); continue; }
    if (got < s.min) failures.push(`${s.metric}: ${got.toFixed(3)} < SLA ${s.min}`);
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Each decision row: { id, action, autonomous(bool), confidence(0..1), logged(bool),
 *                      reversible(bool), gated(bool), escalated(bool) }.
 * Violations (any one blocks the gate):
 *  - an autonomous action that wasn't logged (audit-trail hole);
 *  - a below-threshold-confidence action taken autonomously without escalation (judgment breach);
 *  - an irreversible autonomous action that wasn't gated (no human in an unrecoverable loop).
 */
export function checkDecisionLog(rows, cfg = {}) {
  const threshold = (cfg.judgment && cfg.judgment.confidenceThreshold) || 0;
  const violations = [];
  for (const r of rows || []) {
    if (!r || !r.autonomous) continue;
    const id = r.id || r.action || '(unknown)';
    if (!r.logged) violations.push(`${id}: autonomous action not logged (audit-trail hole)`);
    if (typeof r.confidence === 'number' && r.confidence < threshold && !r.escalated) {
      violations.push(`${id}: confidence ${r.confidence} < ${threshold} but acted autonomously without escalation`);
    }
    if (r.reversible === false && !r.gated) {
      violations.push(`${id}: irreversible autonomous action was not gated`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Savings ratio vs the human baseline — the article's "every model improvement makes it cheaper". */
export function savingsRatio(cfg) {
  const u = cfg.unitEconomics || {};
  if (!u.humanBaselineUsd) return null;
  return 1 - (u.costPerOutcomeUsd / u.humanBaselineUsd);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

function main(argv) {
  const [cmd, manifestPath, dataPath] = argv;
  if (!cmd || !manifestPath) {
    console.error('usage: autopilot-gate.mjs validate <autopilot.json>');
    console.error('       autopilot-gate.mjs sla      <autopilot.json> <metrics.json>');
    console.error('       autopilot-gate.mjs log      <autopilot.json> <decisions.json>');
    process.exit(2);
  }
  let cfg;
  try { cfg = readJson(manifestPath); } catch (e) { console.error(`cannot read manifest: ${e.message}`); process.exit(2); }

  const v = validateConfig(cfg);
  if (!v.valid) {
    console.error('autopilot manifest malformed:');
    for (const er of v.errors) console.error(`  ✗ ${er}`);
    process.exit(2);
  }

  if (cmd === 'validate') {
    const ratio = savingsRatio(cfg);
    console.log(`manifest OK — ${cfg.accuracySLA.length} SLA metric(s), escalate→${cfg.judgment.escalateTo}${ratio != null ? `, ${Math.round(ratio * 100)}% cheaper than human baseline` : ''}`);
    process.exit(0);
  }

  if (cmd === 'sla') {
    if (!dataPath) { console.error('sla needs <metrics.json>'); process.exit(2); }
    const { ok, failures } = meetsAccuracySLA(cfg, readJson(dataPath));
    if (ok) { console.log(`accuracy-SLA met — all ${cfg.accuracySLA.length} metric(s) clear the floor`); process.exit(0); }
    console.error('ACCURACY-SLA BREACH — release blocked:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  if (cmd === 'log') {
    if (!dataPath) { console.error('log needs <decisions.json>'); process.exit(2); }
    const rows = readJson(dataPath);
    const { ok, violations } = checkDecisionLog(Array.isArray(rows) ? rows : rows.decisions || [], cfg);
    if (ok) { console.log('decision log clean — every autonomous action logged, escalated when low-confidence, gated when irreversible'); process.exit(0); }
    console.error('JUDGMENT-BOUNDARY VIOLATION — release blocked:');
    for (const v2 of violations) console.error(`  ✗ ${v2}`);
    process.exit(1);
  }

  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
