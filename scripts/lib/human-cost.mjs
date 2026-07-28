// How much human attention did this product actually cost?
//
// The benchmark measures artifact quality — tests, types, structure. But the
// product being sold is "describe it, approve twice, get software", and nothing
// in the table says how many times a person had to step in. Two products with
// the same score are not equivalent if one ran unattended and the other needed
// four interventions and a resume.
//
// Everything here is counted from artifacts already on disk (verdict logs, run
// logs, git history). Nothing is estimated, and every count says what it counted
// — a number without its source invites exactly the over-reading this module is
// meant to prevent.
import fs from 'node:fs';
import path from 'node:path';

/** Verdicts that represent a human decision point rather than agent progress. */
const GATE_RE = /\b(APPROVED|REJECTED|BLOCKED|CHANGES(_REQUESTED)?|gate:[a-z]+)\b/i;
/** Verdicts that mean the run stopped and had to be restarted by someone. */
const RESTART_RE = /\b(SPEC[_-]OBJECTION|blocked|resumed?|handoff|interrupted)\b/i;

/**
 * Count intervention signals in a set of log lines.
 * Pure — the caller supplies the text, so this is testable without a repo.
 *
 * @returns {{gates:number, restarts:number, lines:number}}
 */
export function countInterventions(lines = []) {
  let gates = 0, restarts = 0;
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    if (GATE_RE.test(line)) gates++;
    if (RESTART_RE.test(line)) restarts++;
  }
  return { gates, restarts, lines: lines.filter((l) => l && l.trim()).length };
}

/**
 * Assemble the human-cost view for one product directory.
 *
 * `confidence` is deliberately part of the output. These signals are sparse —
 * a product with four verdict lines total cannot support a claim about how
 * attentive its build was — and a sparse count presented as a metric is worse
 * than no metric, because it looks authoritative. Below the floor, the numbers
 * are still reported but flagged as indicative.
 */
export function humanCost(dir, { readDir = fs.readdirSync, readFile = fs.readFileSync, exists = fs.existsSync } = {}) {
  const vdir = path.join(dir, '.great_cto', 'verdicts');
  let lines = [];
  if (exists(vdir)) {
    for (const f of readDir(vdir).filter((x) => String(x).endsWith('.log'))) {
      try { lines.push(...String(readFile(path.join(vdir, f), 'utf8')).split('\n')); } catch { /* skip */ }
    }
  }
  const counts = countInterventions(lines);

  // Each `.bench-run-N.log` is one launch: the first is the run, the rest are
  // restarts a human had to perform.
  let launches = 0;
  try { launches = readDir(dir).filter((f) => /^\.bench-run-\d+\.log$/.test(String(f))).length; } catch { /* none */ }
  const manualRestarts = Math.max(0, launches - 1);

  const MIN_SIGNALS = 10;
  const total = counts.gates + manualRestarts;
  return {
    gates: counts.gates,
    restarts_logged: counts.restarts,
    manual_restarts: manualRestarts,
    launches,
    total_interventions: total,
    verdict_lines: counts.lines,
    confidence: counts.lines >= MIN_SIGNALS ? 'measured' : 'indicative',
    note: counts.lines >= MIN_SIGNALS
      ? null
      : `only ${counts.lines} verdict line(s) — too sparse to characterise the run, reported anyway rather than hidden`,
  };
}

/** One-line rendering for a table cell. */
export function renderHumanCost(h) {
  const base = `${h.total_interventions} (${h.gates} gate${h.gates === 1 ? '' : 's'}` +
    (h.manual_restarts ? `, ${h.manual_restarts} restart${h.manual_restarts === 1 ? '' : 's'}` : '') + ')';
  return h.confidence === 'measured' ? base : `${base} ~`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const dir = argv.find((a) => !a.startsWith('--')) || process.cwd();
  const h = humanCost(dir);
  if (argv.includes('--json')) process.stdout.write(JSON.stringify(h, null, 2) + '\n');
  else {
    process.stdout.write(`human cost: ${renderHumanCost(h)}\n`);
    if (h.note) process.stdout.write(`  note: ${h.note}\n`);
  }
}
