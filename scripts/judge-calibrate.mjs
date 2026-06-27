// scripts/judge-calibrate.mjs — calibrate the eval JUDGE against a labelled gold set.
//
// Why it exists (DEEPEN-PIPELINE Wave 1): the judge (Opus) is the single arbiter
// behind every PROMOTE/REJECT. If it is miscalibrated or its verdict is truncated,
// it silently poisons every downstream metric identically — fixing the actor buys
// nothing. This harness measures judge ACCURACY on transcripts whose correct
// verdict is KNOWN, and flags truncated verdicts (raise maxTokens).
//
// (Distinct from scripts/judge-validate.mjs, which qualifies a candidate judge
//  MODEL vs the current one on eval-result parity — ADR-004. This one asks:
//  "is the judge even right?" against ground truth.)
//
// Gold set format — JSONL, one labelled transcript per line:
//   {"scenario":"...","test":"...","expected":"...","actorResponse":"...","label":"PASS"}
//
// Usage:
//   export ANTHROPIC_API_KEY=sk-ant-...
//   node scripts/judge-calibrate.mjs                          # gold: tests/eval/judge-gold.jsonl
//   node scripts/judge-calibrate.mjs --gold path.jsonl --min-accuracy 0.9
//
// Exit 0 = judge meets bar, no truncation. Exit 1 = below bar / truncated. Exit 2 = bad input.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callJudge, parseJudgeVerdict, pickProvider, modelFor } from '../tests/eval/runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GOLD = join(__dirname, '..', 'tests', 'eval', 'judge-gold.jsonl');

/** Parse a gold-set JSONL string into labelled records. */
export function parseGold(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t);
      if (o && (o.label === 'PASS' || o.label === 'FAIL')) out.push(o);
    } catch { /* skip malformed */ }
  }
  return out;
}

/**
 * Pure scorer (no network): compare judge verdicts to gold labels.
 * @param {Array<{label:string, verdict:string, truncated?:boolean}>} records
 * @returns {{n,correct,accuracy,truncated,unknown,confusion:{tp,tn,fp,fn}}}
 */
export function scoreJudge(records) {
  let correct = 0, truncated = 0, unknown = 0;
  const confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };
  for (const r of records) {
    if (r.truncated) truncated++;
    if (r.verdict === 'UNKNOWN') { unknown++; continue; }
    const goldPass = r.label === 'PASS';
    const judgePass = r.verdict === 'PASS';
    if (goldPass && judgePass) confusion.tp++;
    else if (!goldPass && !judgePass) confusion.tn++;
    else if (!goldPass && judgePass) confusion.fp++;
    else confusion.fn++;
    if (goldPass === judgePass) correct++;
  }
  const n = records.length;
  return { n, correct, accuracy: n ? correct / n : 0, truncated, unknown, confusion };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseCli(argv) {
  const o = { gold: DEFAULT_GOLD, minAccuracy: 0.9 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--gold') o.gold = argv[++i];
    else if (argv[i] === '--min-accuracy') o.minAccuracy = parseFloat(argv[++i]);
  }
  return o;
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  const { provider } = pickProvider();
  if (!provider) { console.error('ERROR: set OPENROUTER_API_KEY (or ANTHROPIC_API_KEY).'); process.exit(2); }
  if (!existsSync(opts.gold)) { console.error(`ERROR: gold set not found: ${opts.gold}`); process.exit(2); }

  const gold = parseGold(readFileSync(opts.gold, 'utf8'));
  if (gold.length === 0) { console.error('ERROR: gold set empty / no labelled records.'); process.exit(2); }

  const judgeModel = modelFor('judge');
  console.log(`Judge calibration — ${gold.length} labelled cases · ${provider} · model ${judgeModel}`);
  const records = [];
  for (const g of gold) {
    try {
      const res = await callJudge({
        judgeModel,
        scenario: g.scenario || '', test: g.test || '',
        expected: g.expected || '', actorResponse: g.actorResponse || '',
      });
      const verdict = parseJudgeVerdict(res.text);
      records.push({ label: g.label, verdict, truncated: res.stopReason === 'max_tokens' });
      process.stdout.write(verdict === g.label ? '·' : 'X');
    } catch (err) {
      console.warn(`\n[WARN] judge call failed: ${err.message.slice(0, 80)}`);
      records.push({ label: g.label, verdict: 'UNKNOWN', truncated: false });
    }
  }
  console.log('');

  const s = scoreJudge(records);
  console.log(`Accuracy: ${(s.accuracy * 100).toFixed(0)}% (${s.correct}/${s.n})  |  TP=${s.confusion.tp} TN=${s.confusion.tn} FP=${s.confusion.fp} FN=${s.confusion.fn}  |  unknown=${s.unknown}  truncated=${s.truncated}`);

  let exit = 0;
  if (s.truncated > 0) {
    console.error(`JUDGE TRUNCATED on ${s.truncated} case(s) — raise the judge maxTokens in tests/eval/runner.mjs callJudge().`);
    exit = 1;
  }
  if (s.accuracy < opts.minAccuracy) {
    console.error(`JUDGE BELOW BAR — ${(s.accuracy * 100).toFixed(0)}% < required ${(opts.minAccuracy * 100).toFixed(0)}%. Tune the judge prompt before trusting any eval delta.`);
    exit = 1;
  }
  if (exit === 0) console.log('Judge OK — calibrated and non-truncating.');
  process.exit(exit);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch(err => { console.error('FATAL:', err.message); process.exit(2); });
