// scripts/lib/cost-meter.mjs — turn real Anthropic `usage` into real USD.
//
// Why it exists (DEEPEN-PIPELINE Wave 1, cost loop):
//   cost-guard.mjs guesses with a hardcoded ROUGH_COST_USD table and
//   log-verdict.sh trusts a typed CLI arg — spend is never measured. This module
//   is the single place that converts an API response's token usage into dollars,
//   so the runner, log-verdict, and any LLM-calling script can record TRUE cost.
//
// Prices are USD per 1,000,000 tokens (list prices). They change — override
// without editing code via either:
//   GREAT_CTO_MODEL_PRICES='{"claude-opus-4-8":{"input":15,"output":75}}'  (env, JSON)
//   ~/.great_cto/model-prices.json                                          (file, JSON)
//
// Pure + offline-testable: priceForModel() and costForUsage() take an explicit
// `prices` arg so unit tests never touch env or disk.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Default list prices, USD per 1M tokens.
 *
 * Anthropic rates below are first-party API list prices as of 2026-06-24. They
 * also apply to Claude on Microsoft Foundry; Bedrock and Vertex are partner-
 * operated with separate pricing — override there.
 *
 * Why the current models are listed explicitly rather than left to the family
 * fallback: the fallback bills anything matching /opus/i at the Opus 4 rate, and
 * Opus 5 is $5/$25, not $15/$75. Every Opus 5 turn on this machine — 8,763 of
 * them in one session — was being costed at THREE TIMES its real price, and the
 * total looked like a total. A guess that silently triples the number is worse
 * than no number, because it is spendable.
 *
 * Keep this list ahead of the fallback. A model that reaches the fallback is
 * reported as `assumed` by priceUsage(); one that reaches neither is reported as
 * unpriced rather than free.
 */
export const DEFAULT_PRICES = {
  // Claude 5 family
  'claude-fable-5':    { input: 10,  output: 50 },
  'claude-mythos-5':   { input: 10,  output: 50 },
  'claude-opus-5':     { input: 5,   output: 25 },
  'claude-sonnet-5':   { input: 2,   output: 10 },
  // Claude 4.6–4.8
  'claude-opus-4-8':   { input: 5,   output: 25 },
  'claude-opus-4-7':   { input: 5,   output: 25 },
  'claude-opus-4-6':   { input: 5,   output: 25 },
  'claude-sonnet-4-6': { input: 3,   output: 15 },
  'claude-haiku-4-5':  { input: 1,   output: 5 },
  // Claude 4.x family (bare ids; OpenRouter "anthropic/<id>" slugs resolve via prefix-strip)
  'claude-opus-4':     { input: 15,  output: 75 },
  'claude-sonnet-4':   { input: 3,   output: 15 },
  'claude-haiku-4':    { input: 0.8, output: 4 },
  // Claude 3.x (still referenced by some evals/agents)
  'claude-3-5-sonnet': { input: 3,   output: 15 },
  'claude-3-5-haiku':  { input: 0.8, output: 4 },
  'claude-3-opus':     { input: 15,  output: 75 },
  // OpenRouter non-Anthropic slugs the project routes to (approx list prices —
  // override via ~/.great_cto/model-prices.json or GREAT_CTO_MODEL_PRICES).
  'moonshotai/kimi-k2':  { input: 0.55, output: 2.2 },
  'moonshotai/kimi-k3':  { input: 3,    output: 15 },
  // Read from OpenRouter's /models on 2026-08-27, not guessed. Until now these
  // reported `priced: false` — correctly, and that honesty is why an eval run on
  // glm-5.3-flash showed $0.000: not free, unpriced. Now they are priced exactly.
  'z-ai/glm-5.3-flash': { input: 0.075, output: 0.25 },
  'z-ai/glm-5.3':       { input: 1.4,   output: 4.4 },
};

/**
 * NOT modelled, and named here so it is a known gap rather than a silent one:
 * Opus 5 fast mode bills at $10/$50 instead of $5/$25. Turns carry the rate they
 * ran at in `usage.speed`, which this module does not read — a fast-mode turn is
 * therefore under-costed by 2×. Wire it when a transcript in the wild shows
 * `speed: "fast"`; until then the figure is right for standard turns and low for
 * fast ones, which is the direction that does not create false confidence.
 */
export const UNMODELLED_RATES = Object.freeze(['opus-5 fast mode ($10/$50)']);

/** Load price overrides from env (preferred) then ~/.great_cto/model-prices.json. */
export function loadPriceOverrides() {
  try {
    if (process.env.GREAT_CTO_MODEL_PRICES) return JSON.parse(process.env.GREAT_CTO_MODEL_PRICES);
  } catch { /* malformed env JSON → ignore */ }
  try {
    return JSON.parse(readFileSync(join(homedir(), '.great_cto', 'model-prices.json'), 'utf8'));
  } catch { /* no override file → ignore */ }
  return {};
}

/** Effective price table = defaults merged with overrides. */
export function effectivePrices() {
  return { ...DEFAULT_PRICES, ...loadPriceOverrides() };
}

/**
 * Resolve a per-MTok price for a model id.
 *   1. exact key match
 *   2. longest prefix match (so "claude-opus-4-8-2026..." → "claude-opus-4")
 *   3. family heuristic on /opus|sonnet|haiku/
 * Returns { input, output } in USD/MTok, or null if unknown.
 */
export function priceForModel(model, prices = effectivePrices()) {
  if (!model) return null;
  if (prices[model]) return prices[model];                       // exact (incl. full OpenRouter slug)

  // Strip a leading "provider/" segment so OpenRouter slugs like
  // "anthropic/claude-sonnet-4" resolve to the bare "claude-sonnet-4" key.
  const bare = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model;
  if (prices[bare]) return prices[bare];

  let best = null, bestLen = 0;
  for (const k of Object.keys(prices)) {
    if (bare.startsWith(k) && k.length > bestLen) { best = prices[k]; bestLen = k.length; }
  }
  if (best) return best;

  if (/opus/i.test(model))   return prices['claude-opus-4']   || { input: 15,  output: 75 };
  if (/sonnet/i.test(model)) return prices['claude-sonnet-4'] || { input: 3,   output: 15 };
  if (/haiku/i.test(model))  return prices['claude-haiku-4']  || { input: 0.8, output: 4 };
  return null;
}

/**
 * The same lookup, but it says HOW it found the price.
 *
 * `priceForModel` answers with a number or null, and both callers and readers
 * then treat "priced exactly" and "priced by guessing the family" as the same
 * thing. They are not. `claude-opus-5` is billed here at Opus 4's rate because
 * its name contains "opus" — a guess that may be right and is not a fact, and a
 * total built from it should be able to say so.
 *
 * @returns {{price: {input:number,output:number}|null, source: 'exact'|'bare'|'prefix'|'family'|'none'}}
 */
export function resolvePrice(model, prices = effectivePrices()) {
  if (!model) return { price: null, source: 'none' };
  if (prices[model]) return { price: prices[model], source: 'exact' };

  const bare = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model;
  if (prices[bare]) return { price: prices[bare], source: 'bare' };

  let best = null, bestLen = 0;
  for (const k of Object.keys(prices)) {
    if (bare.startsWith(k) && k.length > bestLen) { best = prices[k]; bestLen = k.length; }
  }
  if (best) return { price: best, source: 'prefix' };

  if (/opus/i.test(model))   return { price: prices['claude-opus-4']   || { input: 15,  output: 75 }, source: 'family' };
  if (/sonnet/i.test(model)) return { price: prices['claude-sonnet-4'] || { input: 3,   output: 15 }, source: 'family' };
  if (/haiku/i.test(model))  return { price: prices['claude-haiku-4']  || { input: 0.8, output: 4 }, source: 'family' };
  return { price: null, source: 'none' };
}

/**
 * Cost of one call, with the third state kept.
 *
 * `costForUsage` returns a number, so an unknown model has to come back as 0 —
 * and a model nobody has priced then reads as a model that costs nothing.
 * 172 turns of `claude-fable-5` were billed at $0.00 for exactly that reason,
 * and the total looked like a total rather than a total plus a hole.
 *
 * @returns {{usd:number, priced:boolean, assumed:boolean, source:string, model:string}}
 */
export function priceUsage({ model, usage, prices }) {
  const { price, source } = resolvePrice(model, prices || effectivePrices());
  if (!usage || !price) {
    return { usd: 0, priced: false, assumed: false, source, model: model || '' };
  }
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const usd = (inTok * price.input + outTok * price.output
             + cacheWrite * price.input * 1.25 + cacheRead * price.input * 0.1) / 1_000_000;
  return { usd, priced: true, assumed: source === 'family', source, model: model || '' };
}

/**
 * Dollar cost of a single API call.
 * @param {object} opts
 * @param {string} opts.model
 * @param {{input_tokens?:number, output_tokens?:number}} opts.usage  Anthropic response.usage
 * @param {object} [opts.prices]  override table (for tests)
 * @returns {number} USD (0 if usage or price unknown)
 */
export function costForUsage({ model, usage, prices }) {
  if (!usage) return 0;
  const p = priceForModel(model, prices);
  if (!p) return 0;
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  // Prompt-caching tokens bill at Anthropic's standard multipliers off the base
  // input price: cache WRITE = 1.25× input, cache READ = 0.1× input. Ignoring
  // them under-counts real spend badly (a cached turn is often 50k+ cache tokens
  // vs a few hundred fresh input tokens).
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  return (inTok * p.input + outTok * p.output
        + cacheWrite * p.input * 1.25 + cacheRead * p.input * 0.1) / 1_000_000;
}

export function round4(n) { return Math.round(n * 10000) / 10000; }

// ── CLI: compute one cost from args/env (used by log-verdict.sh `auto` mode) ──
//   node scripts/lib/cost-meter.mjs --model M --in 1234 --out 567
//   prints the USD number (4 dp) to stdout.
function main(argv) {
  let model = process.env.LLM_MODEL || '';
  let inTok = parseInt(process.env.LLM_INPUT_TOKENS || '0', 10) || 0;
  let outTok = parseInt(process.env.LLM_OUTPUT_TOKENS || '0', 10) || 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model' && argv[i + 1]) model = argv[++i];
    else if (argv[i] === '--in' && argv[i + 1]) inTok = parseInt(argv[++i], 10) || 0;
    else if (argv[i] === '--out' && argv[i + 1]) outTok = parseInt(argv[++i], 10) || 0;
  }
  // No tokens means the caller never had a usage block to hand us — a
  // measurement that did not happen. Printing 0 here made every verdict in the
  // fleet record a MEASURED zero: the portfolio reported $0.00 spend for twelve
  // projects, and a per-agent budget would have read "spent $0.00 of $25,
  // measured" forever. All 35 agents pass `auto`, so this was every verdict.
  //
  // Exit 2 with nothing on stdout. `log-verdict.sh` omits the field, and every
  // reader downstream already distinguishes an absent cost from a zero one —
  // portfolio.mjs calls it "spend nobody recorded", agent-budget.mjs calls it
  // `unmeasured`. They were right and had nothing to be right about.
  if (inTok <= 0 && outTok <= 0) {
    process.stderr.write('cost-meter: no token usage supplied — cost not measured\n');
    return process.exit(2);
  }
  const cost = costForUsage({ model, usage: { input_tokens: inTok, output_tokens: outTok } });
  process.stdout.write(String(round4(cost)));
}

import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
