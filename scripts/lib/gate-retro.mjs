// scripts/lib/gate-retro.mjs — retrospective gate-effectiveness auditor (DEEPEN W3.4).
//
// A PASS/APPROVED verdict is never reconciled against reality — there's no signal on
// whether the gates actually caught what they claimed. This parses the "## Agent
// Verdict Audit" table in postmortems (docs/postmortems/PM-*.md, format defined in
// agents/l3-support.md), matches each agent's pre-deploy verdict to the incident
// outcome, and scores per-agent effectiveness into metrics-history.
//
// A "false pass" = a positive verdict (PASS / APPROVED / pass) on a gate that an
// incident later proved wrong (Correct? = no) — the gate missed a real defect.
//
// NOTE: docs/postmortems/ is empty until incidents accrue, so this emits no live
// signal yet — the parser is built + tested against a fixture so it's ready and
// format-robust the moment the first PM-SEC lands.
//
// Usage:
//   node scripts/lib/gate-retro.mjs            # scan docs/postmortems, print scores
//   node scripts/lib/gate-retro.mjs --record   # also append per-agent effectiveness to metrics-history

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const PM_DIR = 'docs/postmortems';

/** Canonical agent name: prefer the slug in parens — "QA (qa-engineer)" → "qa-engineer". */
export function normalizeAgent(cell) {
  const paren = cell.match(/\(([a-z][a-z0-9-]+)\)/);
  if (paren) return paren[1];
  return cell.trim().toLowerCase().replace(/\s+/g, '-');
}

const POSITIVE = /\b(pass|passed|approved|approve|ok|green|no\s+findings)\b/i;

/** Does a verdict string mean "the gate said go"? (vs FAIL/BLOCKED). */
export function isPositiveVerdict(verdict) {
  if (/\b(fail|failed|blocked|block|red)\b/i.test(verdict)) return false;
  return POSITIVE.test(verdict);
}

/**
 * Parse the "## Agent Verdict Audit" table out of a postmortem.
 * @returns {Array<{agent, verdict, correct:boolean|null, gap}>}
 */
export function parseVerdictAudit(pmText) {
  const text = String(pmText);
  const m = text.match(/^##\s+Agent Verdict Audit\s*\n([\s\S]*?)(?=^##\s|\Z)/m);
  if (!m) return [];
  const rows = [];
  for (const line of m[1].split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|\s*[-:]+\s*\|/.test(line)) continue;                 // separator
    const cols = line.split('|').map(s => s.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cols.length < 3) continue;
    const [agentCell, verdict, correctRaw, gap = ''] = cols;
    if (/^agent$/i.test(agentCell)) continue;                     // header
    // skip un-filled template rows (still showing "yes / no")
    const correct = /^yes$/i.test(correctRaw) ? true : /^no$/i.test(correctRaw) ? false : null;
    if (verdict.includes('/') || correct === null) continue;      // template placeholder
    rows.push({ agent: normalizeAgent(agentCell), verdict, correct, gap });
  }
  return rows;
}

/**
 * Per-agent effectiveness across all audited verdicts.
 * @returns {Array<{agent, total, correct, falsePass, effectiveness}>}
 */
export function scoreEffectiveness(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.agent)) by.set(r.agent, { agent: r.agent, total: 0, correct: 0, falsePass: 0 });
    const a = by.get(r.agent);
    a.total++;
    if (r.correct) a.correct++;
    if (!r.correct && isPositiveVerdict(r.verdict)) a.falsePass++;  // said go, incident followed
  }
  return [...by.values()].map(a => ({ ...a, effectiveness: a.total ? round(a.correct / a.total) : 0 }));
}

function round(n) { return Math.round(n * 10000) / 10000; }

// ── CLI ───────────────────────────────────────────────────────────────────────

function main(argv) {
  const record = argv.includes('--record');
  if (!existsSync(PM_DIR)) { console.log('gate-retro: no docs/postmortems/ yet — nothing to audit.'); process.exit(0); }
  const pms = readdirSync(PM_DIR).filter(f => f.startsWith('PM-') && f.endsWith('.md'));
  if (pms.length === 0) { console.log('gate-retro: no postmortems yet — no gate-effectiveness signal until incidents accrue.'); process.exit(0); }

  const rows = pms.flatMap(f => parseVerdictAudit(readFileSync(join(PM_DIR, f), 'utf8')));
  if (rows.length === 0) { console.log(`gate-retro: ${pms.length} PM(s), no filled Agent Verdict Audit rows yet.`); process.exit(0); }

  const scores = scoreEffectiveness(rows);
  console.log(`gate-retro: ${rows.length} audited verdict(s) across ${pms.length} postmortem(s)`);
  for (const s of scores) {
    const flag = s.falsePass > 0 ? ` ⚠ ${s.falsePass} false-pass` : '';
    console.log(`  ${s.agent}: ${(s.effectiveness * 100).toFixed(0)}% correct (${s.correct}/${s.total})${flag}`);
  }

  if (record) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const TREND = join(__dirname, 'metrics-trend.mjs');
    for (const s of scores) {
      spawnSync(process.execPath, [TREND, 'record', '--key', `gate_effectiveness.${s.agent}`, '--value', String(s.effectiveness), '--source', 'gate-retro'], { stdio: 'ignore' });
    }
    console.log('gate-retro: per-agent effectiveness appended to metrics-history.');
  }
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
