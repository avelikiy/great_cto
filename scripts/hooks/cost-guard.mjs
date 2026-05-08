#!/usr/bin/env node
/**
 * UserPromptSubmit hook — cost-cap awareness.
 *
 * If the user prompt looks like an expensive operation (architect-level work
 * or a security audit), and the project has a cost-cap configured, emit a
 * gentle warning to stderr.
 *
 * Hook protocol:
 *   stdin:  { prompt, session_id, ... }   (Claude Code UserPromptSubmit payload)
 *   stdout: nothing
 *   exit:   0 always (never block; this is informational only)
 *
 * Opt-out: GREAT_CTO_DISABLE_COST_GUARD=1
 *
 * @see docs/HOOKS.md
 */

import { readFileSync } from 'node:fs';

const EXPENSIVE_PATTERNS = [
  /\barchitect\s+(?:this|my|the)\b/i,
  /\bdesign\s+(?:the|a|an)\s+architecture\b/i,
  /\bfull\s+(?:audit|security\s+review|threat\s+model)\b/i,
  /(?:^|\s)\/start\b/,
  /(?:^|\s)\/audit\b/,
  /\brefactor\s+(?:the\s+)?(?:entire|whole)\b/i,
];

const ROUGH_COST_USD = {
  '/start':     { lo: 5,  hi: 15  },
  '/audit':     { lo: 3,  hi: 10  },
  'architect':  { lo: 2,  hi: 6   },
  'security':   { lo: 1,  hi: 3   },
  'refactor':   { lo: 5,  hi: 25  },
};

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function extractPrompt(input) {
  try {
    const parsed = JSON.parse(input);
    return parsed.prompt || parsed.user_prompt || '';
  } catch { return ''; }
}

function matchOperation(prompt) {
  if (/\/start\b/.test(prompt))    return ['/start', '/start'];
  if (/\/audit\b/.test(prompt))    return ['/audit', '/audit'];
  if (/architect/i.test(prompt))   return ['architect', 'architect-level work'];
  if (/security|threat|audit/i.test(prompt)) return ['security', 'security audit'];
  if (/refactor/i.test(prompt))    return ['refactor', 'large refactor'];
  return null;
}

function readCostCap() {
  try {
    const txt = readFileSync('.great_cto/PROJECT.md', 'utf8');
    // Match: cost-cap-usd-month: 500   OR   cost_cap: 500
    const m = txt.match(/cost[-_]cap(?:[-_]usd[-_]month)?:\s*(\d+(?:\.\d+)?)/i);
    return m ? parseFloat(m[1]) : null;
  } catch { return null; }
}

function readRecentCost() {
  try {
    const txt = readFileSync('.great_cto/cost-history.log', 'utf8');
    const lines = txt.trim().split('\n').filter(Boolean);
    // Each line: "2026-05-08T10:00:00Z agent=architect cost_usd=2.40"
    let total = 0;
    for (const line of lines) {
      const m = line.match(/cost[-_]?usd[=:]\s*(\d+(?:\.\d+)?)/i);
      if (m) total += parseFloat(m[1]);
    }
    return total;
  } catch { return 0; }
}

function main() {
  if (process.env.GREAT_CTO_DISABLE_COST_GUARD === '1') return process.exit(0);

  const prompt = extractPrompt(readStdin());
  if (!prompt) return process.exit(0);

  const matched = EXPENSIVE_PATTERNS.some((re) => re.test(prompt));
  if (!matched) return process.exit(0);

  const op = matchOperation(prompt);
  if (!op) return process.exit(0);

  const [opKey, opLabel] = op;
  const cost = ROUGH_COST_USD[opKey] || { lo: 1, hi: 5 };
  const cap = readCostCap();
  const spent = readRecentCost();

  let msg = `[great_cto:cost-guard] ${opLabel} typically costs $${cost.lo}-$${cost.hi}`;
  if (cap !== null) {
    const remaining = cap - spent;
    msg += ` · monthly cap $${cap}, spent so far $${spent.toFixed(2)}, remaining $${remaining.toFixed(2)}`;
    if (remaining < cost.hi) {
      msg += `\n  ⚠ may exceed cap — confirm before proceeding.`;
    }
  }
  msg += `\n  (set GREAT_CTO_DISABLE_COST_GUARD=1 to silence)\n`;
  process.stderr.write(msg);

  return process.exit(0);
}

main();
