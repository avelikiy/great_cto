#!/usr/bin/env node
// cost-drift.mjs — compare what we PREDICTED a run would cost against what it
// actually cost.
//
// The gap this fills is named in this repo's own source. scripts/lib/cost-meter.mjs
// opens with: "cost-guard.mjs guesses with a hardcoded ROUGH_COST_USD table and
// log-verdict.sh trusts a typed CLI arg — spend is never measured." cost-meter
// closed the measuring half. This closes the loop: measured dollars sit in
// cost-history.log and the verdict logs, the estimates sit in a five-row hardcoded
// table, and until now nothing ever compared the two. An estimate nobody checks is
// a guess with a confident font.
//
// Deliberately a REPORT, not a calibrator. With ~20 measured points across a dozen
// agents, rewriting the table from data would be worse than the hardcode it
// replaced — this answers "is calibration worth doing at all?" for the price of
// reading two files. Deterministic, zero tokens, zero network.
//
// Usage:
//   node scripts/lib/cost-drift.mjs [--cwd DIR] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Per-agent estimates, mirrored from cost-guard.mjs ROUGH_COST_USD. */
export const AGENT_ESTIMATES = {
  architect: 3,
  'security-officer': 2,
};

/** Parse `<ISO-ts> <agent> <usd>` lines. Tolerates the older `agent=x cost_usd=y` shape. */
export function parseCostHistory(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    // new shape: 2026-05-09T15:53:52Z senior-dev 0.30
    let m = t.match(/^(\S+)\s+([a-z0-9-]+)\s+([0-9.]+)\s*$/i);
    if (m) { out.push({ ts: m[1], agent: m[2], usd: parseFloat(m[3]) }); continue; }
    // legacy shape: <ts> agent=architect feature=demo cost_usd=8.00
    const agent = (t.match(/\bagent=(\S+)/) || [])[1];
    const usd = (t.match(/\bcost_usd=([0-9.]+)/) || [])[1];
    if (agent && usd) out.push({ ts: t.split(/\s+/)[0], agent, usd: parseFloat(usd) });
  }
  return out;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compare estimates against measured spend, per agent.
 *
 * Only agents that appear in BOTH the estimate table and the log can be scored;
 * everything else is reported as uncovered rather than silently dropped, because
 * "we never predicted this agent's cost" is itself the finding. Sample sizes ride
 * along on every row — a 2-sample ratio is a rumour, not a measurement, and the
 * reader must be able to see which is which.
 */
export function computeDrift(records = [], estimates = AGENT_ESTIMATES) {
  const byAgent = new Map();
  for (const r of records) {
    if (!r?.agent || typeof r.usd !== 'number' || Number.isNaN(r.usd)) continue;
    if (!byAgent.has(r.agent)) byAgent.set(r.agent, []);
    byAgent.get(r.agent).push(r.usd);
  }

  const rows = [];
  const uncovered = [];
  for (const [agent, costs] of byAgent) {
    const est = estimates[agent];
    const actual = median(costs);
    if (est == null) { uncovered.push({ agent, samples: costs.length, medianActual: actual }); continue; }
    rows.push({
      agent,
      estimate: est,
      medianActual: actual,
      samples: costs.length,
      // ratio > 1 means we spent MORE than predicted.
      ratio: est > 0 ? Math.round((actual / est) * 100) / 100 : null,
    });
  }
  rows.sort((a, b) => Math.abs((b.ratio ?? 1) - 1) - Math.abs((a.ratio ?? 1) - 1));

  const ratios = rows.map((r) => r.ratio).filter((n) => typeof n === 'number');
  const medianRatio = median(ratios);
  const totalSamples = records.length;

  // A verdict is only meaningful with enough points. Below the floor we say so
  // instead of pronouncing on 3 samples — the same discipline as the null score.
  const MIN_SAMPLES = 30;
  let verdict;
  if (totalSamples < MIN_SAMPLES) {
    verdict = `insufficient-data (${totalSamples}/${MIN_SAMPLES} measured runs — no calibration decision yet)`;
  } else if (medianRatio == null) {
    verdict = 'no-overlap (measured agents and estimated agents do not intersect)';
  } else if (medianRatio >= 0.6 && medianRatio <= 1.4) {
    verdict = `estimates-adequate (median ratio ${medianRatio}× — hardcoded table is close enough; do not calibrate)`;
  } else {
    verdict = `estimates-off (median ratio ${medianRatio}× — calibration is now justified, and there is data to do it with)`;
  }

  return { rows, uncovered, medianRatio, totalSamples, minSamples: MIN_SAMPLES, verdict };
}

/** Render the report as text. */
export function renderDrift(d) {
  const L = ['=== COST DRIFT — estimate vs measured ===', ''];
  if (!d.rows.length && !d.uncovered.length) {
    L.push('No measured spend recorded yet (cost-history.log is empty).');
    L.push('Run a pipeline; the SubagentStop hook records real cost per agent.');
    return L.join('\n');
  }
  if (d.rows.length) {
    L.push('agent               est     actual(med)   ratio   n');
    for (const r of d.rows) {
      L.push(
        `${r.agent.padEnd(20)}$${String(r.estimate).padEnd(6)}$${String(r.medianActual).padEnd(12)}` +
        `${(r.ratio != null ? r.ratio + '×' : '—').padEnd(8)}${r.samples}`,
      );
    }
    L.push('');
  }
  if (d.uncovered.length) {
    L.push(`Measured but never estimated (${d.uncovered.length}):`);
    L.push('  ' + d.uncovered.map((u) => `${u.agent} ($${u.medianActual}, n=${u.samples})`).join(', '));
    L.push('');
  }
  L.push(`Verdict: ${d.verdict}`);
  return L.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--cwd');
  const cwd = i > -1 ? argv[i + 1] : process.cwd();

  // Project-local log first, then the global one — same precedence the cost
  // enrichment in verdicts.mjs uses.
  const texts = [join(cwd, '.great_cto', 'cost-history.log'), join(homedir(), '.great_cto', 'cost-history.log')]
    .filter((p) => existsSync(p))
    .map((p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } });

  const records = texts.flatMap((t) => parseCostHistory(t));
  const drift = computeDrift(records);

  if (argv.includes('--json')) process.stdout.write(JSON.stringify(drift, null, 2) + '\n');
  else process.stdout.write(renderDrift(drift) + '\n');
}
