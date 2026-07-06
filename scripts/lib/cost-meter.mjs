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

/** Default list prices, USD per 1M tokens. Update as pricing changes. */
export const DEFAULT_PRICES = {
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
  'moonshotai/kimi-k2': { input: 0.55, output: 2.2 },
};

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
  const cost = costForUsage({ model, usage: { input_tokens: inTok, output_tokens: outTok } });
  process.stdout.write(String(round4(cost)));
}

import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main(process.argv.slice(2));
