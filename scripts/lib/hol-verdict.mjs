/**
 * Judge a HOL AI Plugin Scanner JSON report the way its GitHub Action did:
 * score >= 80 and zero critical or high findings (`min_score: 80`,
 * `fail_on_severity: high`). The workflow was removed on 2026-10-01 — Actions on
 * the account is billing-locked, so it never ran — and scripts/hol-scan.sh now
 * runs the same pinned scanner in the local gate and asks this module for the
 * verdict.
 *
 * CLI: node hol-verdict.mjs <report.json> [baseline.json]  → one line; exit 0 pass, 1 fail.
 */
export const MIN_SCORE = 80;

/**
 * @param report    the scanner's JSON report
 * @param baseline  { entries: [{ruleId, filePath, count, reason}] } — critical/high
 *                  findings already reviewed as false positives. A pair beyond its
 *                  reviewed count, or one the baseline does not name, still fails.
 * @returns {{pass: boolean, line: string, reasons: string[], stale: string[]}}
 */
export function judge(report, baseline = { entries: [] }) {
  const score = Number(report?.effective_score ?? report?.score);
  const f = report?.summary?.findings ?? {};
  const critical = Number(f.critical) || 0;
  const high = Number(f.high) || 0;
  const reasons = [];
  if (!Number.isFinite(score)) reasons.push('the report has no score');
  else if (score < MIN_SCORE) reasons.push(`score ${score} < ${MIN_SCORE}`);
  // Severe findings, judged against the reviewed baseline when the report lists
  // them; without a findings list, fall back to the summary counts.
  const severe = (report?.findings ?? []).filter((x) => ['critical', 'high'].includes(String(x?.severity).toLowerCase()));
  const key = (x) => `${x.ruleId} ${x.filePath}`;
  const seen = new Map();
  for (const x of severe) seen.set(key(x), (seen.get(key(x)) ?? 0) + 1);
  const allowed = new Map((baseline?.entries ?? []).map((e) => [key(e), Number(e.count) || 0]));
  let reviewed = 0;
  if (Array.isArray(report?.findings)) {
    for (const [k, n] of seen) {
      const ok = allowed.get(k);
      if (ok === undefined) reasons.push(`new high/critical finding: ${k} (${n})`);
      else if (n > ok) reasons.push(`${k}: ${n} > ${ok} reviewed`);
      else reviewed += n;
    }
  } else {
    if (critical) reasons.push(`${critical} critical finding(s)`);
    if (high) reasons.push(`${high} high finding(s)`);
  }
  const stale = [...allowed.keys()].filter((k) => !seen.has(k));
  // The catalogue runs the Cisco skill scanner; without it a scan misses whole
  // classes of finding (35 high on 2026-10-01 against 0 without it).
  const skill = (report?.summary?.integrations ?? []).filter((i) => /cisco-skill-scanner/.test(i?.name ?? ''));
  if (skill.length && skill.some((i) => String(i.status).toLowerCase() !== 'enabled')) {
    reasons.push(`the Cisco skill scan did not run (${skill.map((i) => i.status).join(', ')}) — not the catalogue's verdict`);
  }
  const counts = ['critical', 'high', 'medium', 'low', 'info'].map((k) => `${Number(f[k]) || 0} ${k}`).join(', ');
  const line = `HOL plugin scanner: score ${Number.isFinite(score) ? score : '?'} (needs ${MIN_SCORE}) — ${counts}`
    + (reviewed ? ` (${reviewed} high reviewed as false positives)` : '');
  return { pass: reasons.length === 0, line, reasons, stale };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { readFileSync } = await import('node:fs');
  let report;
  try { report = JSON.parse(readFileSync(process.argv[2], 'utf8')); } catch (e) {
    console.log(`HOL plugin scanner: report unreadable — ${e.message}`); process.exit(1);
  }
  let baseline = { entries: [] };
  if (process.argv[3]) {
    try { baseline = JSON.parse(readFileSync(process.argv[3], 'utf8')); } catch (e) {
      console.log(`HOL plugin scanner: baseline unreadable — ${e.message}`); process.exit(1);
    }
  }
  const v = judge(report, baseline);
  console.log(v.pass ? `${v.line} — pass` : `${v.line} — FAIL: ${v.reasons.join('; ')}`);
  for (const k of v.stale) console.log(`  baseline entry no longer found — remove it: ${k}`);
  process.exit(v.pass ? 0 : 1);
}
