// scripts/lib/gp-eval-trace.mjs — close the crystallize→eval loop (DEEPEN W2.4).
//
// When a crystallized pattern (GP) is approved and applied to its target agent,
// its claimed mttr_reduction should be backed by a MEASURED eval delta, not an
// estimate. This stamps the before/after eval result onto the GP as a trace line:
//   knowledge-entry → global-pattern → commit-sha → measured eval Δ.
//
// CRITICAL (learned from W1.★): the eval is noisy (±35% at low samples). A delta is
// only meaningful if it exceeds the sampling noise. This tool is VARIANCE-AWARE: it
// records the delta WITH its noise band and a confident|noisy flag, so a noisy
// delta is never mis-stamped as an "improvement." Same discipline as eval-gate.
//
// Usage:
//   node scripts/lib/gp-eval-trace.mjs stamp \
//     --gp ~/.great_cto/global-patterns/GP-0001-x.md \
//     --baseline baseline.jsonl --candidate candidate.jsonl \
//     --agent security-officer --ke KE-12 --commit "$(git rev-parse --short HEAD)"
//
// Produce baseline/candidate first with the runner (held-out split, multi-sample):
//   node tests/eval/runner.mjs --agent <A> --split holdout --samples 5 --out baseline.jsonl
//   node tests/eval/runner.mjs --agent <A> --split holdout --samples 5 --prompt-file cand.md --out candidate.jsonl

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseResultsJsonl } from '../eval-gate.mjs';

function round(n) { return Math.round(n * 10000) / 10000; }

/**
 * Compute the measured eval delta for an agent between baseline and candidate.
 * Variance-aware: `confident` is true only when |meanDelta| exceeds the combined
 * sampling noise band (σ_base + σ_cand averaged across shared evals).
 * @returns {{agent, perEval:Array, meanDelta:number, noiseBand:number, confident:boolean, direction:string}}
 */
export function computeDelta(baselineRows, candidateRows, agent = null) {
  const idx = (rows) => {
    const m = new Map();
    for (const r of rows) if (r && typeof r.eval === 'string') m.set(r.eval, r);
    return m;
  };
  const filt = (rows) => (agent ? rows.filter(r => r.agent === agent || !r.agent) : rows);
  const base = idx(filt(baselineRows));
  const cand = idx(filt(candidateRows));

  const perEval = [];
  for (const [name, c] of cand) {
    const b = base.get(name);
    if (!b || typeof b.rate !== 'number' || typeof c.rate !== 'number') continue;
    const delta = c.rate - b.rate;
    const band = (Number(b.stddev) || 0) + (Number(c.stddev) || 0);
    perEval.push({ eval: name, baseRate: b.rate, candRate: c.rate, delta: round(delta), noiseBand: round(band) });
  }

  const meanDelta = perEval.length ? round(perEval.reduce((a, e) => a + e.delta, 0) / perEval.length) : 0;
  const noiseBand = perEval.length ? round(perEval.reduce((a, e) => a + e.noiseBand, 0) / perEval.length) : 0;
  const confident = Math.abs(meanDelta) > noiseBand && perEval.length > 0;
  const direction = !confident ? 'noisy' : meanDelta > 0 ? 'improvement' : 'regression';
  return { agent, perEval, meanDelta, noiseBand, confident, direction };
}

/**
 * Stamp the delta onto a GP file: set `eval_delta:` / `eval_confidence:` frontmatter
 * and append a "## Eval trace" line. Idempotent on frontmatter keys (replaces),
 * append-only on the trace log. Pure — returns the new text.
 */
export function stampTrace(gpText, { ke, commit, delta, ts }) {
  let text = String(gpText);
  const pct = (n) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
  const deltaStr = `${pct(delta.meanDelta)} (±${(delta.noiseBand * 100).toFixed(1)}%, ${delta.direction})`;

  const setFm = (key, value) => {
    const re = new RegExp(`^${key}:.*$`, 'm');
    if (re.test(text)) text = text.replace(re, `${key}: ${value}`);
    else text = text.replace(/^---\n/, `---\n${key}: ${value}\n`); // insert after opening fence
  };
  setFm('eval_delta', deltaStr);
  setFm('eval_confidence', delta.direction);

  const traceLine = `${ts} · KE ${ke || '?'} · commit ${commit || '?'} · Δ ${deltaStr}`;
  if (/^##\s+Eval trace/m.test(text)) {
    text = text.replace(/(^##\s+Eval trace\s*\n)/m, `$1${traceLine}\n`);
  } else {
    text = text.replace(/\s*$/, `\n\n## Eval trace\n${traceLine}\n`);
  }
  return text;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function main(argv) {
  if (argv[0] !== 'stamp') { console.error('Usage: gp-eval-trace.mjs stamp --gp F --baseline B --candidate C [--agent A] [--ke KE] [--commit SHA]'); process.exit(2); }
  const get = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : null; };
  const gp = get('--gp'), baseline = get('--baseline'), candidate = get('--candidate');
  if (!gp || !baseline || !candidate) { console.error('ERROR: --gp, --baseline and --candidate are required.'); process.exit(2); }
  for (const f of [gp, baseline, candidate]) if (!existsSync(f)) { console.error(`ERROR: not found: ${f}`); process.exit(2); }

  const delta = computeDelta(
    parseResultsJsonl(readFileSync(baseline, 'utf8')),
    parseResultsJsonl(readFileSync(candidate, 'utf8')),
    get('--agent'),
  );
  if (delta.perEval.length === 0) { console.error('ERROR: no shared evals between baseline and candidate.'); process.exit(1); }

  // ts passed in / derived at call time (CLI is allowed to use the clock).
  const ts = get('--ts') || new Date().toISOString();
  const stamped = stampTrace(readFileSync(gp, 'utf8'), { ke: get('--ke'), commit: get('--commit'), delta, ts });
  writeFileSync(gp, stamped);

  console.log(`gp-eval-trace: ${gp}`);
  console.log(`  Δ ${(delta.meanDelta * 100).toFixed(1)}% (±${(delta.noiseBand * 100).toFixed(1)}% noise) → ${delta.direction}`);
  if (delta.direction === 'noisy') console.log('  NOTE: delta is within the noise band — recorded as "noisy", not an improvement.');
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
