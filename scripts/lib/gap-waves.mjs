// scripts/lib/gap-waves.mjs — gap-closure wave planner (governance Phase 5).
//
// When strict-mode gates (Phase 2) meet a legacy / freshly-audited codebase, blocking on
// every pre-existing gap at once is impractical. Phase 5 adopts strict gates *incrementally*:
// enumerate gaps in a register, schedule them into remediation WAVES, and cover the
// not-yet-closed deferred gaps with interim **signed exceptions** (Phase 1) — so a gate can
// pass meanwhile, but every gap is tracked and the bypass is auditable + expiring, never silent.
//
//   - normalizeGap(raw)               → {id, gate, severity, summary, status, wave, exception}
//   - planWaves(gaps, opts)           → [{wave, gaps:[…]}] (critical never deferred past wave 1)
//   - interimExceptionsNeeded(gaps,o) → deferred open gaps lacking a covering exception
//   - validateRegister(gaps, opts)    → {valid, errors}  (no uncovered deferred gap)
//   - progress(gaps)                  → {total, closed, open, byWave}
//
// CLI:
//   node scripts/lib/gap-waves.mjs plan <gaps.json> [--per-wave N] [--current-wave N]
//     exit 0 = every deferred gap is covered · 1 = an uncovered deferred gap would block a gate

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/** Normalize a raw gap into the register shape. Unknown severity → medium. */
export function normalizeGap(raw = {}) {
  const sev = String(raw.severity || 'medium').toLowerCase();
  return {
    id: raw.id != null ? String(raw.id) : '',
    gate: raw.gate || '',
    severity: SEVERITY_RANK[sev] != null ? sev : 'medium',
    summary: raw.summary || raw.title || '',
    status: String(raw.status || 'open').toLowerCase() === 'closed' ? 'closed' : 'open',
    wave: Number.isInteger(raw.wave) ? raw.wave : null,
    exception: raw.exception || raw.exception_id || null,
  };
}

function bySeverityThenId(a, b) {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id);
}

/**
 * Assign open gaps to remediation waves.
 * - All `critical` gaps land in wave 1 (never deferred), regardless of perWave.
 * - Remaining open gaps fill waves in severity order, `perWave` per wave.
 * - Closed gaps are not scheduled.
 * Returns [{wave, gaps:[normalizedGap…]}], and stamps `wave` onto each returned gap.
 * @param {Array} gaps
 * @param {{perWave?:number}} opts
 */
export function planWaves(gaps, { perWave = 5 } = {}) {
  const open = gaps.map(normalizeGap).filter((g) => g.status === 'open').sort(bySeverityThenId);
  const critical = open.filter((g) => g.severity === 'critical');
  const rest = open.filter((g) => g.severity !== 'critical');

  const waves = [];
  if (critical.length) waves.push(critical.map((g) => ({ ...g, wave: 1 })));
  for (let i = 0; i < rest.length; i += perWave) {
    waves.push(rest.slice(i, i + perWave));
  }
  // If criticals took wave 1, the rest start at wave 2; else rest start at wave 1.
  const offset = critical.length ? 1 : 0;
  return waves.map((bucket, idx) => {
    const waveNo = idx + 1; // criticals already at index 0
    return { wave: waveNo, gaps: bucket.map((g) => ({ ...g, wave: waveNo })) };
  });
}

/** Flatten a wave plan back to a gap list with `wave` stamped (closed gaps appended as-is). */
export function applyPlan(gaps, plan) {
  const waveOf = new Map();
  for (const w of plan) for (const g of w.gaps) waveOf.set(g.id, w.wave);
  return gaps.map(normalizeGap).map((g) => ({ ...g, wave: waveOf.has(g.id) ? waveOf.get(g.id) : g.wave }));
}

/**
 * Deferred open gaps that lack a covering exception. A gap is "deferred" if its wave is later
 * than the current wave (it won't be fixed yet), so it needs an interim signed exception now
 * to keep its gate green. Gaps in the current wave (being actively closed) don't.
 * @param {Array} gaps  (should already carry `wave`, e.g. via applyPlan)
 * @param {{currentWave?:number}} opts
 */
export function interimExceptionsNeeded(gaps, { currentWave = 1 } = {}) {
  return gaps
    .map(normalizeGap)
    .filter((g) => g.status === 'open' && g.wave != null && g.wave > currentWave && !g.exception);
}

/**
 * A register is valid (the gate may pass) when every gap has a gate + severity, and no open
 * deferred gap is left uncovered (it would block its gate). Gaps in the current wave or
 * earlier are being worked, so they need no exception.
 */
export function validateRegister(gaps, { currentWave = 1 } = {}) {
  const errors = [];
  const norm = gaps.map(normalizeGap);
  for (const g of norm) {
    if (!g.id) errors.push('a gap is missing an id');
    else if (!g.gate) errors.push(`${g.id}: missing gate`);
  }
  for (const g of interimExceptionsNeeded(norm, { currentWave })) {
    errors.push(`${g.id} (${g.severity}, wave ${g.wave}): deferred but has no interim exception — would block ${g.gate}`);
  }
  return { valid: errors.length === 0, errors };
}

/** Progress summary: totals + per-wave closed/total. */
export function progress(gaps) {
  const norm = gaps.map(normalizeGap);
  const closed = norm.filter((g) => g.status === 'closed').length;
  const byWave = {};
  for (const g of norm) {
    if (g.wave == null) continue;
    byWave[g.wave] = byWave[g.wave] || { closed: 0, total: 0 };
    byWave[g.wave].total += 1;
    if (g.status === 'closed') byWave[g.wave].closed += 1;
  }
  return { total: norm.length, closed, open: norm.length - closed, byWave };
}

// ── formatting ──────────────────────────────────────────────────────────────────
const SEV_ICON = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
export function formatWavePlan(plan) {
  if (!plan.length) return 'No open gaps — nothing to schedule.';
  const out = ['=== Gap-closure wave plan ==='];
  for (const w of plan) {
    out.push(`\nWave ${w.wave} (${w.gaps.length} gap${w.gaps.length > 1 ? 's' : ''}):`);
    for (const g of w.gaps) out.push(`  ${SEV_ICON[g.severity] || '·'} ${g.id} · ${g.gate} · ${g.severity} · ${g.summary}`);
  }
  return out.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const [cmd, file] = args;
  if (cmd !== 'plan' || !file) {
    console.error('usage: gap-waves.mjs plan <gaps.json> [--per-wave N] [--current-wave N]');
    process.exit(2);
  }
  let gaps;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    gaps = Array.isArray(parsed) ? parsed : parsed.gaps || [];
  } catch (e) {
    console.error(`cannot read gaps: ${e.message}`);
    process.exit(2);
  }
  const perWave = parseInt(flag('per-wave', '5'), 10);
  const currentWave = parseInt(flag('current-wave', '1'), 10);

  const plan = planWaves(gaps, { perWave });
  const stamped = applyPlan(gaps, plan);
  console.log(formatWavePlan(plan));

  const need = interimExceptionsNeeded(stamped, { currentWave });
  const prog = progress(stamped);
  console.log(`\nProgress: ${prog.closed}/${prog.total} gaps closed.`);
  if (need.length) {
    console.log(`\n⚠ ${need.length} deferred gap(s) need an interim signed exception (else the gate blocks):`);
    for (const g of need) {
      console.log(`  ${g.id} → /exception create --gate ${g.gate} --scope "${g.id}" --reason "gap-wave ${g.wave}: tracked, scheduled" --risk ${g.severity === 'critical' || g.severity === 'high' ? 'high' : 'medium'}`);
    }
    process.exit(1);
  }
  console.log('\n✓ every deferred gap is covered (or in the current wave) — gates may pass.');
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
