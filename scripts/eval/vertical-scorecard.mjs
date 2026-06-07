// scripts/eval/vertical-scorecard.mjs — run the 0–100 quality scorecard for a vertical.
//
// Tier 0 (deterministic, $0, always): structural wiring + EVAL-suite presence.
// Tier 1 (behavioural, needs OPENROUTER_API_KEY): runs each golden case through the vertical's
// reviewer (one call per case — isolates the thing being scored) + an LLM judge for
// citation/coverage. Without a key it prints an honest Tier-0 partial.
//
// Usage:
//   node scripts/eval/vertical-scorecard.mjs legaltech                 # full if key set, else partial
//   node scripts/eval/vertical-scorecard.mjs legaltech --split holdout # gate-only split
//   node scripts/eval/vertical-scorecard.mjs legaltech --dry-run       # Tier-0 only, never calls the API

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreVertical, formatScorecard } from '../lib/vertical-score.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL = process.env.EVAL_ACTOR_MODEL || 'anthropic/claude-sonnet-4.5';
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || 'anthropic/claude-opus-4.1';
const API_KEY = process.env.OPENROUTER_API_KEY;

function agentPrompt(name) {
  const raw = readFileSync(join(ROOT, 'agents', `${name}.md`), 'utf8');
  const m = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return m ? m[1].trim() : raw;
}

// ── Tier 0 — deterministic ──────────────────────────────────────────────────────
function tier0(spec) {
  const files = [
    ['agents', `${spec.reviewer}.md`],
    ['skills/great_cto/packs', `${spec.pack}.md`],
    ['skills/great_cto/templates', `TM-${spec.tmSlug}.md`],
    ['commands', `${spec.command}.md`],
  ];
  const present = files.every(([d, f]) => existsSync(join(ROOT, d, f)));
  let registered = false;
  try {
    const plugin = readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8');
    registered = plugin.includes(spec.reviewer) && plugin.includes(spec.command);
  } catch { /* ignore */ }
  const wired = present && registered;

  // EVAL-suite presence: count `EVAL-...` bullets declared in the pack overlay.
  let declaredCases = 0;
  try {
    const pack = readFileSync(join(ROOT, 'skills/great_cto/packs', `${spec.pack}.md`), 'utf8');
    declaredCases = (pack.match(/`EVAL-[a-z0-9-]+`/gi) || []).length;
  } catch { /* ignore */ }

  return { structural: { wired }, evalSuite: { declaredCases } };
}

// ── Tier 1 — behavioural ──────────────────────────────────────────────────────
const ORCH_WRAPPER = `

---
AUTOMATED REVIEW TEST — you are reviewing the ARCH below.
- You cannot use tools. Do not write files.
- Reply with: a one-line list of the specific compliance concerns you found, then
  VERDICT: <APPROVED|BLOCKED> reason="<short>" gate="<gate id or none>"
- BLOCKED is correct if you find any Critical/High concern for your domain.
- Keep the whole reply under 400 tokens.
---
`;

async function callOR(model, system, user) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 700, messages: [
      { role: 'system', content: system }, { role: 'user', content: user },
    ] }),
  });
  if (!r.ok) throw new Error(`OR ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const u = d.usage || {};
  const cost = ((u.prompt_tokens || 0) / 1e6) * 3 + ((u.completion_tokens || 0) / 1e6) * 15;
  return { text: d.choices?.[0]?.message?.content || '', cost };
}

function parseVerdict(text) {
  const m = text.match(/VERDICT:\s*(APPROVED|BLOCKED)/i);
  const g = text.match(/gate="([^"]*)"/i);
  return { verdict: (m?.[1] || 'UNKNOWN').toUpperCase(), gate: (g?.[1] || '').trim() };
}

async function runCase(reviewerSys, c) {
  const { text, cost } = await callOR(MODEL, reviewerSys + ORCH_WRAPPER, c.arch);
  const { verdict, gate } = parseVerdict(text);
  const lc = text.toLowerCase();
  const matchedKeywords = (c.expectKeywords || []).filter((k) => lc.includes(k.toLowerCase()));
  const gateEmitted = !!gate && gate.toLowerCase() !== 'none';
  return { id: c.id, kind: c.kind, verdict, matchedKeywords, expectGate: !!c.expectGate, gateEmitted, cost };
}

async function judge(spec) {
  const surface = agentPrompt(spec.reviewer).slice(0, 6000);
  const sys = `You are an expert ${spec.vertical} regulatory auditor grading another reviewer's compliance prompt. Be skeptical and precise.`;
  const user = `Below is the compliance surface of a "${spec.vertical}" reviewer. Grade it on two axes, 0.0–1.0:\n` +
    `1) citation_accuracy: are the named statutes / standards / controls REAL and CURRENT (no hallucinated or obsolete law)?\n` +
    `2) coverage_completeness: does it cover the MAJOR regimes for this vertical, or is a significant one missing?\n` +
    `Reply ONLY as: citation_accuracy=<0..1> coverage_completeness=<0..1> note="<one line>"\n\n--- REVIEWER SURFACE ---\n${surface}`;
  const { text, cost } = await callOR(JUDGE_MODEL, sys, user);
  const ca = parseFloat(text.match(/citation_accuracy\s*=\s*([0-9.]+)/i)?.[1]);
  const cc = parseFloat(text.match(/coverage_completeness\s*=\s*([0-9.]+)/i)?.[1]);
  return { judge: { citationAccuracy: isNaN(ca) ? null : ca, coverageCompleteness: isNaN(cc) ? null : cc }, cost, raw: text.trim() };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  const splitIdx = argv.indexOf('--split');
  const split = splitIdx >= 0 ? argv[splitIdx + 1] : 'all';
  const vertical = args[0];
  if (!vertical) {
    console.error('usage: vertical-scorecard.mjs <vertical> [--split tuning|holdout|all] [--dry-run]');
    process.exit(2);
  }

  const specPath = join(ROOT, 'tests', 'eval', 'verticals', `${vertical}.json`);
  if (!existsSync(specPath)) { console.error(`no golden set: ${specPath}`); process.exit(2); }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));

  const t0 = tier0(spec);
  let caseResults = null, judgeScores = null, totalCost = 0;

  const cases = (spec.cases || []).filter((c) => split === 'all' || c.split === split);

  if (!dryRun && API_KEY) {
    console.error(`▸ running ${cases.length} case(s) + judge via OpenRouter (${MODEL})…`);
    const reviewerSys = agentPrompt(spec.reviewer);
    caseResults = [];
    for (const c of cases) {
      const r = await runCase(reviewerSys, c);
      totalCost += r.cost;
      caseResults.push(r);
      process.stderr.write(`  ${r.verdict === (c.expectVerdict || 'BLOCKED') || (c.kind === 'benign' && r.verdict !== 'BLOCKED') ? '✓' : '✗'} ${c.id}\n`);
    }
    const j = await judge(spec); totalCost += j.cost; judgeScores = j.judge;
    console.error(`  judge: ${j.raw}`);
  } else if (!dryRun && !API_KEY) {
    console.error('⚠ OPENROUTER_API_KEY not set — Tier-0 partial only. Set it for the full 0–100 score.');
  }

  const result = scoreVertical({ ...t0, caseResults, judge: judgeScores });
  console.log(formatScorecard(vertical, result));
  if (totalCost) console.log(`\n  run cost: ~$${totalCost.toFixed(2)}`);
  process.exit(result.complete && result.band === 'do-not-ship' ? 1 : 0);
}

main(process.argv.slice(2));
