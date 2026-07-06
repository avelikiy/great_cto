#!/usr/bin/env node
/**
 * usage-from-transcript.mjs — measure REAL LLM cost from a Claude Code session
 * transcript (.jsonl), instead of estimating from task-minutes.
 *
 * pxpipe's discipline: measure actual token deltas, don't estimate. Claude Code
 * writes each assistant turn to the session transcript as
 *   { type: "assistant", message: { model, usage: { input_tokens, output_tokens,
 *                                     cache_creation_input_tokens, cache_read_input_tokens } } }
 * We sum that usage per model and price it via cost-meter (cache tokens included).
 *
 * The SubagentStop hook feeds this the subagent's transcript_path so every agent
 * run records a MEASURED cost=$X into its verdict — no agent self-report needed.
 *
 * Library:  import { usageFromTranscript } from './usage-from-transcript.mjs';
 * CLI:      node usage-from-transcript.mjs <transcript.jsonl> [--json]
 */
import { readFileSync, statSync } from 'node:fs';
import { costForUsage, round4 } from './cost-meter.mjs';

// Guard against pathological transcripts — a few MB is normal; cap the read.
const MAX_BYTES = 64 * 1024 * 1024;

/**
 * @param {string} input  path to a .jsonl transcript, OR raw jsonl text
 * @returns {{ usd:number, turns:number, input_tokens:number, output_tokens:number,
 *             cache_creation_input_tokens:number, cache_read_input_tokens:number,
 *             by_model:Record<string,{usd:number, turns:number}> }}
 */
export function usageFromTranscript(input) {
  const empty = { usd: 0, turns: 0, input_tokens: 0, output_tokens: 0,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0, by_model: {} };
  let text = '';
  try {
    const trimmed = String(input).trimStart();
    // JSONL text starts with '{' (or '['); anything else is treated as a path.
    if (trimmed[0] === '{' || trimmed[0] === '[') {
      text = input;
    } else {
      const st = statSync(input);
      if (st.size > MAX_BYTES) return empty;
      text = readFileSync(input, 'utf8');
    }
  } catch { return empty; }

  const totals = { ...empty, by_model: {} };
  for (const line of text.split('\n')) {
    if (!line || line[0] !== '{') continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const msg = o.message || o;
    const usage = msg && msg.usage;
    if (o.type !== 'assistant' || !usage) continue;
    const model = msg.model || o.model || 'unknown';
    if (model === '<synthetic>') continue;   // synthetic/no-op turns are $0
    const usd = costForUsage({ model, usage });
    totals.usd += usd;
    totals.turns += 1;
    totals.input_tokens += usage.input_tokens || 0;
    totals.output_tokens += usage.output_tokens || 0;
    totals.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
    totals.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
    const bm = totals.by_model[model] || (totals.by_model[model] = { usd: 0, turns: 0 });
    bm.usd += usd; bm.turns += 1;
  }
  totals.usd = round4(totals.usd);
  for (const m of Object.keys(totals.by_model)) totals.by_model[m].usd = round4(totals.by_model[m].usd);
  return totals;
}

// ── CLI ──────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const path = args.find(a => !a.startsWith('--'));
  if (!path) { console.error('usage: usage-from-transcript.mjs <transcript.jsonl> [--json]'); process.exit(2); }
  const r = usageFromTranscript(path);
  if (json) console.log(JSON.stringify(r, null, 2));
  else console.log(`$${r.usd.toFixed(4)}  (${r.turns} turns · in ${r.input_tokens} · out ${r.output_tokens} · cache ${r.cache_creation_input_tokens + r.cache_read_input_tokens})`);
}
