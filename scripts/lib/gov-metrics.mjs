#!/usr/bin/env node
/**
 * gov-metrics — governance metrics for great_cto gates (TAKE 1, borrow-santander).
 *
 * Adapts the measurement idea from SantanderAI/mech-gov-framework (Apache-2.0):
 * gates are only worth their ceremony if you can SHOW they work. great_cto had
 * gates (gate:product / gate:ship / change_tier) but never measured them. This
 * reads the existing verdict trail (.great_cto/verdicts/<agent>.log) and emits
 * the governance numbers mech-gov names: block rate, override/waiver rate, a
 * false-block proxy, time-in-gate, and the R1-vs-R2 ratio.
 *
 * Regime tags (mech-gov vocabulary):
 *   R1 = text-only governance — a reviewer's prose judgment (architect, pm,
 *        product-owner, code-reviewer).
 *   R2 = MECHANICALLY enforced — a script/CI produces the verdict and can hard-
 *        block (qa-engineer runs tests, security-officer runs secret/CVE scans,
 *        devops gates on CI). R2 is the moat: an enforced gate, not a vibe.
 *
 * Usage:
 *   node scripts/lib/gov-metrics.mjs [--dir .great_cto/verdicts] [--json] [--since 30d]
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REGIME = {
  R2: new Set(['qa-engineer', 'security-officer', 'devops']),
  // everything else that emits a gate verdict is R1 (prose judgment)
};
const GATE_AGENTS = new Set([
  'product-owner', 'architect', 'pm', 'qa-engineer', 'security-officer', 'devops', 'code-reviewer',
]);
const BLOCK_RE = /(BLOCK|REJECT|FAIL)/i;
const PASS_RE = /(APPROVE|PASS|DONE|READY|OK)/i;

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? (process.argv[i + 1] ?? true) : def;
}
function regimeOf(agent) { return REGIME.R2.has(agent) ? 'R2' : 'R1'; }
function sinceMs(spec) {
  if (!spec) return 0;
  const m = String(spec).match(/^(\d+)([dhw])$/);
  if (!m) return 0;
  const n = +m[1], unit = { h: 3600e3, d: 86400e3, w: 7 * 86400e3 }[m[2]];
  return n * unit;
}

/** Parse a verdict log dir into decision records. */
export function loadDecisions(dir, sinceCutoff = 0) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.log')) continue;
    for (const raw of readFileSync(join(dir, f), 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 3) continue;
      const [ts, agent, verdict, ...rest] = parts;
      const t = Date.parse(ts);
      if (Number.isNaN(t)) continue;
      if (sinceCutoff && t < sinceCutoff) continue;
      const meta = {};
      for (const kv of rest) { const i = kv.indexOf('='); if (i > 0) meta[kv.slice(0, i)] = kv.slice(i + 1); }
      out.push({ t, ts, agent, verdict, meta, blocked: BLOCK_RE.test(verdict), passed: PASS_RE.test(verdict) && !BLOCK_RE.test(verdict) });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export function computeMetrics(decisions) {
  const gate = decisions.filter(d => GATE_AGENTS.has(d.agent));
  const total = gate.length;
  const blocked = gate.filter(d => d.blocked).length;
  const overrides = gate.filter(d => d.meta.override || d.meta.waiver).length;

  // R1 vs R2 share
  const r2 = gate.filter(d => regimeOf(d.agent) === 'R2').length;

  // False-block proxy: a BLOCK on a feature followed later by a PASS from the
  // SAME agent on the SAME feature (the block was lifted without escalation).
  const byFeatAgent = {};
  for (const d of gate) {
    const key = `${d.agent}::${d.meta.feature || '?'}`;
    (byFeatAgent[key] ||= []).push(d);
  }
  let falseBlocks = 0, blockedFeatures = 0;
  for (const seq of Object.values(byFeatAgent)) {
    const firstBlock = seq.findIndex(d => d.blocked);
    if (firstBlock === -1) continue;
    blockedFeatures++;
    if (seq.slice(firstBlock + 1).some(d => d.passed)) falseBlocks++;
  }

  // Time-in-gate proxy: median minutes between consecutive decisions per feature.
  const gaps = [];
  const byFeat = {};
  for (const d of gate) (byFeat[d.meta.feature || '?'] ||= []).push(d);
  for (const seq of Object.values(byFeat)) {
    for (let i = 1; i < seq.length; i++) gaps.push((seq[i].t - seq[i - 1].t) / 60000);
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

  const pct = (n, d) => (d ? +(100 * n / d).toFixed(1) : 0);
  return {
    decisions: total,
    block_rate_pct: pct(blocked, total),
    override_rate_pct: pct(overrides, total),
    false_block_rate_pct: pct(falseBlocks, blockedFeatures),
    r2_mechanical_share_pct: pct(r2, total),
    r1_textual_share_pct: pct(total - r2, total),
    median_minutes_between_gate_decisions: +medianGap.toFixed(1),
    by_agent: Object.fromEntries(
      [...GATE_AGENTS].map(a => {
        const ds = gate.filter(d => d.agent === a);
        return [a, { regime: regimeOf(a), decisions: ds.length, blocks: ds.filter(d => d.blocked).length }];
      }).filter(([, v]) => v.decisions > 0),
    ),
  };
}

function main() {
  const dir = arg('--dir', join(process.cwd(), '.great_cto', 'verdicts'));
  const cutoff = sinceMs(arg('--since', null));
  const decisions = loadDecisions(dir, cutoff ? Date.now() - cutoff : 0);
  const m = computeMetrics(decisions);

  if (arg('--json', false)) { console.log(JSON.stringify(m, null, 2)); return; }

  if (!m.decisions) {
    console.log('gov-metrics: no gate decisions found in', dir, '\n(run some pipeline stages first — gates log to .great_cto/verdicts/)');
    return;
  }
  console.log(`\n  GOVERNANCE METRICS  (${m.decisions} gate decisions${cutoff ? `, last ${arg('--since')}` : ''})\n`);
  console.log(`  Block rate            ${m.block_rate_pct}%        (gates that blocked)`);
  console.log(`  Override / waiver     ${m.override_rate_pct}%        (blocks bypassed by a human)`);
  console.log(`  False-block proxy     ${m.false_block_rate_pct}%        (blocked then passed unchanged — noise)`);
  console.log(`  R2 mechanical share   ${m.r2_mechanical_share_pct}%        (enforced by CI/script — THE moat)`);
  console.log(`  R1 textual share      ${m.r1_textual_share_pct}%        (reviewer prose judgment)`);
  console.log(`  Median time-in-gate   ${m.median_minutes_between_gate_decisions} min\n`);
  console.log('  By gate:');
  for (const [a, v] of Object.entries(m.by_agent)) {
    console.log(`    ${a.padEnd(18)} ${v.regime}  ${String(v.decisions).padStart(3)} decisions · ${v.blocks} blocks`);
  }
  console.log('');
  if (m.r2_mechanical_share_pct < 40) console.log('  ⚠ R2 share < 40% — gates lean on prose, not enforcement. Move judgment into checks.');
  if (m.false_block_rate_pct > 30) console.log('  ⚠ false-block proxy > 30% — gates over-fire; calibrate severity (anti-inflation).');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
