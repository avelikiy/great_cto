// scripts/lib/change-tier.mjs — classify a change into a risk tier (T0/T1/T2).
//
// The build-side analog of the runtime volume/scope-aware escalation (great_cto-34g).
// Pairs with effectiveGates() in packages/cli/src/archetypes.ts: this module decides
// HOW DANGEROUS a change is; effectiveGates maps that tier to a human-gate set.
//
//   T2 — irreversible / regulated / deploy-to-prod. A HARD FLOOR: an explicit
//        label can never downgrade a change that trips a T2 trigger.
//   T0 — maintenance: every touched file is non-behavioral (docs/tests/lockfiles).
//        CI + green tests are the gate.
//   T1 — everything else (default): a reversible source change.
//
// Plan: docs/plans/PLAN-2026-06-18-gate-tiering-reviewer-consolidation.md

export const TIER_RANK = { T0: 0, T1: 1, T2: 2 };

// Files that, on their own, never change external behavior. A change touching ONLY
// these is maintenance (T0). Anything else is "behavioral".
const NON_BEHAVIORAL = [
  /\.md$/i,
  /(^|\/)docs?\//i,
  /(^|\/)tests?\//i,
  /\.test\.[mc]?[jt]s$/i,
  /(^|\/)__tests__\//,
  /(^|\/)\.beads\//,
  /(^|\/)CHANGELOG/i,
  /\.(png|jpe?g|gif|svg|webp)$/i,
  /(^|\/)package-lock\.json$/,
  /(^|\/)\.gitignore$/,
];

// Behavioral files whose mere presence makes the change irreversible/regulated (T2).
// Checked ONLY against behavioral files, so a docs/pricing.md never trips it.
const T2_PATHS = [
  { re: /(^|\/)migrations?\//i, why: 'migration' },
  { re: /(^|\/)_domains\.json$/i, why: 'domain-config' },
  { re: /(^|\/)(auth|authentication)[\/.]/i, why: 'auth-surface' },
  { re: /(^|\/)pricing[\/.]/i, why: 'pricing-surface' },
];

const isNonBehavioral = (f) => NON_BEHAVIORAL.some((re) => re.test(f));

/** Parse an explicit `tier:tN` beads label → 'T0'|'T1'|'T2'|null (last one wins). */
function labelTier(labels) {
  let found = null;
  for (const l of labels || []) {
    const m = /^tier:(t[012])$/i.exec(String(l).trim());
    if (m) found = m[1].toUpperCase();
  }
  return found;
}

/**
 * Classify a change.
 * @param {object} signals
 * @param {string[]} [signals.changedFiles] repo-relative paths
 * @param {Array<{id?:string,hasWrite?:boolean,isNew?:boolean}>} [signals.connectors]
 * @param {string|null} [signals.deployTarget] e.g. 'production'
 * @param {string[]} [signals.labels] beads labels (may include `tier:tN`)
 * @returns {{tier:'T0'|'T1'|'T2', reasons:string[], escalatedFromLabel:('T0'|'T1'|null)}}
 */
export function classify(signals = {}) {
  const changedFiles = Array.isArray(signals.changedFiles) ? signals.changedFiles : [];
  const connectors = Array.isArray(signals.connectors) ? signals.connectors : [];
  const deployTarget = signals.deployTarget ?? null;
  const explicit = labelTier(signals.labels);

  // ── Hard T2 triggers ────────────────────────────────────────────────────────
  const hard = [];
  const behavioral = changedFiles.filter((f) => !isNonBehavioral(f));
  for (const f of behavioral) {
    const hit = T2_PATHS.find((p) => p.re.test(f));
    if (hit) hard.push(`${hit.why}:${f}`);
  }
  for (const c of connectors) {
    if (c && c.isNew && c.hasWrite) hard.push(`connector:new-write:${c.id ?? '?'}`);
  }
  if (String(deployTarget).toLowerCase() === 'production') hard.push('deploy:production');

  if (hard.length) {
    // T2 floor: a lower explicit label is overridden — recorded for the audit log.
    const escalatedFromLabel =
      explicit && TIER_RANK[explicit] < TIER_RANK.T2 ? explicit : null;
    return { tier: 'T2', reasons: hard, escalatedFromLabel };
  }

  // ── Auto baseline (no hard trigger) ───────────────────────────────────────────
  // T0 only when there is at least one file and EVERY file is non-behavioral.
  const baseAuto =
    changedFiles.length > 0 && behavioral.length === 0 ? 'T0' : 'T1';

  // Explicit label wins within the non-floored range (can up- or down-grade).
  const tier = explicit ?? baseAuto;
  const reasons = explicit
    ? [`label:${explicit}`]
    : [
        baseAuto === 'T0'
          ? `auto:T0:non-behavioral(${changedFiles.length})`
          : `auto:T1:${behavioral.length ? `behavioral(${behavioral.length})` : 'default'}`,
      ];
  return { tier, reasons, escalatedFromLabel: null };
}

// CLI: node scripts/lib/change-tier.mjs file1 file2 …  → prints the tier + reasons
// (a thin probe; the orchestrator imports classify() directly with richer signals).
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = classify({ changedFiles: process.argv.slice(2) });
  process.stdout.write(`${r.tier}  ${r.reasons.join(', ')}\n`);
}
