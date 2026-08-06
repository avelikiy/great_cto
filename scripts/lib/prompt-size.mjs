#!/usr/bin/env node
/**
 * prompt-size — what an agent prompt costs, before the bill says so.
 *
 * Why this exists
 * ---------------
 * On 2026-08-05 the eval harness was changed to inline `agents/_shared/*.md`
 * into the actor's system prompt, because forty of sixty-nine agents point at
 * shared contracts the actor could never reach. It was the right fix and it grew
 * devops from 41,993 to 58,415 characters — a 39% increase on the single input
 * that turned out to be ~97% of the run's cost. That was not noticed at commit
 * time. It was noticed two runs and roughly twenty dollars later, while working
 * out where the money went.
 *
 * Nothing in the repo could have answered "what does this prompt cost" before
 * running it. The cost was knowable — the prompt is a file, the price is a
 * published number, the run shape is a flag — and it was found the expensive
 * way instead.
 *
 * Borrowed from repomix, which reports per-file token counts against a context
 * limit rather than making the user discover the limit by hitting it, and from
 * pdf-inspector, whose whole design is classify cheaply, then spend expensively
 * only where the cheap check says to.
 *
 * The token count is an ESTIMATE and says so everywhere. A dependency-free
 * heuristic cannot match a real BPE tokenizer, and pretending otherwise would
 * reproduce the mistake this file exists to prevent — reporting a number more
 * precise than the thing behind it.
 *
 * CLI:
 *   node scripts/lib/prompt-size.mjs --all             # every agent, largest first
 *   node scripts/lib/prompt-size.mjs --agent devops    # one, with a cost estimate
 *   node scripts/lib/prompt-size.mjs --all --json
 *   node scripts/lib/prompt-size.mjs --all --max-tokens 20000   # exit 1 over budget
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandSharedRefs } from '../../tests/eval/runner.mjs';
import { priceForModel } from './cost-meter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AGENTS_DIR = join(ROOT, 'agents');

/**
 * Tokens, approximately.
 *
 * Prose runs near 4 characters per token; markdown tables, code fences and long
 * identifiers run denser because punctuation and symbols rarely merge. Agent
 * files are a mix, so the two are counted separately rather than averaged into a
 * single ratio that is wrong for both.
 *
 * Accurate to roughly ±10% against a real tokenizer, which is the resolution the
 * decisions here need: "this prompt doubled" and "this run will cost about ten
 * dollars" do not turn on the third digit.
 */
export function estimateTokens(text) {
  const s = String(text ?? '');
  if (!s) return 0;
  const fences = s.match(/```[\s\S]*?(```|$)/g) || [];
  const dense = fences.join('') + (s.match(/^\|.*\|$/gm) || []).join('');
  const prose = s.length - dense.length;
  return Math.round(prose / 4 + dense.length / 2.9);
}

/** Strip a leading YAML frontmatter block, if present. */
function stripFrontmatter(text) {
  return String(text).replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

/**
 * One agent's EFFECTIVE prompt — the file plus the `_shared` contracts it points
 * at, which is what the model actually receives.
 *
 * Reporting the file alone is the measurement that missed the 39% growth: the
 * file did not change size, the prompt did.
 */
export function promptProfile(agentName, { root = AGENTS_DIR } = {}) {
  let raw;
  try {
    raw = stripFrontmatter(readFileSync(join(root, `${agentName}.md`), 'utf8'));
  } catch {
    return null;
  }
  const { text, expanded } = expandSharedRefs(raw, { root });
  const own = estimateTokens(raw);
  const total = estimateTokens(text);
  return {
    agent: agentName,
    chars: text.length,
    tokens: total,
    ownTokens: own,
    // What the shared contracts add. A prompt can be small on disk and large in
    // context, and only this column tells them apart.
    sharedTokens: total - own,
    shared: expanded,
  };
}

/** Every agent, largest effective prompt first. */
export function fleetProfile({ root = AGENTS_DIR } = {}) {
  return readdirSync(root)
    .filter((f) => f.endsWith('.md'))
    .map((f) => promptProfile(f.replace(/\.md$/, ''), { root }))
    .filter(Boolean)
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * What one eval run of this prompt costs, with and without prompt caching.
 *
 * The system prompt is re-sent on every turn of every case, so the multiplier is
 * cases x turns — which is why a 16k-token prompt is not a 16k-token expense.
 * A cache read bills at a tenth of fresh input and the first send pays 1.25x to
 * write it, the same multipliers cost-meter applies.
 */
export function runCost({ tokens, cases = 40, turns = 2, outputTokens = 600, model = 'anthropic/claude-sonnet-4' }) {
  const p = priceForModel(model);
  if (!p) return null;
  const sends = cases * turns;
  const out = (sends * outputTokens * p.output) / 1e6;
  const uncached = (sends * tokens * p.input) / 1e6 + out;
  // One write, the rest reads — the prefix is identical across cases and turns.
  const cached = ((tokens * 1.25 + (sends - 1) * tokens * 0.1) * p.input) / 1e6 + out;
  return { sends, uncached, cached, saved: uncached - cached, savedPct: uncached ? (uncached - cached) / uncached : 0 };
}

const usd = (n) => `$${n.toFixed(2)}`;

export function formatFleet(rows, { maxTokens = null } = {}) {
  const lines = [
    `${'agent'.padEnd(28)}${'tokens'.padStart(8)}${'shared'.padStart(9)}  contracts`,
    '─'.repeat(78),
  ];
  for (const r of rows) {
    const over = maxTokens && r.tokens > maxTokens ? '  ← over budget' : '';
    lines.push(
      r.agent.padEnd(28) +
      String(r.tokens).padStart(8) +
      String(r.sharedTokens || 0).padStart(9) + '  ' +
      (r.shared.length ? r.shared.map((s) => s.replace(/\.md$/, '')).join(' ') : '—') +
      over,
    );
  }
  const total = rows.reduce((a, r) => a + r.tokens, 0);
  lines.push('─'.repeat(78));
  lines.push(`${rows.length} agents · ${total} tokens estimated · median ${median(rows.map((r) => r.tokens))}`);
  lines.push('Estimates, ±~10% against a real tokenizer — enough to see a prompt double, not to bill from.');
  return lines.join('\n');
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const maxTokens = arg('--max-tokens') ? Number(arg('--max-tokens')) : null;
  const one = arg('--agent');

  if (one) {
    const p = promptProfile(one);
    if (!p) { console.error(`no agents/${one}.md`); return 2; }
    const c = runCost({ tokens: p.tokens, cases: Number(arg('--cases') || 40), turns: Number(arg('--turns') || 2) });
    if (argv.includes('--json')) { console.log(JSON.stringify({ ...p, cost: c }, null, 2)); return 0; }
    console.log(`${p.agent}: ~${p.tokens} tokens (${p.ownTokens} own + ${p.sharedTokens} shared)`);
    console.log(`  contracts: ${p.shared.length ? p.shared.join(', ') : '—'}`);
    if (c) {
      console.log(`  a run of ${c.sends} sends: ${usd(c.uncached)} uncached, ${usd(c.cached)} cached`
        + ` — ${usd(c.saved)} (${(c.savedPct * 100).toFixed(0)}%)`);
    }
    console.log('  estimated, ±~10%.');
    return maxTokens && p.tokens > maxTokens ? 1 : 0;
  }

  const rows = fleetProfile();
  if (argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); return 0; }
  console.log(formatFleet(rows, { maxTokens }));

  const over = maxTokens ? rows.filter((r) => r.tokens > maxTokens) : [];
  if (over.length) {
    console.log(`\n${over.length} agent(s) over ${maxTokens} tokens: ${over.map((r) => r.agent).join(', ')}`);
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
