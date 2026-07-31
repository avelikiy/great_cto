#!/usr/bin/env node
/**
 * eval-status — what the eval suite has actually executed, as opposed to what it
 * has documented.
 *
 * Why this exists
 * ---------------
 * We have 33 EVAL-*.md files holding 278 hand-written cases, a real two-agent
 * runner (tests/eval/runner.mjs), and a coverage gate. The gate reports 20/69
 * agents "covered" — where covered means *a file exists that names the agent*.
 * Join that against tests/eval/results-history.jsonl and the picture changes: 2
 * of the 33 files have ever been executed, both on 27–28 June, and 14 of those
 * 18 results were below their own threshold. Nobody acted on them, because
 * nothing reports them.
 *
 * A metric that counts artifacts instead of outcomes is the failure this repo
 * keeps rediscovering — the quality oracle that graded by filename, the deny
 * list documented as "reference-only", the dispatcher waiting on a gate nobody
 * creates. This is the same shape, on the surface that is supposed to catch the
 * others.
 *
 * Costs nothing to run: it reads two files and joins them. Executing the evals
 * themselves needs an API key and is tests/eval/runner.mjs's job.
 *
 * CLI:
 *   node scripts/lib/eval-status.mjs                 # table + summary
 *   node scripts/lib/eval-status.mjs --json
 *   node scripts/lib/eval-status.mjs --strict        # exit 1 if anything is failing
 *   node scripts/lib/eval-status.mjs --stale-days 14
 */

export const STATES = Object.freeze({
  PASSING: 'passing',
  FAILING: 'failing',
  STALE: 'stale',
  UNSCORED: 'unscored',
  NEVER_RUN: 'never-run',
});

const DEFAULT_STALE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "4/5 tuning · 2/3 holdout." → {tuning:{pass:4,of:5}, holdout:{pass:2,of:3}}
 *
 * Returns null when the file states its bar in prose ("All ratios ≥ 0.8…").
 * Null is the honest answer: a threshold nobody can parse must not become a
 * default that everything clears.
 */
export function parseThreshold(text) {
  const s = String(text ?? '');
  const grab = (split) => {
    const m = s.match(new RegExp(`(\\d+)\\s*/\\s*(\\d+)\\s*${split}`, 'i'));
    return m ? { pass: Number(m[1]), of: Number(m[2]) } : null;
  };
  const tuning = grab('tuning');
  const holdout = grab('holdout');
  if (!tuning && !holdout) return null;
  return { tuning, holdout };
}

/** Count the numbered rows of a `| # | … |` table under a heading. */
function countCases(body, headingRx) {
  const m = body.match(headingRx);
  if (!m) return 0;
  const after = body.slice(m.index + m[0].length);
  const section = after.split(/\n#{2,}\s/)[0];
  return (section.match(/^\|\s*H?\d+\s*\|/gm) || []).length;
}

/** Read one EVAL-*.md into the facts we can check without running anything. */
export function parseEvalMeta(text, filename) {
  const body = String(text ?? '');
  const name = String(filename ?? '').replace(/\.md$/, '');

  // `> Agent: x · note` is the explicit binding; pack evals use `Reviewer: x`.
  const agent =
    (body.match(/^>\s*Agent:\s*([a-z0-9-]+)/mi) || [])[1] ||
    (body.match(/^\s*Reviewer:\s*([a-z0-9-]+)/mi) || [])[1] ||
    null;

  const thresholdText = (body.match(/^##+\s*Pass threshold\s*\n([\s\S]*?)(?=\n#{2,}\s|$)/mi) || [])[1];

  return {
    name,
    agent: agent ? agent.trim() : null,
    cases: {
      tuning: countCases(body, /^##+\s*Cases.*$/mi),
      holdout: countCases(body, /^##+\s*Holdout cases.*$/mi),
    },
    threshold: parseThreshold(thresholdText),
  };
}

/** results-history.jsonl → rows. A bad line is skipped, never fatal. */
export function parseHistory(jsonl) {
  const out = [];
  for (const line of String(jsonl ?? '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* a truncated append is not a reason to report nothing */ }
  }
  return out;
}

/**
 * Join one eval against the run history.
 *
 * The newest run decides. Taking the best run is how a suite reports green while
 * its last attempt failed, and every state here exists to stop a number being
 * printed that nothing measured.
 */
export function statusFor(meta, rows, { now = Date.now(), staleDays = DEFAULT_STALE_DAYS } = {}) {
  // An unparseable ts sorts oldest, never newest. Date.parse returns NaN there,
  // and NaN in a comparator reads as "equal" — which let a corrupt row keep its
  // file position and outrank a real timestamp, in the passing direction.
  const at = (r) => { const t = Date.parse(r.ts ?? ''); return Number.isFinite(t) ? t : -Infinity; };
  const mine = (rows || []).filter((r) => r && r.eval === meta.name).sort((a, b) => at(a) - at(b));

  if (!mine.length) {
    return { ...meta, state: STATES.NEVER_RUN, rate: null, threshold: null, lastRun: null, ageDays: null };
  }

  const last = mine[mine.length - 1];
  const rate = typeof last.rate === 'number' ? last.rate : null;
  const bar = typeof last.threshold === 'number' ? last.threshold : null;
  const ts = at(last);
  const ageDays = Number.isFinite(ts) ? Math.floor((now - ts) / DAY_MS) : null;

  let state;
  // It ran. Without a rate or a bar we cannot say whether it passed, but saying
  // "never run" over a row that carries a rate and a timestamp is the one claim
  // this module exists to prevent.
  if (rate === null || bar === null) state = STATES.UNSCORED;
  else if (rate < bar) state = STATES.FAILING;
  // An age nobody can establish must not read as fresh — unknown is not current.
  else if (ageDays === null || ageDays > staleDays) state = STATES.STALE;
  else state = STATES.PASSING;

  return { ...meta, state, rate, threshold: bar, lastRun: last.ts || null, ageDays, runs: mine.length };
}

export function summarise(statuses) {
  const n = (s) => statuses.filter((x) => x.state === s).length;
  const passing = n(STATES.PASSING);
  const failing = n(STATES.FAILING);
  const stale = n(STATES.STALE);
  const unscored = n(STATES.UNSCORED);
  const neverRun = n(STATES.NEVER_RUN);
  const total = statuses.length;
  const executed = passing + failing + stale + unscored;
  const unscoredPart = unscored ? ` · ${unscored} unscored` : '';
  return {
    total, passing, failing, stale, unscored, neverRun, executed,
    line: `${passing}/${total} evals passing · ${failing} failing · ${stale} stale${unscoredPart} · ${neverRun} never run`,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main(argv) {
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const evalDir = join(root, 'tests', 'eval');
  const historyPath = join(evalDir, 'results-history.jsonl');

  const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const staleDays = Number(flag('--stale-days', DEFAULT_STALE_DAYS));
  const asJson = argv.includes('--json');
  const strict = argv.includes('--strict');

  if (!existsSync(evalDir)) { console.error('eval-status: no tests/eval directory'); return 2; }

  const files = readdirSync(evalDir).filter((f) => f.startsWith('EVAL-') && f.endsWith('.md')).sort();
  const rows = existsSync(historyPath) ? parseHistory(readFileSync(historyPath, 'utf8')) : [];
  const statuses = files.map((f) => statusFor(parseEvalMeta(readFileSync(join(evalDir, f), 'utf8'), f), rows, { staleDays }));
  const sum = summarise(statuses);

  if (asJson) {
    console.log(JSON.stringify({ summary: sum, evals: statuses }, null, 2));
    return strict && sum.failing ? 1 : 0;
  }

  const mark = { passing: '✓', failing: '✗', stale: '~', unscored: '?', 'never-run': '·' };
  const shown = statuses.filter((s) => s.state !== STATES.NEVER_RUN);
  for (const s of shown) {
    const rate = s.rate === null ? '   —  ' : `${(s.rate * 100).toFixed(0).padStart(3)}%`;
    const bar = s.threshold === null ? '' : ` (bar ${(s.threshold * 100).toFixed(0)}%)`;
    console.log(`  ${mark[s.state]} ${rate}${bar.padEnd(12)} ${String(s.ageDays)}d ago  ${s.name}`);
  }
  if (sum.neverRun) {
    console.log(`\n  · never run (${sum.neverRun}):`);
    const names = statuses.filter((s) => s.state === STATES.NEVER_RUN).map((s) => s.name.replace(/^EVAL-/, ''));
    console.log('    ' + names.join(', '));
  }
  console.log(`\n  ${sum.line}`);
  if (sum.executed === 0) {
    console.log('  Nothing has been executed. Coverage counts files, not outcomes —');
    console.log('  run: node tests/eval/runner.mjs --split holdout   (needs an API key)');
  }
  return strict && sum.failing ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
